import { getCookie, setCookie } from 'hono/cookie'
import { eq } from 'drizzle-orm'
import { db, sessions } from './db'

export type Variables = { userId: number }

export function generateSessionId(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function setSessionCookie(c: any, sid: string) {
  const isProd = process.env.NODE_ENV === 'production'
  setCookie(c, 'sid', sid, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 2592000,
    secure: isProd,
  })
}

export async function authMiddleware(c: any, next: any) {
  const sid = getCookie(c, 'sid')
  if (!sid) return c.json({ error: 'Unauthorized' }, 401)

  const session = db.select().from(sessions).where(eq(sessions.id, sid)).get()
  if (!session || session.expires_at < Date.now()) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  c.set('userId', session.user_id)
  await next()
}
