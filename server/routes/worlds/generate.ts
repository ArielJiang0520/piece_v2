import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { collections, db } from '../../db'
import { streamSSE } from 'hono/streaming'
import { type Variables, authMiddleware } from '../../middleware'
import { findVisibleWorld, findWorldScene, getModelById, getUserId, paramInt } from '../../route-helpers'
import { normalizePromptInput } from '../../prompt-text'
import { findDraftScene, readDraft } from '../../world-draft'
import { openRouterProvider } from '../../openrouter-provider'
import { readServerSentEvents } from '../../../src/utils/sse'
import { abortGeneration, clearGeneration, registerGeneration, withGenerationSlot } from '../../generation-lock'
import { budgeted } from '../../llm-budget'
import { describeStreamError, parseOpenRouterError } from '../../openrouter-errors'
import { parseWorldBody, renderWorldBody } from '../../../src/worldBody'

const generateRoutes = new Hono<{ Variables: Variables }>()

// One OpenRouter session at a time is enforced per owner: a user's worlds-scoped run.
function ownerKey(userId: number, worldId: number) {
  return `${userId}:${worldId}`
}

// The premise of the collection a published scene is in: the context its scenes share. '' when
// it has none.
function collectionPremise(worldId: number, collectionId: number | null): string {
  if (collectionId === null) return ''
  return db
    .select({ premise: collections.premise })
    .from(collections)
    .where(and(eq(collections.id, collectionId), eq(collections.world_id, worldId)))
    .get()?.premise ?? ''
}

function buildSystemPrompt(worldBody: string, premise: string, instructions: string, continuing: boolean, promptText: string): string {
  const sections: string[] = []
  if (worldBody.trim()) {
    sections.push(`# World setting\n${worldBody.trim()}`)
  }
  // Shared by every scene in the collection this one is in.
  if (premise.trim()) {
    sections.push(`# Premise\nThe user's prompt is one of a set that all share this premise. Treat it as already true when the story begins.\n\n${premise.trim()}`)
  }
  // The author's private notes on how this world's stories are written. Readers never see them.
  if (instructions.trim()) {
    sections.push(`# Author's instructions\nThe world's author wrote these for you. Follow them in every story set in this world.\n\n${instructions.trim()}`)
  }

  sections.push(
    `# Task\nThe user will give you a prompt. Using the world setting above, write a story that responds to the user's prompt while staying faithful to the world.`,
  )

  // When continuing, the assistant message holds the story so far and the user turn asks
  // to extend it. Spell that out so the model never re-reads it as a brief to restart.
  //
  // The original prompt rides along HERE, in the system message, rather than as its own user
  // turn: a standalone "write a story about X" user message is what made these models start
  // over. Stated as a standing brief it does the opposite — it keeps a long continuation from
  // drifting off the premise, which is the only thing the story text alone can't guarantee.
  if (continuing) {
    const continuation = [
      '# Continuation',
      'The assistant message already contains the story so far. Your job is to continue it from its final sentence as the same narrator, in the same scene, language, voice, and tense. Do NOT start over, recap, summarize, or repeat any wording that already appears — write only what happens next.',
    ]
    if (promptText.trim()) {
      continuation.push(
        '',
        'the story so far was written from this prompt, and that prompt IS STILL IN FORCE. It is not satisfied yet. Everything you write next must keep serving it:',
        '',
        '"""',
        promptText.trim(),
        '"""',
      )
    }
    sections.push(continuation.join('\n'))
  }

  sections.push(
    `# Language\nRegardless of the language of these instructions, always reply in the same language as the user's prompt.`,
  )

  return sections.join('\n\n')
}

const EXPANSION_INSTRUCTION = [
  'Focus ONLY on the final action piece above. Your sole task is to dwell on that single moment.',
  'Do NOT advance the story, introduce new events, or continue toward any earlier goal or prompt — stay on this same moment and keep writing about it:enrich it with more dirty descriptions and more dirty talk dialogues. Let users enjoy it.',
  'Do NOT repeat or rewrite any text already written. Pick up seamlessly from the last sentence so the new prose reads as a natural continuation. Match the existing language, voice, tense, and tone exactly.',
].join('\n')

const CONTINUATION_INSTRUCTION = [
  'Continue the story above from exactly where it stops — pick up at the very next beat.',
  'The prompt this story was written from is in the system message and still stands — keep the continuation working toward it.',
  'Do NOT restart, retell, summarize, or repeat any text already written above.',
  'Write only what happens next, matching the existing scene, language, voice, tense, and tone.',
].join('\n')

// The reader can optionally steer a continuation/expansion. When they do, we append their
// direction as an extra line on the trailing user turn; blank direction leaves the
// instruction byte-identical to the un-steered version.
function withExpansionDirection(direction: string): string {
  if (!direction) return EXPANSION_INSTRUCTION
  return `${EXPANSION_INSTRUCTION}\nThe reader wants this direction for the moment: "${direction}". Honor it while still only dwelling on the final paragraph — do not advance the plot.`
}

