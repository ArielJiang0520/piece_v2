import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import { db, prompts, pieces } from '../db'
import { type Variables, authMiddleware } from '../middleware'
import { recomputePromptCluster, recomputePromptPieceCount } from '../prompt-clustering'

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
  const prompt = db
    .select({ cluster_id: prompts.cluster_id })
    .from(prompts)
    .where(and(eq(prompts.id, piece.prompt_id), eq(prompts.user_id, userId)))
    .get()

  db.delete(pieces).where(eq(pieces.id, id)).run()

  recomputePromptPieceCount(piece.prompt_id, userId)
  recomputePromptCluster(prompt?.cluster_id)

  return c.json({ ok: true })
})

export default pieceRoutes
