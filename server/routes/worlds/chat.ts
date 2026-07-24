import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { and, asc, eq, gte } from 'drizzle-orm'
import { db, worldChatMessages } from '../../db'
import { type Variables, authMiddleware } from '../../middleware'
import { findUserWorld, getModelById, getUserId, paramInt } from '../../route-helpers'
import { BLACKLISTED_PROVIDERS, SIMILAR_MODEL_ID } from '../../../src/preferences/generationModel'
import { readServerSentEvents } from '../../../src/utils/sse'
import { clearGeneration, registerGeneration, withGenerationSlot } from '../../generation-lock'
import { budgeted } from '../../llm-budget'
import { describeStreamError, parseOpenRouterError } from '../../openrouter-errors'

const chatRoutes = new Hono<{ Variables: Variables }>()

// Same owner key as story generation (`generate.ts`): a chat turn and a story run for the
// same world can never overlap — starting one aborts the other.
function ownerKey(userId: number, worldId: number) {
  return `${userId}:${worldId}`
}

// The world is the whole point of this chat, and it goes in whole — the one size limit lives at
// the call itself (llm-budget.ts). The thread is capped by turns, which is a count, not a knife.
// How much of the thread the model sees. Older turns simply fall off; no summarization.
const HISTORY_TURNS = 20
const CHAT_TEMPERATURE = 0.7

const RETRYABLE_STATUSES = new Set([429, 502, 503])
const MAX_ATTEMPTS = 3
const MAX_RETRY_WAIT_MS = 20_000

// Deliberately minimal: the world, and the language rule. No role, no task, no rules about
// how to answer — the writer asks their own questions and steers the conversation themselves.
function buildSystemPrompt(worldBody: string): string {
  const sections: string[] = []
  const worldReference = worldBody.trim()
  if (worldReference) {
    sections.push(`# World setting\n${worldReference}`)
  }
  sections.push(
    `# Language\nRegardless of the language of these instructions, always reply in the same language as the user's message.`,
  )
  return sections.join('\n\n')
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal.aborted) return resolve()
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      resolve()
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function loadThread(userId: number, worldId: number) {
  return db
    .select({
      id: worldChatMessages.id,
      role: worldChatMessages.role,
      content: worldChatMessages.content,
      created_at: worldChatMessages.created_at,
    })
    .from(worldChatMessages)
    .where(and(eq(worldChatMessages.user_id, userId), eq(worldChatMessages.world_id, worldId)))
    .orderBy(asc(worldChatMessages.created_at), asc(worldChatMessages.id))
    .all()
}

chatRoutes.get('/', authMiddleware, (c) => {
  const userId = getUserId(c)
  const worldId = paramInt(c, 'id')
  if (!findUserWorld(userId, worldId)) return c.json({ error: 'Not found' }, 404)
  return c.json(loadThread(userId, worldId))
})

chatRoutes.delete('/', authMiddleware, (c) => {
  const userId = getUserId(c)
  const worldId = paramInt(c, 'id')
  if (!findUserWorld(userId, worldId)) return c.json({ error: 'Not found' }, 404)

  db.delete(worldChatMessages)
    .where(and(eq(worldChatMessages.user_id, userId), eq(worldChatMessages.world_id, worldId)))
    .run()
  return c.json({ cleared: true })
})

