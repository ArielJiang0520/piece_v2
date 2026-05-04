import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { eq, and } from 'drizzle-orm'
import { db, registers, worlds } from '../../db'
import { type Variables, authMiddleware } from '../../middleware'
import { MODELS } from '../../../src/config'
import { normalizePromptInput } from '../../prompt-text'

const generateRoutes = new Hono<{ Variables: Variables }>()
const modelsById = new Map(MODELS.map(model => [model.id, model]))
const activeGenerations = new Map<string, AbortController>()

function generationKey(userId: number, worldId: number, generationId: string) {
  return `${userId}:${worldId}:${generationId}`
}

function buildSystemPrompt(worldOrigin: string, worldBody: string, registerDetails: string | null): string {
  const origin = worldOrigin.trim()
  const originSentence = !origin || origin === 'original'
    ? `The world is based on the user's original setting.`
    : `The world is based on an existing work: ${origin}.`

  const sections: string[] = [originSentence]

  if (worldBody.trim()) {
    sections.push(`# World setting\n${worldBody.trim()}`)
  }

  sections.push(
    `# Task\nThe user will give you a prompt. Using the world setting above, write a one-shot piece (a single, self-contained passage) that responds to the user's prompt while staying faithful to the world.`,
  )

  if (registerDetails && registerDetails.trim()) {
    sections.push(`# The world's register\n${registerDetails.trim()}`)
  }

  sections.push(
    `# Language\nRegardless of the language of these instructions, always reply in the same language as the user's prompt.`,
  )

  return sections.join('\n\n')
}

generateRoutes.post('/', authMiddleware, async (c: any) => {
  const userId = c.get('userId') as number
  const worldId = parseInt(c.req.param('id'))
  const world = db.select().from(worlds).where(and(eq(worlds.id, worldId), eq(worlds.user_id, userId))).get()
  if (!world) return c.json({ error: 'Not found' }, 404)

  const register = world.register_id
    ? db.select().from(registers).where(eq(registers.id, world.register_id)).get()
    : null
  const systemPrompt = buildSystemPrompt(world.origin, world.body, register?.details ?? null)

  const { prompt, model: requestedModel, temperature: requestedTemperature, useThinking, generationId } = await c.req.json()

  const promptText = normalizePromptInput(prompt)
  if (!promptText) return c.json({ error: 'Prompt required' }, 400)
  const generationToken = typeof generationId === 'string' ? generationId.trim() : ''
  if (!generationToken) return c.json({ error: 'Generation id required' }, 400)

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return c.json({ error: 'OPENROUTER_API_KEY is not set on the server' }, 500)

  const modelOption = typeof requestedModel === 'string' ? modelsById.get(requestedModel) : undefined
  if (!modelOption) {
    return c.json({ error: 'Invalid model requested' }, 400)
  }
  const model = modelOption.id

  const parsedTemperature = Number(requestedTemperature)
  const temperature = Number.isFinite(parsedTemperature)
    ? Math.min(2, Math.max(0, parsedTemperature))
    : 1

  return streamSSE(c, async (stream) => {
    const controller = new AbortController()
    const key = generationKey(userId, worldId, generationToken)
    activeGenerations.get(key)?.abort()
    activeGenerations.set(key, controller)

    const abortOpenRouter = () => controller.abort()
    c.req.raw.signal.addEventListener('abort', abortOpenRouter, { once: true })

    try {
      await stream.writeSSE({ data: JSON.stringify({ type: 'status', status: 'waiting_provider' }) })

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature,
          reasoning: useThinking === true ? modelOption.reasoning : { effort: 'none' },
          stream: true,
          provider: {
            sort: 'throughput'
          },
          require_parameters: true,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: promptText },
          ],
        }),
      })

      if (!response.ok || !response.body) {
        let message = `OpenRouter ${response.status} ${response.statusText}`
        try {
          const errBody = await response.json() as any
          if (errBody?.error?.message) message = errBody.error.message
          else if (typeof errBody?.error === 'string') message = errBody.error
        } catch { }
        await stream.writeSSE({ data: JSON.stringify({ type: 'error', message }) })
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() ?? ''

        for (const event of events) {
          const line = event.trim()
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          if (data === '[DONE]') {
            await stream.writeSSE({ data: JSON.stringify({ type: 'done' }) })
            return
          }
          try {
            const parsed = JSON.parse(data)
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
      }
    } catch (err) {
      if (controller.signal.aborted) return

      const msg = err instanceof Error ? err.message : 'Unknown error'
      await stream.writeSSE({ data: JSON.stringify({ type: 'error', message: msg }) })
    } finally {
      c.req.raw.signal.removeEventListener('abort', abortOpenRouter)
      if (activeGenerations.get(key) === controller) {
        activeGenerations.delete(key)
      }
    }
  })
})

generateRoutes.post('/stop', authMiddleware, async (c: any) => {
  const userId = c.get('userId') as number
  const worldId = parseInt(c.req.param('id'))
  const world = db.select({ id: worlds.id }).from(worlds).where(and(eq(worlds.id, worldId), eq(worlds.user_id, userId))).get()
  if (!world) return c.json({ error: 'Not found' }, 404)

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
