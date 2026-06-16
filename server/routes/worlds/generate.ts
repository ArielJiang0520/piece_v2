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

function buildSystemPrompt(worldBody: string): string {
  const sections: string[] = []
  if (worldBody.trim()) {
    sections.push(`# World setting\n${worldBody.trim()}`)
  }

  sections.push(
    `# Task\nThe user will give you a prompt. Using the world setting above, write a story that responds to the user's prompt while staying faithful to the world.`,
  )

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
  'Continue the story from exactly where the text above leaves off, advancing it naturally toward the original prompt.',
  'Do NOT repeat, summarize, or rewrite any text already written. Pick up seamlessly from the last sentence, beginning a new paragraph, so the new prose reads as a natural continuation.',
  'Match the existing language, voice, tense, and tone exactly.',
].join('\n')

const FAST_FORWARD_INSTRUCTION = [
  'The user finds the pace too slow. If the final paragraph above is unfinished, bring it to a close in a sentence or two.',
  'Then move the story forward to the immediately next natural action or beat that the original prompt calls for. Move on to the next scene.',
  'Pick up seamlessly from the last sentence, beginning a new paragraph.',
  'Match the existing language, voice, tense, and tone exactly.',
].join('\n')

async function readOpenRouterError(response: Response): Promise<string> {
  const fallback = `OpenRouter ${response.status} ${response.statusText}`
  const rawBody = await response.text().catch(() => '')
  if (!rawBody) return fallback

  try {
    const parsed = JSON.parse(rawBody) as any
    const message = parsed?.error?.message
      ?? parsed?.error?.metadata?.raw
      ?? parsed?.error
      ?? parsed?.message
    return typeof message === 'string' ? message : rawBody
  } catch {
    return rawBody
  }
}

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

function buildMessages(args: {
  systemPrompt: string
  promptText: string
  priorTextValue: string
  isExpansion: boolean
  isContinuation: boolean
  isFastForward: boolean
  isRewind: boolean
}): ChatMessage[] {
  const { systemPrompt, promptText, priorTextValue, isExpansion, isContinuation, isFastForward, isRewind } = args
  const system: ChatMessage = { role: 'system', content: systemPrompt }

  // Rewind dropped the last paragraph; hand the kept text back as an assistant prefill
  // and let the model continue normally — no instruction, just system + prompt + story.
  if (isRewind) {
    return [
      system,
      { role: 'user', content: promptText },
      { role: 'assistant', content: priorTextValue },
    ]
  }

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

  // Continuation and fast-forward both keep the original prompt + the full existing
  // text so the model resumes the same story; they differ only in the final
  // instruction (push forward vs. close out the beat and skip ahead).
  if (isContinuation || isFastForward) {
    return [
      system,
      { role: 'user', content: promptText },
      { role: 'assistant', content: priorTextValue },
      { role: 'user', content: isFastForward ? FAST_FORWARD_INSTRUCTION : CONTINUATION_INSTRUCTION },
    ]
  }

  return [system, { role: 'user', content: promptText }]
}

generateRoutes.post('/', authMiddleware, async (c: any) => {
  const userId = getUserId(c)
  const worldId = paramInt(c, 'id')
  const world = findUserWorld(userId, worldId)
  if (!world) return c.json({ error: 'Not found' }, 404)

  const systemPrompt = buildSystemPrompt(world.body)

  const { prompt, model: requestedModel, temperature: requestedTemperature, useThinking, mode, priorText } = await c.req.json()

  const promptText = normalizePromptInput(prompt)
  if (!promptText) return c.json({ error: 'Prompt required' }, 400)
  const rawPrior = typeof priorText === 'string' ? priorText : ''
  // Instruction-driven modes trim the kept text; rewind feeds it back as an assistant
  // prefill, so it keeps the trailing blank line so the model continues a fresh paragraph.
  const priorTextValue = mode === 'rewind'
    ? rawPrior.replace(/^\s+/, '')
    : (mode === 'expand' || mode === 'continue' || mode === 'fast-forward') ? rawPrior.trim() : ''
  const isExpansion = mode === 'expand' && priorTextValue.length > 0
  const isContinuation = mode === 'continue' && priorTextValue.length > 0
  const isFastForward = mode === 'fast-forward' && priorTextValue.length > 0
  const isRewind = mode === 'rewind' && priorTextValue.length > 0

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
    isFastForward,
    isRewind,
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

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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

        if (!response.ok || !response.body) {
          const message = await readOpenRouterError(response)
          console.error('[OpenRouter generate error]', {
            status: response.status,
            statusText: response.statusText,
            model: modelOption.id,
            provider,
            message,
          })
          await stream.writeSSE({ data: JSON.stringify({ type: 'error', message }) })
          return
        }

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
              const message = typeof parsed.error?.message === 'string'
                ? parsed.error.message
                : JSON.stringify(parsed.error)
              console.error('[OpenRouter generate stream error]', {
                model: modelOption.id,
                provider,
                error: parsed.error,
              })
              await stream.writeSSE({ data: JSON.stringify({ type: 'error', message }) })
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
