import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { eq, and, sql } from 'drizzle-orm'
import { db, worlds, prompts, pieces } from '../../db'
import { type Variables, authMiddleware } from '../../middleware'

const generateRoutes = new Hono<{ Variables: Variables }>()

generateRoutes.post('/', authMiddleware, async (c: any) => {
  const userId = c.get('userId') as number
  const worldId = parseInt(c.req.param('id'))
  const world = db.select().from(worlds).where(and(eq(worlds.id, worldId), eq(worlds.user_id, userId))).get()
  if (!world) return c.json({ error: 'Not found' }, 404)

  const { prompt, promptId, model: requestedModel, temperature: requestedTemperature } = await c.req.json()

  let promptText = typeof prompt === 'string' ? prompt.trim() : ''
  let existingPrompt: typeof prompts.$inferSelect | undefined
  if (promptId !== undefined && promptId !== null) {
    const id = parseInt(String(promptId))
    existingPrompt = db
      .select()
      .from(prompts)
      .where(and(eq(prompts.id, id), eq(prompts.world_id, worldId), eq(prompts.user_id, userId)))
      .get()
    if (!existingPrompt) return c.json({ error: 'Prompt not found' }, 404)
    promptText = existingPrompt.text
  }

  if (!promptText) return c.json({ error: 'Prompt required' }, 400)

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return c.json({ error: 'OPENROUTER_API_KEY is not set on the server' }, 500)

  const model = requestedModel || 'deepseek/deepseek-v4-flash'
  const parsedTemperature = Number(requestedTemperature)
  const temperature = Number.isFinite(parsedTemperature)
    ? Math.min(2, Math.max(0, parsedTemperature))
    : 1

  return streamSSE(c, async (stream) => {
    let accumulated = ''
    let sentThinking = false
    try {
      await stream.writeSSE({ data: JSON.stringify({ type: 'status', status: 'waiting_provider' }) })

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature,
          stream: true,
          provider: { sort: 'throughput' },
          messages: [
            { role: 'system', content: [world.summary, world.body].filter(Boolean).join('\n\n') },
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
            const now = Date.now()
            const promptRow = existingPrompt ?? db.insert(prompts).values({
              user_id: userId,
              world_id: worldId,
              text: promptText,
              piece_count: 1,
              created_at: now,
              updated_at: now,
            }).returning().get()

            const result = db.insert(pieces).values({
              user_id: userId,
              world_id: worldId,
              prompt_id: promptRow.id,
              body: accumulated,
              model,
              created_at: now,
            }).returning().get()

            if (existingPrompt) {
              db.update(prompts)
                .set({
                  updated_at: now,
                  piece_count: sql`${prompts.piece_count} + 1`,
                })
                .where(eq(prompts.id, existingPrompt.id))
                .run()
            }

            await stream.writeSSE({ data: JSON.stringify({ type: 'done', pieceId: result.id }) })
            return
          }
          try {
            const parsed = JSON.parse(data)
            const delta = parsed?.choices?.[0]?.delta
            const reasoning = delta?.reasoning
              ?? delta?.reasoning_content
              ?? delta?.reasoning_details?.map((detail: any) => detail?.text ?? detail?.summary ?? '').join('')
            if (reasoning && !sentThinking) {
              sentThinking = true
              await stream.writeSSE({ data: JSON.stringify({ type: 'thinking' }) })
            }

            const content = delta?.content
            if (content) {
              accumulated += content
              await stream.writeSSE({ data: JSON.stringify({ type: 'chunk', content }) })
            }
          } catch {
            // ignore malformed chunks
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      await stream.writeSSE({ data: JSON.stringify({ type: 'error', message: msg }) })
    }
  })
})

export default generateRoutes
