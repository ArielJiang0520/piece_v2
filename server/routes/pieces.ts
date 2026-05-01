import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import { db, pieces } from '../db'
import { type Variables, authMiddleware } from '../middleware'

const pieceRoutes = new Hono<{ Variables: Variables }>()

pieceRoutes.get('/:id', authMiddleware, (c) => {
  const userId = c.get('userId') as number
  const id = parseInt(c.req.param('id'))
  const piece = db.select().from(pieces).where(and(eq(pieces.id, id), eq(pieces.user_id, userId))).get()
  if (!piece) return c.json({ error: 'Not found' }, 404)
  return c.json(piece)
})

pieceRoutes.delete('/:id', authMiddleware, (c) => {
  const userId = c.get('userId') as number
  const id = parseInt(c.req.param('id'))
  const piece = db.select().from(pieces).where(and(eq(pieces.id, id), eq(pieces.user_id, userId))).get()
  if (!piece) return c.json({ error: 'Not found' }, 404)
  db.delete(pieces).where(eq(pieces.id, id)).run()
  return c.json({ ok: true })
})

export default pieceRoutes
