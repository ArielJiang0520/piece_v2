import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { and, asc, eq, gte, isNull } from 'drizzle-orm'
import { db, promptClusters, prompts, worldChatMessages } from '../../db'
import { type Variables, authMiddleware } from '../../middleware'
import { findUserWorld, getModelById, getUserId, paramInt } from '../../route-helpers'
import { CHAT_MODEL_ID } from '../../../src/preferences/generationModel'
import { openRouterProvider } from '../../openrouter-provider'
import { readServerSentEvents } from '../../../src/utils/sse'
import { clearGeneration, registerGeneration, withGenerationSlot } from '../../generation-lock'
import { budgeted } from '../../llm-budget'
import { describeStreamError, parseOpenRouterError } from '../../openrouter-errors'
import { worldBodyWithAdditions } from '../../world-additions'

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

// One thread per subject, and the subject is what the bot can see. Every bot gets the world —
// none of them can talk about a prompt without knowing what it is set in — and what separates
// them is whether a prompt is on the table, and which one.
type ChatSubject =
  | { kind: 'world' }
  | { kind: 'new-prompt'; worldVersionId: number }
  | { kind: 'cluster'; clusterId: number }

// Deliberately minimal: the material, at most one line naming the job, and the language rule.
// No format instructions anywhere — not a length, not a shape, not a marker to parse. The bot
// answers however it wants and the writer reads it; if a reply is too long they say so in the
// next turn, out loud, and can see whether it worked.
function buildSystemPrompt(subject: ChatSubject, worldBody: string, clusterPrompt: string): string {
  const sections: string[] = []
  const worldReference = worldBody.trim()
  if (worldReference) {
    sections.push(`# World setting\n${worldReference}`)
  }
  if (subject.kind === 'cluster') {
    const promptText = clusterPrompt.trim()
    if (promptText) sections.push(`# The prompt being worked on\n${promptText}`)
    sections.push(`# Your job\nThe writer is working on the prompt above — the premise for a story set in this world. Help them with it, working to what they ask for.`)
  } else if (subject.kind === 'new-prompt') {
    // Working to a brief, never ranging over the world on its own and producing a premise
    // unasked — that is what the deleted ideas.ts did.
    sections.push(`# Your job\nThe writer is working out a new prompt — the premise for a story set in this world. Help them build it, working to what they ask for.`)
  }
  // Last, where it is closest to the answer: these instructions are in English and the writer's
  // world usually is not, and a model follows the language it was addressed in unless told otherwise.
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

// Which rows belong to this thread. The subject columns are the whole answer — a world row has
// neither set, so it can never be picked up by one of the others.
function subjectFilter(subject: ChatSubject) {
  if (subject.kind === 'cluster') return eq(worldChatMessages.cluster_id, subject.clusterId)
  if (subject.kind === 'new-prompt') {
    return and(
      isNull(worldChatMessages.cluster_id),
      eq(worldChatMessages.world_version_id, subject.worldVersionId),
    )
  }
  return and(isNull(worldChatMessages.cluster_id), isNull(worldChatMessages.world_version_id))
}

function subjectColumns(subject: ChatSubject) {
  return {
    cluster_id: subject.kind === 'cluster' ? subject.clusterId : null,
    world_version_id: subject.kind === 'new-prompt' ? subject.worldVersionId : null,
  }
}

function loadThread(userId: number, worldId: number, subject: ChatSubject) {
  return db
    .select({
      id: worldChatMessages.id,
      role: worldChatMessages.role,
      content: worldChatMessages.content,
      created_at: worldChatMessages.created_at,
    })
    .from(worldChatMessages)
    .where(and(
      eq(worldChatMessages.user_id, userId),
      eq(worldChatMessages.world_id, worldId),
      subjectFilter(subject),
    ))
    .orderBy(asc(worldChatMessages.created_at), asc(worldChatMessages.id))
    .all()
}

type SubjectKind = ChatSubject['kind']

interface ResolvedSubject {
  userId: number
  worldId: number
  world: NonNullable<ReturnType<typeof findUserWorld>>
  subject: ChatSubject
  // The cluster's current text — its latest prompt, never a raw earlier row. Empty for the
  // other two threads, which have no prompt on the table.
  clusterPrompt: string
}

// The version is never sent by the client: it is the world's checked-out one, the same
// "pinned, not chosen" rule the model id follows.
function resolveSubject(c: any, kind: SubjectKind): ResolvedSubject | null {
  const userId = getUserId(c)
  const worldId = paramInt(c, 'id')
  const world = findUserWorld(userId, worldId)
  if (!world) return null

  if (kind === 'world') {
    return { userId, worldId, world, subject: { kind: 'world' }, clusterPrompt: '' }
  }

  // Below the world, everything is owned by a version, so a world without a checked-out one has
  // nowhere to put these threads. Migration gives every world a HEAD, so this is unreachable.
  const worldVersionId = world.current_version_id
  if (worldVersionId == null) return null

  if (kind === 'new-prompt') {
    return { userId, worldId, world, subject: { kind: 'new-prompt', worldVersionId }, clusterPrompt: '' }
  }

  const clusterId = paramInt(c, 'clusterId')
  const cluster = db
    .select({ id: promptClusters.id, world_version_id: promptClusters.world_version_id, latest_prompt_id: promptClusters.latest_prompt_id })
    .from(promptClusters)
    .where(and(
      eq(promptClusters.id, clusterId),
      eq(promptClusters.world_id, worldId),
      eq(promptClusters.user_id, userId),
    ))
    .get()
  // A cluster lives in exactly one world version, and only the checked-out one is on the table —
  // the same containment rule pieces.ts enforces for versionSourcePromptId.
  if (!cluster || cluster.world_version_id !== worldVersionId) return null

  const latest = cluster.latest_prompt_id == null
    ? null
    : db
      .select({ text: prompts.text })
      .from(prompts)
      .where(and(eq(prompts.id, cluster.latest_prompt_id), eq(prompts.cluster_id, cluster.id)))
      .get()

  return {
    userId,
    worldId,
    world,
    subject: { kind: 'cluster', clusterId: cluster.id },
    clusterPrompt: latest?.text ?? '',
  }
}

const getThread = (kind: SubjectKind) => (c: any) => {
  const resolved = resolveSubject(c, kind)
  if (!resolved) return c.json({ error: 'Not found' }, 404)
  return c.json(loadThread(resolved.userId, resolved.worldId, resolved.subject))
}

const clearThread = (kind: SubjectKind) => (c: any) => {
  const resolved = resolveSubject(c, kind)
  if (!resolved) return c.json({ error: 'Not found' }, 404)

  db.delete(worldChatMessages)
    .where(and(
      eq(worldChatMessages.user_id, resolved.userId),
      eq(worldChatMessages.world_id, resolved.worldId),
      subjectFilter(resolved.subject),
    ))
    .run()
  return c.json({ cleared: true })
}

const postTurn = (kind: SubjectKind) => async (c: any) => {
  const resolved = resolveSubject(c, kind)
  if (!resolved) return c.json({ error: 'Not found' }, 404)
  const { userId, worldId, world, subject, clusterPrompt } = resolved

  const { message, replace_from_id: replaceFromId, additionIds } = await c.req.json().catch(() => ({}))
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
        subjectFilter(subject),
      ))
      .get()
    if (target && target.role === 'user') {
      db.delete(worldChatMessages)
        .where(and(
          eq(worldChatMessages.user_id, userId),
          eq(worldChatMessages.world_id, worldId),
          subjectFilter(subject),
          gte(worldChatMessages.id, target.id),
        ))
        .run()
    }
  }

  // Pinned, not chosen: which model talks about a world is a fixture of the feature, and the
  // client never sends one.
  const modelOption = getModelById(CHAT_MODEL_ID)
  if (!modelOption) return c.json({ error: 'Chat model is not configured' }, 500)

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return c.json({ error: 'OPENROUTER_API_KEY is not set on the server' }, 500)

  const history = loadThread(userId, worldId, subject).slice(-HISTORY_TURNS)

  const now = Date.now()
  db.insert(worldChatMessages)
    .values({
      user_id: userId,
      world_id: worldId,
      ...subjectColumns(subject),
      role: 'user',
      content: messageText,
      created_at: now,
    })
    .run()

  const messages = [
    {
      role: 'system',
      content: buildSystemPrompt(
        subject,
        worldBodyWithAdditions(userId, worldId, world.current_version_id, world.body, additionIds),
        clusterPrompt,
      ),
    },
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

        const provider = openRouterProvider(modelOption.preferredProviders)

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
          .values({
            user_id: userId,
            world_id: worldId,
            ...subjectColumns(subject),
            role: 'assistant',
            content: reply,
            created_at: Date.now(),
          })
          .run()
      }
      // `done` goes out only once the turn is on disk, and carries the authoritative thread
      // with it. Without this the client would refetch the instant the stream ended and race
      // the insert above — winning that race meant the reply vanished off the screen.
      if (!controller.signal.aborted) {
        try {
          await stream.writeSSE({
            data: JSON.stringify({ type: 'done', messages: loadThread(userId, worldId, subject) }),
          })
        } catch {
          // The client hung up first; its own refetch will pick the thread up.
        }
      }
    }
  })
}

// Three threads, one handler set. What differs between them is the subject: what the bot can
// see, and which rows are its history. Everything else — the single-session slot, the abort by
// `userId:worldId`, retry handling, the `done`-after-persist contract, edit/regenerate via
// replace_from_id — is shared.
const SUBJECT_PATHS = [
  ['/', 'world'],
  ['/new-prompt', 'new-prompt'],
  ['/cluster/:clusterId', 'cluster'],
] as const

for (const [path, kind] of SUBJECT_PATHS) {
  chatRoutes.get(path, authMiddleware, getThread(kind))
  chatRoutes.delete(path, authMiddleware, clearThread(kind))
  chatRoutes.post(path, authMiddleware, postTurn(kind))
}

export default chatRoutes
