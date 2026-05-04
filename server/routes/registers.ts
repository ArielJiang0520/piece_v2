import { Hono } from 'hono'
import { eq, asc } from 'drizzle-orm'
import { db, registers } from '../db'
import { type Variables, authMiddleware } from '../middleware'

const registerRoutes = new Hono<{ Variables: Variables }>()

registerRoutes.get('/', authMiddleware, (c) => {
  const rows = db.select().from(registers).orderBy(asc(registers.id)).all()
  return c.json(rows)
})

registerRoutes.post('/', authMiddleware, async (c) => {
  const body = await c.req.json()
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const details = typeof body.details === 'string' ? body.details.trim() : ''
  const summary = typeof body.summary === 'string' ? body.summary : ''
  if (!title || !details) return c.json({ error: 'Title and details required' }, 400)
  const result = db.insert(registers).values({ title, details, summary }).returning().get()
  return c.json(result)
})

registerRoutes.patch('/:id', authMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'))
  const existing = db.select().from(registers).where(eq(registers.id, id)).get()
  if (!existing) return c.json({ error: 'Not found' }, 404)
  const body = await c.req.json()
  const updates: Record<string, any> = {}
  if (body.title !== undefined) {
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    if (!title) return c.json({ error: 'Title required' }, 400)
    updates.title = title
  }
  if (body.details !== undefined) {
    const details = typeof body.details === 'string' ? body.details.trim() : ''
    if (!details) return c.json({ error: 'Details required' }, 400)
    updates.details = details
  }
  if (body.summary !== undefined) {
    updates.summary = typeof body.summary === 'string' ? body.summary : ''
  }
  if (Object.keys(updates).length === 0) return c.json(existing)
  const result = db.update(registers).set(updates).where(eq(registers.id, id)).returning().get()
  return c.json(result)
})

registerRoutes.delete('/:id', authMiddleware, (c) => {
  const id = parseInt(c.req.param('id'))
  const existing = db.select().from(registers).where(eq(registers.id, id)).get()
  if (!existing) return c.json({ error: 'Not found' }, 404)
  db.delete(registers).where(eq(registers.id, id)).run()
  return c.json({ ok: true })
})

export default registerRoutes
