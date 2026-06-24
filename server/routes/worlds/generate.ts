import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { type Variables, authMiddleware } from '../../middleware'
import { findUserWorld, findUserWorldId, getModelById, getUserId, paramInt } from '../../route-helpers'
import { normalizePromptInput } from '../../prompt-text'
import { BLACKLISTED_PROVIDERS } from '../../../src/preferences/generationModel'
import { readServerSentEvents } from '../../../src/utils/sse'
import { abortGeneration, clearGeneration, registerGeneration, withGenerationSlot } from '../../generation-lock'

const generateRoutes = new Hono<{ Variables: Variables }>()

// One OpenRouter session at a time is enforced per owner: a user's worlds-scoped run.
function ownerKey(userId: number, worldId: number) {
  return `${userId}:${worldId}`
}

function buildSystemPrompt(worldBody: string, continuing: boolean): string {
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

  sections.push(
    `# Language\nRegardless of the language of these instructions, always reply in the same language as the user's prompt.`,
  )

  return sections.join('\n\n')
}

const EXPANSION_INSTRUCTION = [
  'Focus ONLY on the final paragraph above. Your sole task is to dwell on that single moment, even writing the same actions repeatedly is fine.',
  'Do NOT advance the story, introduce new events, or continue toward any earlier goal or prompt — stay on this same moment and keep writing about it:enrich it with more dirty descriptions and more dirty talk dialogues. Let users enjoy it.',
  'Do NOT repeat or rewrite any text already written. Pick up seamlessly from the last sentence so the new prose reads as a natural continuation. Match the existing language, voice, tense, and tone exactly.',
].join('\n')

const CONTINUATION_INSTRUCTION = [
  'Continue the story above from exactly where it stops — pick up at the very next beat.',
  'Do NOT restart, retell, summarize, or repeat any text already written above.',
  'Write only what happens next, matching the existing scene, language, voice, tense, and tone.',
].join('\n')

// Structured shape mirrored to the client so the UI can show a real debug message
// (HTTP status, which upstream provider failed, retry timing) instead of a bare string.
// See https://openrouter.ai/docs/api/reference/errors-and-debugging
interface OpenRouterErrorInfo {
  status: number
  message: string
  providerName?: string
  errorType?: string
  retryAfterSeconds?: number
  raw?: string
}

function stringifyRaw(raw: unknown): string | undefined {
  if (raw == null) return undefined
  return typeof raw === 'string' ? raw : JSON.stringify(raw)
}

// OpenRouter returns Retry-After on 429s; honor it before retrying. Supports both the
// delta-seconds and HTTP-date forms.
function readRetryAfter(response: Response): number | undefined {
  const header = response.headers.get('retry-after')
  if (!header) return undefined
  const seconds = Number(header)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds)
  const when = Date.parse(header)
  if (!Number.isNaN(when)) return Math.max(0, Math.ceil((when - Date.now()) / 1000))
  return undefined
}

async function parseOpenRouterError(response: Response): Promise<OpenRouterErrorInfo> {
  const info: OpenRouterErrorInfo = {
    status: response.status,
    message: `OpenRouter ${response.status} ${response.statusText}`.trim(),
    retryAfterSeconds: readRetryAfter(response),
  }
  const rawBody = await response.text().catch(() => '')
  if (!rawBody) return info

  try {
    const parsed = JSON.parse(rawBody) as any
    const err = parsed?.error
    const metadata = err?.metadata
    const message = err?.message ?? metadata?.raw ?? parsed?.message
    if (typeof message === 'string' && message) info.message = message
    if (typeof metadata?.provider_name === 'string') info.providerName = metadata.provider_name
    if (typeof metadata?.error_type === 'string') info.errorType = metadata.error_type
    info.raw = stringifyRaw(metadata?.raw)
  } catch {
    info.raw = rawBody
  }
  return info
}

// Mid-stream errors arrive as an SSE payload with the same error/metadata shape.
function describeStreamError(error: any, fallbackStatus: number): OpenRouterErrorInfo {
  const metadata = error?.metadata
  return {
    status: typeof error?.code === 'number' ? error.code : fallbackStatus,
    message: typeof error?.message === 'string' ? error.message : JSON.stringify(error),
    providerName: typeof metadata?.provider_name === 'string' ? metadata.provider_name : undefined,
    errorType: typeof metadata?.error_type === 'string' ? metadata.error_type : undefined,
    raw: stringifyRaw(metadata?.raw),
  }
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

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

function buildMessages(args: {
  systemPrompt: string
  promptText: string
  priorTextValue: string
  isExpansion: boolean
  isContinuation: boolean
}): ChatMessage[] {
  const { systemPrompt, promptText, priorTextValue, isExpansion, isContinuation } = args
  const system: ChatMessage = { role: 'system', content: systemPrompt }

  // Expansion intentionally omits the original user prompt: the model should loop
  // on and elaborate the last highlighted paragraph only, not continue the story
  // toward whatever the prompt originally asked.
  if (isExpansion) {
    return [
      system,
      { role: 'assistant', content: priorTextValue },
      { role: 'user', content: EXPANSION_INSTRUCTION },
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
      { role: 'user', content: CONTINUATION_INSTRUCTION },
    ]
  }

  return [system, { role: 'user', content: promptText }]
}

generateRoutes.post('/', authMiddleware, async (c: any) => {
  const userId = getUserId(c)
  const worldId = paramInt(c, 'id')
  const world = findUserWorld(userId, worldId)
  if (!world) return c.json({ error: 'Not found' }, 404)

  const { prompt, model: requestedModel, temperature: requestedTemperature, useThinking, mode, priorText } = await c.req.json()

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

  const systemPrompt = buildSystemPrompt(world.body, isContinuation)

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
          })

          response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            signal: controller.signal,
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: modelOption.id,
              temperature,
              reasoning: useThinking === true ? modelOption.reasoning : { effort: 'none' },
              stream: true,
              provider,
              messages,
            }),
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
