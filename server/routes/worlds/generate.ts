import { streamSSE } from 'hono/streaming'
import { eq, and } from 'drizzle-orm'
import { db, worlds, pieces } from '../../db'

export async function handleGenerate(c: any) {
  const userId = c.get('userId') as number
  const worldId = parseInt(c.req.param('id'))
  const world = db.select().from(worlds).where(and(eq(worlds.id, worldId), eq(worlds.user_id, userId))).get()
  if (!world) return c.json({ error: 'Not found' }, 404)

  const { prompt, model: requestedModel } = await c.req.json()
  if (!prompt) return c.json({ error: 'Prompt required' }, 400)

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return c.json({ error: 'OPENROUTER_API_KEY is not set on the server' }, 500)

  const model = requestedModel || 'deepseek/deepseek-v4-flash'

  return streamSSE(c, async (stream) => {
    let accumulated = ''
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          stream: true,
          provider: { sort: 'throughput' },
          messages: [
            { role: 'system', content: [world.summary, world.body].filter(Boolean).join('\n\n') },
            { role: 'user', content: prompt },
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
            const result = db.insert(pieces).values({
              user_id: userId,
              world_id: worldId,
              prompt,
              body: accumulated,
              model,
              created_at: Date.now(),
            }).returning().get()
            await stream.writeSSE({ data: JSON.stringify({ type: 'done', pieceId: result.id }) })
            return
          }
          try {
            const parsed = JSON.parse(data)
            const content = parsed?.choices?.[0]?.delta?.content
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
}
