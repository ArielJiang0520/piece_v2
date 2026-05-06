import { Hono } from 'hono'
import { getCookie, deleteCookie } from 'hono/cookie'
import * as argon2 from '@node-rs/argon2'
import { eq } from 'drizzle-orm'
import { db, users, sessions } from '../db'
import {
  type Variables,
  SESSION_TTL_MS,
  authMiddleware,
  generateSessionId,
  setSessionCookie,
} from '../middleware'
import { getUserId } from '../route-helpers'
import { createExampleWorldsForUser } from '../example-worlds'

const auth = new Hono<{ Variables: Variables }>()

function startSession(c: any, userId: number, now = Date.now()) {
  const sid = generateSessionId()
  db.insert(sessions).values({ id: sid, user_id: userId, expires_at: now + SESSION_TTL_MS }).run()
  setSessionCookie(c, sid)
}

auth.post('/auth/signup', async (c) => {
  const { username, password } = await c.req.json()
  if (!username || !password) return c.json({ error: 'Missing fields' }, 400)
  if (password.length < 8) return c.json({ error: 'Password must be at least 8 characters' }, 400)

  const existing = db.select().from(users).where(eq(users.username, username)).get()
  if (existing) return c.json({ error: 'Username already taken' }, 409)

  const hash = await argon2.hash(password)
  const now = Date.now()
  const result = db.transaction((tx) => {
    const user = tx.insert(users).values({ username, password_hash: hash, created_at: now }).returning().get()
    createExampleWorldsForUser(tx, user.id, now)
    return user
  })

  startSession(c, result.id, now)
  return c.json({ username: result.username })
})

auth.post('/auth/login', async (c) => {
  const { username, password } = await c.req.json()
  if (!username || !password) return c.json({ error: 'Missing fields' }, 400)

  const user = db.select().from(users).where(eq(users.username, username)).get()
  if (!user) return c.json({ error: 'Invalid credentials' }, 401)

  const valid = await argon2.verify(user.password_hash, password)
  if (!valid) return c.json({ error: 'Invalid credentials' }, 401)

  startSession(c, user.id)
  return c.json({ username: user.username })
})

auth.post('/auth/logout', async (c) => {
  const sid = getCookie(c, 'sid')
  if (sid) db.delete(sessions).where(eq(sessions.id, sid)).run()
  deleteCookie(c, 'sid', { path: '/' })
  return new Response(null, { status: 204 })
})

auth.get('/me', authMiddleware, (c) => {
  const userId = getUserId(c)
  const user = db.select({ username: users.username }).from(users).where(eq(users.id, userId)).get()
  if (!user) return c.json({ error: 'Not found' }, 404)
  return c.json({ username: user.username })
})

export default auth
