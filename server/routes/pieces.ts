import { Hono } from 'hono'
import { eq, and, sql } from 'drizzle-orm'
import { db, prompts, pieces } from '../db'
import { type Variables, authMiddleware } from '../middleware'

const pieceRoutes = new Hono<{ Variables: Variables }>()

pieceRoutes.get('/:id', authMiddleware, (c) => {
  const userId = c.get('userId') as number
  const id = parseInt(c.req.param('id'))
  const piece = db
    .select({
      id: pieces.id,
      user_id: pieces.user_id,
      world_id: pieces.world_id,
      prompt_id: pieces.prompt_id,
      prompt: prompts.text,
      body: pieces.body,
      model: pieces.model,
      created_at: pieces.created_at,
    })
    .from(pieces)
    .innerJoin(prompts, eq(pieces.prompt_id, prompts.id))
    .where(and(eq(pieces.id, id), eq(pieces.user_id, userId)))
    .get()
  if (!piece) return c.json({ error: 'Not found' }, 404)
  return c.json(piece)
})

pieceRoutes.delete('/:id', authMiddleware, (c) => {
  const userId = c.get('userId') as number
  const id = parseInt(c.req.param('id'))
  const piece = db.select().from(pieces).where(and(eq(pieces.id, id), eq(pieces.user_id, userId))).get()
  if (!piece) return c.json({ error: 'Not found' }, 404)
  db.delete(pieces).where(eq(pieces.id, id)).run()

  const summary = db
    .select({
      count: sql<number>`count(*)`,
      latest_at: sql<number | null>`max(${pieces.created_at})`,
    })
    .from(pieces)
    .where(and(eq(pieces.prompt_id, piece.prompt_id), eq(pieces.user_id, userId)))
    .get()

  db.update(prompts)
    .set({
      piece_count: summary?.count ?? 0,
      updated_at: summary?.latest_at ?? Date.now(),
    })
    .where(eq(prompts.id, piece.prompt_id))
    .run()

  return c.json({ ok: true })
})

export default pieceRoutes