chatRoutes.post('/', authMiddleware, async (c: any) => {
  const userId = getUserId(c)
  const worldId = paramInt(c, 'id')
  const world = findUserWorld(userId, worldId)
  if (!world) return c.json({ error: 'Not found' }, 404)

  const { message, model: requestedModel, replace_from_id: replaceFromId } = await c.req.json().catch(() => ({}))
  const messageText = typeof message === 'string' ? message.trim() : ''
  if (!messageText) return c.json({ error: 'Message required' }, 400)

  // Editing a sent message and regenerating a reply are the same operation: drop the named
  // user turn and everything after it, then send the (possibly edited) text as a fresh turn.
  // The truncated tail is gone — this chat keeps no branching history.
  if (typeof replaceFromId === 'number' && Number.isFinite(replaceFromId)) {
    const target = db
      .select({ id: worldChatMessages.id, role: worldChatMessages.role })
      .from(worldChatMessages)
      .where(and(
        eq(worldChatMessages.id, replaceFromId),
        eq(worldChatMessages.user_id, userId),
        eq(worldChatMessages.world_id, worldId),
      ))
      .get()
    if (target && target.role === 'user') {
      db.delete(worldChatMessages)
        .where(and(
          eq(worldChatMessages.user_id, userId),
          eq(worldChatMessages.world_id, worldId),
          gte(worldChatMessages.id, target.id),
        ))
        .run()
    }
  }

  // The writer picks the model (shares the story-generation choice on the client); fall back
  // to the pinned model for an absent/invalid pick.
  const modelOption = getModelById(requestedModel) ?? getModelById(SIMILAR_MODEL_ID)
  if (!modelOption) return c.json({ error: 'Chat model is not configured' }, 500)

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return c.json({ error: 'OPENROUTER_API_KEY is not set on the server' }, 500)

  const history = loadThread(userId, worldId).slice(-HISTORY_TURNS)

  const now = Date.now()
  db.insert(worldChatMessages)
    .values({ user_id: userId, world_id: worldId, role: 'user', content: messageText, created_at: now })
    .run()

  const messages = [
    { role: 'system', content: buildSystemPrompt(world.body) },
    ...history.map(turn => ({ role: turn.role, content: turn.content })),
    { role: 'user', content: messageText },
  ]

  return streamSSE(c, async (stream) => {
    const key = ownerKey(userId, worldId)
    const controller = new AbortController()
    registerGeneration(key, controller)
    const abort = () => controller.abort()
    c.req.raw.signal.addEventListener('abort', abort, { once: true })

    // Whatever arrived before a stop/disconnect is still worth keeping, so the thread never
    // ends on an orphan user message.
    let reply = ''

    try {
      await stream.writeSSE({ data: JSON.stringify({ type: 'status', status: 'waiting_provider' }) })

      await withGenerationSlot(async () => {
        if (controller.signal.aborted) return

        const provider: Record<string, unknown> = {
          sort: 'latency',
          require_parameters: true,
          preferred_min_throughput: 30,
        }
        if (modelOption.preferredProviders.length > 0) {
          provider.only = modelOption.preferredProviders
        }
        if (BLACKLISTED_PROVIDERS.length > 0) {
          provider.ignore = BLACKLISTED_PROVIDERS
        }

        let response: Response | null = null
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          if (controller.signal.aborted) return

          console.log('[OpenRouter request]', new Date().toISOString(), {
            owner: key,
            mode: 'chat',
            attempt,
            model: modelOption.id,
          })

          response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            signal: controller.signal,
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(budgeted({
              model: modelOption.id,
              temperature: CHAT_TEMPERATURE,
              reasoning: { effort: 'none' },
              stream: true,
              provider,
              messages,
            }, 'world chat')),
          })

          if (response.ok && response.body) break

          const info = await parseOpenRouterError(response)
          // A 429 is retried only when the provider handed us a Retry-After to honor, so
          // retries never amplify a frequency limit.
          const retrySignalled = info.status === 429
            ? info.retryAfterSeconds != null
            : RETRYABLE_STATUSES.has(info.status)
          const canRetry = retrySignalled && attempt < MAX_ATTEMPTS && !controller.signal.aborted
          console.error('[OpenRouter chat error]', {
            attempt,
            willRetry: canRetry,
            model: modelOption.id,
            provider,
            ...info,
          })

          if (!canRetry) {
            await stream.writeSSE({ data: JSON.stringify({ type: 'error', ...info }) })
            return
          }

          const waitMs = Math.min(
            info.retryAfterSeconds != null ? info.retryAfterSeconds * 1000 : attempt * 2000,
            MAX_RETRY_WAIT_MS,
          )
          await stream.writeSSE({
            data: JSON.stringify({
              type: 'retry',
              attempt,
              status: info.status,
              providerName: info.providerName,
              waitSeconds: Math.ceil(waitMs / 1000),
            }),
          })
          await sleep(waitMs, controller.signal)
        }

        if (!response || !response.ok || !response.body) return

        for await (const data of readServerSentEvents(response.body)) {
          // `done` is emitted below, after the reply has been written to the DB — the client
          // treats it as "persisted", not merely "finished".
          if (data === '[DONE]') return
          try {
            const parsed = JSON.parse(data)

            if (parsed?.error) {
              const info = describeStreamError(parsed.error, 502)
              console.error('[OpenRouter chat stream error]', {
                model: modelOption.id,
                provider,
                error: parsed.error,
              })
              await stream.writeSSE({ data: JSON.stringify({ type: 'error', ...info }) })
              return
            }

            const content = parsed?.choices?.[0]?.delta?.content
            if (content) {
              reply += content
              await stream.writeSSE({ data: JSON.stringify({ type: 'chunk', content }) })
            }
          } catch {
            // ignore malformed chunks
          }
        }
      })
    } catch (err) {
      // A run aborted by replacement, or by the client disconnecting, stays silent.
      if (!controller.signal.aborted) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        await stream.writeSSE({ data: JSON.stringify({ type: 'error', message: msg }) })
      }
    } finally {
      c.req.raw.signal.removeEventListener('abort', abort)
      clearGeneration(key, controller)
      if (reply.trim()) {
        db.insert(worldChatMessages)
          .values({ user_id: userId, world_id: worldId, role: 'assistant', content: reply, created_at: Date.now() })
          .run()
      }
      // `done` goes out only once the turn is on disk, and carries the authoritative thread
      // with it. Without this the client would refetch the instant the stream ended and race
      // the insert above — winning that race meant the reply vanished off the screen.
      if (!controller.signal.aborted) {
        try {
          await stream.writeSSE({
            data: JSON.stringify({ type: 'done', messages: loadThread(userId, worldId) }),
          })
        } catch {
          // The client hung up first; its own refetch will pick the thread up.
        }
      }
    }
  })
})

export default chatRoutes
