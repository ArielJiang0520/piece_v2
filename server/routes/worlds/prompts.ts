import { Hono } from 'hono'
import { eq, and, desc, sql } from 'drizzle-orm'
import { db, prompts, pieces } from '../../db'
import { type Variables, authMiddleware } from '../../middleware'
import { findUserWorld, getUserId, pagination, paramInt } from '../../route-helpers'
import { clusterPromptById, recomputePromptCluster } from '../../prompt-clustering'
import { normalizePromptInput, promptTextMatchesNormalized } from '../../prompt-text'

const promptRoutes = new Hono<{ Variables: Variables }>()

promptRoutes.post('/', authMiddleware, async (c: any) => {
  const userId = getUserId(c)
  const worldId = paramInt(c, 'id')
  if (!findUserWorld(userId, worldId)) return c.json({ error: 'Not found' }, 404)

  const body = await c.req.json()
  const text = normalizePromptInput(body.text)
  if (!text) return c.json({ error: 'Prompt required' }, 400)

  const existingPrompt = db
    .select({
      id: prompts.id,
      cluster_id: prompts.cluster_id,
      text: prompts.text,
      piece_count: prompts.piece_count,
      created_at: prompts.created_at,
      updated_at: prompts.updated_at,
    })
    .from(prompts)
    .where(and(promptTextMatchesNormalized(prompts.text, text), eq(prompts.world_id, worldId), eq(prompts.user_id, userId)))
    .orderBy(desc(prompts.updated_at), desc(prompts.id))
    .get()

  if (existingPrompt) {
    const clusterId = existingPrompt.cluster_id ?? await clusterPromptById(existingPrompt.id)

    return c.json({
      id: existingPrompt.id,
      cluster_id: clusterId,
      text: existingPrompt.text,
      piece_count: existingPrompt.piece_count,
      created_at: existingPrompt.created_at,
      updated_at: existingPrompt.updated_at,
    })
  }

  const now = Date.now()
  const prompt = db.insert(prompts).values({
    user_id: userId,
    world_id: worldId,
    text,
    piece_count: 0,
    created_at: now,
    updated_at: now,
  }).returning().get()
  const clusterId = await clusterPromptById(prompt.id)

  return c.json({
    id: prompt.id,
    cluster_id: clusterId,
    text: prompt.text,
    piece_count: prompt.piece_count,
    created_at: prompt.created_at,
    updated_at: prompt.updated_at,
  })
})

promptRoutes.get('/match', authMiddleware, (c: any) => {
  const userId = getUserId(c)
  const worldId = paramInt(c, 'id')
  if (!findUserWorld(userId, worldId)) return c.json({ error: 'Not found' }, 404)

  const text = normalizePromptInput(c.req.query('text'))
  if (!text) return c.json({ prompt: null })

  const prompt = db
    .select({
      id: prompts.id,
      text: prompts.text,
      piece_count: prompts.piece_count,
    })
    .from(prompts)
    .where(and(promptTextMatchesNormalized(prompts.text, text), eq(prompts.world_id, worldId), eq(prompts.user_id, userId)))
    .orderBy(desc(prompts.updated_at), desc(prompts.id))
    .get()

  return c.json({ prompt: prompt ?? null })
})

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
    .select({ id: prompts.id, cluster_id: prompts.cluster_id })
    .from(prompts)
    .where(and(eq(prompts.id, promptId), eq(prompts.world_id, worldId), eq(prompts.user_id, userId)))
    .get()
  if (!prompt) return c.json({ error: 'Prompt not found' }, 404)

  db.delete(prompts)
    .where(and(eq(prompts.id, promptId), eq(prompts.world_id, worldId), eq(prompts.user_id, userId)))
    .run()
  recomputePromptCluster(prompt.cluster_id)

  return c.json({ ok: true, cluster_id: prompt.cluster_id })
})

export default promptRoutes
