import { Hono } from 'hono'
import { eq, and, desc, sql } from 'drizzle-orm'
import { db, prompts, pieces } from '../../db'
import { type Variables, authMiddleware } from '../../middleware'
import { findUserWorld, getUserId, pagination, paramInt } from '../../route-helpers'
import { recomputePromptCluster } from '../../prompt-clustering'

const promptRoutes = new Hono<{ Variables: Variables }>()

promptRoutes.get('/:promptId', authMiddleware, (c: any) => {
  const userId = getUserId(c)
  const worldId = paramInt(c, 'id')
  const promptId = paramInt(c, 'promptId')
  if (!findUserWorld(userId, worldId)) return c.json({ error: 'Not found' }, 404)

  const prompt = db
    .select({
      id: prompts.id,
      cluster_id: prompts.cluster_id,
      text: prompts.text,
      piece_count: prompts.piece_count,
      created_at: prompts.created_at,
      updated_at: prompts.updated_at,
    })
    .from(prompts)
    .where(and(eq(prompts.id, promptId), eq(prompts.world_id, worldId), eq(prompts.user_id, userId)))
    .get()
  if (!prompt) return c.json({ error: 'Prompt not found' }, 404)

  const { page, limit, offset } = pagination(c)
  const rows = db
    .select({
      id: pieces.id,
      preview: sql<string>`substr(${pieces.body}, 1, 200)`,
      created_at: pieces.created_at,
      updated_at: pieces.updated_at,
    })
    .from(pieces)
    .where(and(eq(pieces.prompt_id, promptId), eq(pieces.world_id, worldId), eq(pieces.user_id, userId)))
    .orderBy(desc(pieces.created_at), desc(pieces.id))
    .limit(limit + 1)
    .offset(offset)
    .all()

  return c.json({
    prompt,
    pieces: rows.slice(0, limit),
    page,
    limit,
    hasMore: rows.length > limit,
  })
})

promptRoutes.delete('/:promptId', authMiddleware, (c: any) => {
  const userId = getUserId(c)
  const worldId = paramInt(c, 'id')
  const promptId = paramInt(c, 'promptId')
  if (!findUserWorld(userId, worldId)) return c.json({ error: 'Not found' }, 404)

  const prompt = db
    .select({
      id: prompts.id,
      cluster_id: prompts.cluster_id,
    })
    .from(prompts)
    .where(and(eq(prompts.id, promptId), eq(prompts.world_id, worldId), eq(prompts.user_id, userId)))
    .get()
  if (!prompt) return c.json({ error: 'Prompt not found' }, 404)

  const pieceCount = Number(db
    .select({ count: sql<number>`count(*)` })
    .from(pieces)
    .where(and(eq(pieces.prompt_id, promptId), eq(pieces.world_id, worldId), eq(pieces.user_id, userId)))
    .get()?.count ?? 0)

  db.transaction(tx => {
    tx.delete(pieces)
      .where(and(eq(pieces.prompt_id, promptId), eq(pieces.world_id, worldId), eq(pieces.user_id, userId)))
      .run()
    tx.delete(prompts)
      .where(and(eq(prompts.id, promptId), eq(prompts.world_id, worldId), eq(prompts.user_id, userId)))
      .run()
  })

  recomputePromptCluster(prompt.cluster_id)

  const nextPrompt = prompt.cluster_id === null
    ? null
    : db
      .select({ id: prompts.id })
      .from(prompts)
      .where(and(eq(prompts.cluster_id, prompt.cluster_id), eq(prompts.world_id, worldId), eq(prompts.user_id, userId)))
      .orderBy(desc(prompts.created_at), desc(prompts.id))
      .get()

  return c.json({
    ok: true,
    deletedPieces: pieceCount,
    nextPromptId: nextPrompt?.id ?? null,
    clusterDeleted: prompt.cluster_id !== null && !nextPrompt,
  })
})

export default promptRoutes
