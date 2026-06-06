import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { type Variables, authMiddleware } from '../../middleware'
import { findUserWorld, findUserWorldId, getModelById, getUserId, paramInt } from '../../route-helpers'
import { normalizePromptInput } from '../../prompt-text'
import { BLACKLISTED_PROVIDERS } from '../../../src/preferences/generationModel'
import { readServerSentEvents } from '../../../src/utils/sse'
import {
  buildModelUsageFromGenerationMetadata,
  buildModelUsageFromOpenRouterResponse,
  fetchOpenRouterGenerationMetadata,
  type ModelUsageStatus,
  writeModelUsage,
} from '../../model-usage'

const generateRoutes = new Hono<{ Variables: Variables }>()
const activeGenerations = new Map<string, AbortController>()

function generationKey(userId: number, worldId: number, generationId: string) {
  return `${userId}:${worldId}:${generationId}`
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

generateRoutes.post('/', authMiddleware, async (c: any) => {
  const userId = getUserId(c)
  const worldId = paramInt(c, 'id')
  const world = findUserWorld(userId, worldId)
  if (!world) return c.json({ error: 'Not found' }, 404)

  const systemPrompt = buildSystemPrompt(world.body)

  const { prompt, model: requestedModel, temperature: requestedTemperature, useThinking, generationId } = await c.req.json()

  const promptText = normalizePromptInput(prompt)
  if (!promptText) return c.json({ error: 'Prompt required' }, 400)
  const generationToken = typeof generationId === 'string' ? generationId.trim() : ''
  if (!generationToken) return c.json({ error: 'Generation id required' }, 400)

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return c.json({ error: 'OPENROUTER_API_KEY is not set on the server' }, 500)

  const modelOption = getModelById(requestedModel)
  if (!modelOption) return c.json({ error: 'Invalid model requested' }, 400)

  const parsedTemperature = Number(requestedTemperature)
  const temperature = Number.isFinite(parsedTemperature)
    ? Math.min(2, Math.max(0, parsedTemperature))
    : 1

  return streamSSE(c, async (stream) => {
    const controller = new AbortController()
    const key = generationKey(userId, worldId, generationToken)
    const requestStartedAt = Date.now()
    let openrouterGenerationId: string | null = null
    let usagePersisted = false
    let finalStatus: ModelUsageStatus = 'error'
    activeGenerations.get(key)?.abort()
    activeGenerations.set(key, controller)

    const abortOpenRouter = () => controller.abort()
    c.req.raw.signal.addEventListener('abort', abortOpenRouter, { once: true })

    try {
      await stream.writeSSE({ data: JSON.stringify({ type: 'status', status: 'waiting_provider' }) })

      const provider: Record<string, unknown> = {
        sort: 'latency',
        require_parameters: true,
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
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: promptText },
          ],
        }),
      })

      if (!response.ok || !response.body) {
        const message = await readOpenRouterError(response)
        finalStatus = 'error'
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
          finalStatus = 'completed'
          await stream.writeSSE({ data: JSON.stringify({ type: 'done' }) })
          return
        }
        try {
          const parsed = JSON.parse(data)
          if (typeof parsed?.id === 'string') {
            openrouterGenerationId = parsed.id
          }

          if (!providerEmitted && typeof parsed?.provider === 'string' && parsed.provider) {
            providerEmitted = true
            await stream.writeSSE({ data: JSON.stringify({ type: 'provider', name: parsed.provider }) })
          }

          if (parsed?.usage) {
            const usageEvent = buildModelUsageFromOpenRouterResponse({
              userId,
              worldId,
              localGenerationId: generationToken,
              requestedModel: modelOption.id,
              status: 'completed',
              response: parsed,
              createdAt: requestStartedAt,
            })
            if (usageEvent) {
              writeModelUsage(usageEvent)
              usagePersisted = true
            }
          }

          if (parsed?.error) {
            const message = typeof parsed.error?.message === 'string'
              ? parsed.error.message
              : JSON.stringify(parsed.error)
            finalStatus = 'error'
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
    } catch (err) {
      if (controller.signal.aborted) {
        finalStatus = 'cancelled'
        return
      }

      finalStatus = 'error'
      const msg = err instanceof Error ? err.message : 'Unknown error'
      await stream.writeSSE({ data: JSON.stringify({ type: 'error', message: msg }) })
    } finally {
      if (!usagePersisted && openrouterGenerationId) {
        const metadata = await fetchOpenRouterGenerationMetadata(apiKey, openrouterGenerationId)
        const usageEvent = buildModelUsageFromGenerationMetadata({
          userId,
          worldId,
          localGenerationId: generationToken,
          requestedModel: modelOption.id,
          status: finalStatus,
          metadata,
          createdAt: requestStartedAt,
        })
        if (usageEvent) {
          writeModelUsage(usageEvent)
        }
      }

      c.req.raw.signal.removeEventListener('abort', abortOpenRouter)
      if (activeGenerations.get(key) === controller) {
        activeGenerations.delete(key)
      }
    }
  })
})

generateRoutes.post('/stop', authMiddleware, async (c: any) => {
  const userId = getUserId(c)
  const worldId = paramInt(c, 'id')
  if (!findUserWorldId(userId, worldId)) return c.json({ error: 'Not found' }, 404)

  let body: any = {}
  try {
    body = await c.req.json()
  } catch { }

  const generationToken = typeof body.generationId === 'string' ? body.generationId.trim() : ''
  if (!generationToken) return c.json({ error: 'Generation id required' }, 400)

  const controller = activeGenerations.get(generationKey(userId, worldId, generationToken))
  controller?.abort()

  return c.json({ stopped: Boolean(controller) })
})

export default generateRoutes
