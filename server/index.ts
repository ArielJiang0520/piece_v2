import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { serveStatic } from 'hono/bun'
import * as argon2 from '@node-rs/argon2'
import { eq, and, desc, sql } from 'drizzle-orm'
import { db, users, sessions, worlds, pieces } from './db'

type Variables = { userId: number }
const app = new Hono<{ Variables: Variables }>()

function generateSessionId(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

function setSessionCookie(c: any, sid: string) {
  const isProd = process.env.NODE_ENV === 'production'
  setCookie(c, 'sid', sid, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 2592000,
    secure: isProd,
  })
}

async function authMiddleware(c: any, next: any) {
  const sid = getCookie(c, 'sid')
  if (!sid) return c.json({ error: 'Unauthorized' }, 401)

  const session = db.select().from(sessions).where(eq(sessions.id, sid)).get()
  if (!session || session.expires_at < Date.now()) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  c.set('userId', session.user_id)
  await next()
}

// Auth routes
app.post('/api/auth/signup', async (c) => {
  const { username, password } = await c.req.json()
  if (!username || !password) return c.json({ error: 'Missing fields' }, 400)
  if (password.length < 8) return c.json({ error: 'Password must be at least 8 characters' }, 400)

  const existing = db.select().from(users).where(eq(users.username, username)).get()
  if (existing) return c.json({ error: 'Username already taken' }, 409)

  const hash = await argon2.hash(password)
  const now = Date.now()
  const result = db.insert(users).values({ username, password_hash: hash, created_at: now }).returning().get()

  const sid = generateSessionId()
  db.insert(sessions).values({ id: sid, user_id: result.id, expires_at: now + 30 * 86400 * 1000 }).run()

  setSessionCookie(c, sid)
  return c.json({ username: result.username })
})

app.post('/api/auth/login', async (c) => {
  const { username, password } = await c.req.json()
  if (!username || !password) return c.json({ error: 'Missing fields' }, 400)

  const user = db.select().from(users).where(eq(users.username, username)).get()
  if (!user) return c.json({ error: 'Invalid credentials' }, 401)

  const valid = await argon2.verify(user.password_hash, password)
  if (!valid) return c.json({ error: 'Invalid credentials' }, 401)

  const sid = generateSessionId()
  const now = Date.now()
  db.insert(sessions).values({ id: sid, user_id: user.id, expires_at: now + 30 * 86400 * 1000 }).run()

  setSessionCookie(c, sid)
  return c.json({ username: user.username })
})

app.post('/api/auth/logout', async (c) => {
  const sid = getCookie(c, 'sid')
  if (sid) db.delete(sessions).where(eq(sessions.id, sid)).run()
  deleteCookie(c, 'sid', { path: '/' })
  return new Response(null, { status: 204 })
})

app.get('/api/me', authMiddleware, (c) => {
  const userId = c.get('userId') as number
  const user = db.select({ username: users.username }).from(users).where(eq(users.id, userId)).get()
  if (!user) return c.json({ error: 'Not found' }, 404)
  return c.json({ username: user.username })
})

// World routes
app.get('/api/worlds', authMiddleware, (c) => {
  const userId = c.get('userId') as number
  const rows = db
    .select({ id: worlds.id, name: worlds.name, updated_at: worlds.updated_at })
    .from(worlds)
    .where(eq(worlds.user_id, userId))
    .orderBy(desc(worlds.updated_at))
    .all()
  return c.json(rows)
})

app.post('/api/worlds', authMiddleware, async (c) => {
  const userId = c.get('userId') as number
  const { name } = await c.req.json()
  if (!name) return c.json({ error: 'Name required' }, 400)
  const now = Date.now()
  const result = db.insert(worlds).values({ user_id: userId, name, body: '', created_at: now, updated_at: now }).returning().get()
  return c.json({ id: result.id, name: result.name })
})

app.get('/api/worlds/:id', authMiddleware, (c) => {
  const userId = c.get('userId') as number
  const id = parseInt(c.req.param('id'))
  const world = db.select().from(worlds).where(and(eq(worlds.id, id), eq(worlds.user_id, userId))).get()
  if (!world) return c.json({ error: 'Not found' }, 404)
  return c.json({ id: world.id, name: world.name, body: world.body, updated_at: world.updated_at })
})

app.patch('/api/worlds/:id', authMiddleware, async (c) => {
  const userId = c.get('userId') as number
  const id = parseInt(c.req.param('id'))
  const world = db.select().from(worlds).where(and(eq(worlds.id, id), eq(worlds.user_id, userId))).get()
  if (!world) return c.json({ error: 'Not found' }, 404)

  const body = await c.req.json()
  const updates: Record<string, any> = { updated_at: Date.now() }
  if (body.name !== undefined) updates.name = body.name
  if (body.body !== undefined) updates.body = body.body

  db.update(worlds).set(updates).where(eq(worlds.id, id)).run()
  return c.json({ ok: true })
})

app.delete('/api/worlds/:id', authMiddleware, (c) => {
  const userId = c.get('userId') as number
  const id = parseInt(c.req.param('id'))
  const world = db.select().from(worlds).where(and(eq(worlds.id, id), eq(worlds.user_id, userId))).get()
  if (!world) return c.json({ error: 'Not found' }, 404)
  db.delete(worlds).where(eq(worlds.id, id)).run()
  return c.json({ ok: true })
})

// Piece routes
app.get('/api/worlds/:id/pieces', authMiddleware, (c) => {
  const userId = c.get('userId') as number
  const worldId = parseInt(c.req.param('id'))
  const world = db.select().from(worlds).where(and(eq(worlds.id, worldId), eq(worlds.user_id, userId))).get()
  if (!world) return c.json({ error: 'Not found' }, 404)

  const rows = db
    .select({
      id: pieces.id,
      prompt: pieces.prompt,
      preview: sql<string>`substr(${pieces.body}, 1, 200)`,
      created_at: pieces.created_at,
    })
    .from(pieces)
    .where(and(eq(pieces.world_id, worldId), eq(pieces.user_id, userId)))
    .orderBy(desc(pieces.created_at))
    .all()
  return c.json(rows)
})

app.get('/api/pieces/:id', authMiddleware, (c) => {
  const userId = c.get('userId') as number
  const id = parseInt(c.req.param('id'))
  const piece = db.select().from(pieces).where(and(eq(pieces.id, id), eq(pieces.user_id, userId))).get()
  if (!piece) return c.json({ error: 'Not found' }, 404)
  return c.json(piece)
})

app.delete('/api/pieces/:id', authMiddleware, (c) => {
  const userId = c.get('userId') as number
  const id = parseInt(c.req.param('id'))
  const piece = db.select().from(pieces).where(and(eq(pieces.id, id), eq(pieces.user_id, userId))).get()
  if (!piece) return c.json({ error: 'Not found' }, 404)
  db.delete(pieces).where(eq(pieces.id, id)).run()
  return c.json({ ok: true })
})

// Generation route
app.post('/api/worlds/:id/generate', authMiddleware, async (c) => {
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
            { role: 'system', content: world.body },
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
        } catch {}
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
})

// Static serving in production
if (process.env.NODE_ENV === 'production') {
  app.use('/*', serveStatic({ root: './dist' }))
  app.get('/*', serveStatic({ path: './dist/index.html' }))
}

const port = parseInt(process.env.PORT || '3001')
const apiKey = process.env.OPENROUTER_API_KEY
console.log(`[startup] OPENROUTER_API_KEY: ${apiKey ? `set (${apiKey.slice(0, 12)}...)` : 'MISSING'}`)
export default {
  port,
  fetch: app.fetch,
}
