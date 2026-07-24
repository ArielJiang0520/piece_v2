import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { type Variables, authMiddleware } from '../../middleware'
import { findUserWorld, findUserWorldId, getModelById, getUserId, paramInt } from '../../route-helpers'
import { normalizePromptInput } from '../../prompt-text'
import { BLACKLISTED_PROVIDERS } from '../../../src/preferences/generationModel'
import { readServerSentEvents } from '../../../src/utils/sse'
import { abortGeneration, clearGeneration, registerGeneration, withGenerationSlot } from '../../generation-lock'
import { budgeted } from '../../llm-budget'
import { describeStreamError, parseOpenRouterError } from '../../openrouter-errors'
import { loadTasteForGeneration } from '../../taste-profile'

const generateRoutes = new Hono<{ Variables: Variables }>()

// One OpenRouter session at a time is enforced per owner: a user's worlds-scoped run.
function ownerKey(userId: number, worldId: number) {
  return `${userId}:${worldId}`
}

function buildSystemPrompt(worldBody: string, continuing: boolean, tasteSection: string): string {
  const sections: string[] = []
  if (worldBody.trim()) {
    sections.push(`# World setting\n${worldBody.trim()}`)
  }

  sections.push(
    `# Task\nThe user will give you a prompt. Using the world setting above, write a story that responds to the user's prompt while staying faithful to the world.`,
  )

  // When continuing, the assistant message holds the story so far and the user turn asks
  // to extend it. Spell that out so the model never re-reads it as a brief to restart.
  if (continuing) {
    sections.push(
      `# Continuation\nThe assistant message already contains the story so far. Your job is to continue it from its final sentence as the same narrator, in the same scene, language, voice, and tense. Do NOT start over, recap, summarize, or repeat any wording that already appears — write only what happens next.`,
    )
  }

  // The reader's distilled taste, injected as a SECONDARY nudge: the world and prompt above
  // decide WHAT happens; this only tints HOW it reads. Deliberately last and softly worded so
  // it never overrides the brief or steers the plot toward past likes (which would just
  // reproduce the same scenes).
  if (tasteSection) {
    sections.push(tasteSection)
  }

  sections.push(
    `# Language\nRegardless of the language of these instructions, always reply in the same language as the user's prompt.`,
  )

  return sections.join('\n\n')
}

// Wrap this world's taste profile in a soft, secondary system-prompt section. Phrased as an
// optional lean-in, never a mandate — so the profile shapes voice and choices without forcing
// the story back onto previously-liked subject matter.
function buildTasteSection(userId: number, worldId: number): string {
  const profile = loadTasteForGeneration(userId, worldId)
  if (!profile) return ''

  return [
    '# Reader sensibilities (secondary — the world setting and the prompt above take precedence)',
    'This is a profile of what this reader responds to, built from the passages they have loved in this world. Treat it as a light seasoning on your voice and choices, NOT as instructions about what to write. Do not force any of it in; never steer the plot just to satisfy it.',
    '',
    profile,
  ].join('\n')
}

const EXPANSION_INSTRUCTION = [
  'Focus ONLY on the final action piece above. Your sole task is to dwell on that single moment.',
  'Do NOT advance the story, introduce new events, or continue toward any earlier goal or prompt — stay on this same moment and keep writing about it:enrich it with more dirty descriptions and more dirty talk dialogues. Let users enjoy it.',
  'Do NOT repeat or rewrite any text already written. Pick up seamlessly from the last sentence so the new prose reads as a natural continuation. Match the existing language, voice, tense, and tone exactly.',
].join('\n')

const CONTINUATION_INSTRUCTION = [
  'Continue the story above from exactly where it stops — pick up at the very next beat.',
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
// It used to be windowed — head plus tail, middle dropped — which meant a long piece silently
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
  // asks to extend it. We deliberately drop the original prompt turn — on these models a
  // standalone "write a story about X" user message is what made the model restart from
  // scratch, and ending the request on an assistant message (prefill) restarts too. The
  // story itself carries all the context the continuation needs.
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
  const world = findUserWorld(userId, worldId)
  if (!world) return c.json({ error: 'Not found' }, 404)

  const { prompt, model: requestedModel, temperature: requestedTemperature, useThinking, useTaste, mode, priorText, direction } = await c.req.json()

  const promptText = normalizePromptInput(prompt)
  if (!promptText) return c.json({ error: 'Prompt required' }, 400)
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

  // The reader can switch the taste profile off; when on, inject this world's taste profile
  // as a soft secondary section.
  const tasteSection = useTaste === true ? buildTasteSection(userId, worldId) : ''
  const systemPrompt = buildSystemPrompt(world.body, isContinuation, tasteSection)

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
  if (!findUserWorldId(userId, worldId)) return c.json({ error: 'Not found' }, 404)

  const stopped = abortGeneration(ownerKey(userId, worldId))
  return c.json({ stopped })
})

export default generateRoutes
