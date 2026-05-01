import { Hono } from 'hono'
import { eq, and, desc } from 'drizzle-orm'
import { db, worlds } from '../../db'
import { type Variables, authMiddleware } from '../../middleware'
import promptRoutes from './prompts'
import generateRoutes from './generate'
import clusterRoutes from './clusters'

const worldRoutes = new Hono<{ Variables: Variables }>()

worldRoutes.get('/', authMiddleware, (c) => {
  const userId = c.get('userId') as number
  const rows = db
    .select({ id: worlds.id, name: worlds.name, summary: worlds.summary, updated_at: worlds.updated_at })
    .from(worlds)
    .where(eq(worlds.user_id, userId))
    .orderBy(desc(worlds.updated_at))
    .all()
  return c.json(rows)
})

worldRoutes.post('/', authMiddleware, async (c) => {
  const userId = c.get('userId') as number
  const { name } = await c.req.json()
  if (!name) return c.json({ error: 'Name required' }, 400)
  const now = Date.now()
  const result = db.insert(worlds).values({ user_id: userId, name, summary: '', body: '', created_at: now, updated_at: now }).returning().get()
  return c.json({ id: result.id, name: result.name })
})

worldRoutes.get('/:id', authMiddleware, (c) => {
  const userId = c.get('userId') as number
  const id = parseInt(c.req.param('id'))
  const world = db.select().from(worlds).where(and(eq(worlds.id, id), eq(worlds.user_id, userId))).get()
  if (!world) return c.json({ error: 'Not found' }, 404)
  return c.json({ id: world.id, name: world.name, summary: world.summary, body: world.body, updated_at: world.updated_at })
})

worldRoutes.patch('/:id', authMiddleware, async (c) => {
  const userId = c.get('userId') as number
  const id = parseInt(c.req.param('id'))
  const world = db.select().from(worlds).where(and(eq(worlds.id, id), eq(worlds.user_id, userId))).get()
  if (!world) return c.json({ error: 'Not found' }, 404)

  const body = await c.req.json()
  const updates: Record<string, any> = { updated_at: Date.now() }
  if (body.name !== undefined) updates.name = body.name
  if (body.summary !== undefined) updates.summary = body.summary
  if (body.body !== undefined) updates.body = body.body

  db.update(worlds).set(updates).where(eq(worlds.id, id)).run()
  return c.json({ ok: true })
})

worldRoutes.delete('/:id', authMiddleware, (c) => {
  const userId = c.get('userId') as number
  const id = parseInt(c.req.param('id'))
  const world = db.select().from(worlds).where(and(eq(worlds.id, id), eq(worlds.user_id, userId))).get()
  if (!world) return c.json({ error: 'Not found' }, 404)
  db.delete(worlds).where(eq(worlds.id, id)).run()
  return c.json({ ok: true })
})

worldRoutes.route('/:id/prompts', promptRoutes)
worldRoutes.route('/:id/clusters', clusterRoutes)
worldRoutes.route('/:id/generate', generateRoutes)

export default worldRoutes