function withContinuationDirection(direction: string): string {
  if (!direction) return CONTINUATION_INSTRUCTION
  return `${CONTINUATION_INSTRUCTION}\nThe reader wants the story to go this way next: "${direction}". Steer the continuation toward it while keeping the same scene, voice, and tense.`
}

// The reader's optional steer, as they wrote it.
function normalizeDirection(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
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

// 429 (and transient 502/503) are worth retrying inside the slot — we keep holding the
// single OpenRouter session so nothing else opens a competing socket while we back off.
const RETRYABLE_STATUSES = new Set([429, 502, 503])
const MAX_GENERATION_ATTEMPTS = 3
const MAX_RETRY_WAIT_MS = 20_000

// A "continue"/"expand" turn re-sends the entire story so far as the assistant message, whole.
// It used to be windowed — head plus tail, middle dropped — which meant a long story silently
// continued from a story with a hole in it. The one size limit is at the call (llm-budget.ts).

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

function buildMessages(args: {
  systemPrompt: string
  promptText: string
  priorTextValue: string
  isExpansion: boolean
  isContinuation: boolean
  direction: string
}): ChatMessage[] {
  const { systemPrompt, promptText, priorTextValue, isExpansion, isContinuation, direction } = args
  const system: ChatMessage = { role: 'system', content: systemPrompt }

  // Expansion intentionally omits the original user prompt: the model should loop
  // on and elaborate the last highlighted paragraph only, not continue the story
  // toward whatever the prompt originally asked.
  if (isExpansion) {
    return [
      system,
      { role: 'assistant', content: priorTextValue },
      { role: 'user', content: withExpansionDirection(direction) },
    ]
  }

  // Continuation — both the whole-story "Continue" and the per-paragraph cut. Mirrors the
  // (working) expansion shape: story so far as an assistant message, then a user turn that
  // asks to extend it. The original prompt is not a turn of its own — on these models a
  // standalone "write a story about X" user message is what made the model restart from
  // scratch, and ending the request on an assistant message (prefill) restarts too. It
  // reaches the model through the system prompt's Continuation section instead, so the
  // continuation still knows the brief it is writing toward.
  if (isContinuation) {
    return [
      system,
      { role: 'assistant', content: priorTextValue },
      { role: 'user', content: withContinuationDirection(direction) },
    ]
  }

  return [system, { role: 'user', content: promptText }]
}

generateRoutes.post('/', authMiddleware, async (c: any) => {
  const userId = getUserId(c)
  const worldId = paramInt(c, 'id')
  const world = findVisibleWorld(userId, worldId)
  if (!world) return c.json({ error: 'Not found' }, 404)

  const { sceneId, model: requestedModel, temperature: requestedTemperature, useThinking, mode, priorText, direction, draft } = await c.req.json()

  // Everyone generates from what was last published, the author included — except a creator center test
  // run (draft: true, honored for the author only), which plays the author's draft so they can
  // try it before publishing: sceneId is then the scene's draft key, and its instruction, its
  // collection's premise and the world's body all come from the draft.
  // The model is given the scene's instruction, never its description. A reader's client only
  // names the scene: the instruction is looked up here and never reaches them.
  const isCreatorTest = draft === true && world.user_id === userId
  const worldDraft = isCreatorTest ? readDraft(world) : null
  const draftScene = worldDraft ? findDraftScene(worldDraft, String(sceneId)) : null
  const readerScene = isCreatorTest ? null : findWorldScene(userId, world.id, Number(sceneId))?.scene
  const promptText = normalizePromptInput(draftScene ? draftScene.scene.instruction : readerScene?.instruction)
  if (!promptText) return c.json({ error: 'Scene required' }, 400)
  const premise = draftScene
    ? draftScene.collection?.premise ?? ''
    : collectionPremise(world.id, readerScene?.collection_id ?? null)
  const rawPrior = typeof priorText === 'string' ? priorText : ''
  // Continuation (whole-story "continue" and per-paragraph "regenerate") feeds the kept
  // text back as an assistant prefill, so it keeps the trailing blank line and the model
  // extends from there; expansion trims and re-instructs against the last paragraph.
  const priorTextValue = (mode === 'continue' || mode === 'regenerate')
    ? rawPrior.replace(/^\s+/, '')
    : mode === 'expand' ? rawPrior.trim() : ''
  const isExpansion = mode === 'expand' && priorTextValue.length > 0
  const isContinuation = (mode === 'continue' || mode === 'regenerate') && priorTextValue.length > 0
  // Only a continuation/expansion can be steered; a fresh generation ignores any direction.
  const directionValue = (isExpansion || isContinuation) ? normalizeDirection(direction) : ''

  const worldBody = worldDraft ? worldDraft.body : parseWorldBody(world.body)
  const systemPrompt = buildSystemPrompt(renderWorldBody(worldBody), premise, worldBody.instructions, isContinuation, promptText)

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return c.json({ error: 'OPENROUTER_API_KEY is not set on the server' }, 500)

  const modelOption = getModelById(requestedModel)
  if (!modelOption) return c.json({ error: 'Invalid model requested' }, 400)

  const parsedTemperature = Number(requestedTemperature)
  const temperature = Number.isFinite(parsedTemperature)
    ? Math.min(2, Math.max(0, parsedTemperature))
    : 1

  const messages = buildMessages({
    systemPrompt,
    promptText,
    priorTextValue,
    isExpansion,
    isContinuation,
    direction: directionValue,
  })

  return streamSSE(c, async (stream) => {
    const key = ownerKey(userId, worldId)
    const controller = new AbortController()
    // Registering aborts this owner's prior run immediately so the slot queue drains;
    // the client disconnecting (or hitting /stop) aborts this run the same way.
    registerGeneration(key, controller)
    const abort = () => controller.abort()
    c.req.raw.signal.addEventListener('abort', abort, { once: true })

    try {
      await stream.writeSSE({ data: JSON.stringify({ type: 'status', status: 'waiting_provider' }) })

      // The OpenRouter call only opens inside the slot — never more than one at a time,
      // process-wide. While queued the client keeps showing the waiting state.
      await withGenerationSlot(async () => {
        if (controller.signal.aborted) return

        const provider = openRouterProvider(modelOption.preferredProviders)

        let response: Response | null = null
        for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
          if (controller.signal.aborted) return

          // One log line per actual OpenRouter request, so a burst of requests (rapid
          // taps, StrictMode double-fire, retries) is visible in the server console as
          // a cluster of timestamps for the same owner.
          console.log('[OpenRouter request]', new Date().toISOString(), {
            owner: key,
            mode: mode ?? 'fresh',
            attempt,
            model: modelOption.id,
            directed: directionValue.length > 0,
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
              temperature,
              reasoning: useThinking === true ? modelOption.reasoning : { effort: 'none' },
              stream: true,
              provider,
              messages,
            }, 'story generation')),
          })

          if (response.ok && response.body) break

          const info = await parseOpenRouterError(response)
          // Don't let retries amplify a *frequency* limit: a 429 is retried only when the
          // provider handed us a Retry-After to honor (so we wait, not hammer); transient
          // 5xx get a short backoff. A 429 with no Retry-After surfaces immediately.
          const retrySignalled = info.status === 429
            ? info.retryAfterSeconds != null
            : RETRYABLE_STATUSES.has(info.status)
          const canRetry = retrySignalled
            && attempt < MAX_GENERATION_ATTEMPTS
            && !controller.signal.aborted
          console.error('[OpenRouter generate error]', {
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

          // Honor Retry-After when present, otherwise a gentle exponential backoff.
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

        let providerEmitted = false
        for await (const data of readServerSentEvents(response.body)) {
          if (data === '[DONE]') {
            await stream.writeSSE({ data: JSON.stringify({ type: 'done' }) })
            return
          }
          try {
            const parsed = JSON.parse(data)

            if (!providerEmitted && typeof parsed?.provider === 'string' && parsed.provider) {
              providerEmitted = true
              await stream.writeSSE({ data: JSON.stringify({ type: 'provider', name: parsed.provider }) })
            }

            if (parsed?.error) {
              const info = describeStreamError(parsed.error, 502)
              console.error('[OpenRouter generate stream error]', {
                model: modelOption.id,
                provider,
                error: parsed.error,
              })
              await stream.writeSSE({ data: JSON.stringify({ type: 'error', ...info }) })
              return
            }

            const delta = parsed?.choices?.[0]?.delta
            const reasoning = delta?.reasoning
              ?? delta?.reasoning_content
              ?? delta?.reasoning_details?.map((detail: any) => detail?.text ?? detail?.summary ?? '').join('')
            if (reasoning) {
              await stream.writeSSE({ data: JSON.stringify({ type: 'thinking', content: String(reasoning) }) })
            }

            const content = delta?.content
            if (content) {
              await stream.writeSSE({ data: JSON.stringify({ type: 'chunk', content }) })
            }
          } catch {
            // ignore malformed chunks
          }
        }
      })
    } catch (err) {
      // A run aborted by replacement, /stop, or client disconnect stays silent.
      if (!controller.signal.aborted) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        await stream.writeSSE({ data: JSON.stringify({ type: 'error', message: msg }) })
      }
    } finally {
      c.req.raw.signal.removeEventListener('abort', abort)
      clearGeneration(key, controller)
    }
  })
})

generateRoutes.post('/stop', authMiddleware, async (c: any) => {
  const userId = getUserId(c)
  const worldId = paramInt(c, 'id')
  if (!findVisibleWorld(userId, worldId)) return c.json({ error: 'Not found' }, 404)

  const stopped = abortGeneration(ownerKey(userId, worldId))
  return c.json({ stopped })
})

export default generateRoutes
