import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import { db, prompts, pieces } from '../db'
import { type Variables, authMiddleware } from '../middleware'
import { getUserId, paramInt } from '../route-helpers'

const pieceRoutes = new Hono<{ Variables: Variables }>()

pieceRoutes.get('/:id', authMiddleware, (c) => {
  const userId = getUserId(c)
  const id = paramInt(c, 'id')
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

export default pieceRoutes
