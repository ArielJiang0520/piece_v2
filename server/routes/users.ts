import { Hono } from 'hono'
import { eq, sql } from 'drizzle-orm'
import { db, users } from '../db'
import { type Variables, authMiddleware } from '../middleware'
import { getUserId } from '../route-helpers'
import { worldCards } from '../world-cards'

const userRoutes = new Hono<{ Variables: Variables }>()

// The signed-in user edits their own profile; only the bio for now.
userRoutes.patch('/me', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const payload = await c.req.json()
  if (typeof payload.bio !== 'string') return c.json({ error: 'Bio required' }, 400)
  db.update(users).set({ bio: payload.bio.trim() }).where(eq(users.id, userId)).run()
  return c.json({ ok: true })
})

// A user's public profile, the same for everyone: who they are, the worlds they created
// (published only — unpublished ones live in the creator center), and the worlds they bookmarked.
userRoutes.get('/:username', authMiddleware, (c) => {
  const viewerId = getUserId(c)
  const user = db
    .select({ id: users.id, username: users.username, bio: users.bio })
    .from(users)
    .where(eq(users.username, c.req.param('username') ?? ''))
    .get()
  if (!user) return c.json({ error: 'Not found' }, 404)
  const created = worldCards(viewerId, sql`w.user_id = ${user.id} AND w.published = 1`, sql`w.updated_at DESC, w.id DESC`)
  const bookmarked = worldCards(
    viewerId,
    sql`w.id IN (SELECT world_id FROM bookmarks WHERE user_id = ${user.id}) AND w.published = 1 AND w.user_id != ${user.id}`,
    sql`(SELECT created_at FROM bookmarks WHERE user_id = ${user.id} AND world_id = w.id) DESC`,
  )
  return c.json({ username: user.username, bio: user.bio, is_me: user.id === viewerId, created, bookmarked })
})

export default userRoutes
