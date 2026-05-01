import { Hono } from 'hono'
import { eq, and, desc, sql } from 'drizzle-orm'
import { db, worlds, prompts, pieces } from '../../db'
import { type Variables, authMiddleware } from '../../middleware'
import { clusterPromptById, recomputePromptCluster } from '../../prompt-clustering'

const promptRoutes = new Hono<{ Variables: Variables }>()

function pagination(c: any, fallbackLimit = 20) {
  const page = Math.max(1, parseInt(c.req.query('page') || '1') || 1)
  const limit = Math.min(50, Math.max(1, parseInt(c.req.query('limit') || String(fallbackLimit)) || fallbackLimit))
  return { page, limit, offset: (page - 1) * limit }
}

function requireWorld(userId: number, worldId: number) {
  return db
    .select()
    .from(worlds)
    .where(and(eq(worlds.id, worldId), eq(worlds.user_id, userId)))
    .get()
}

promptRoutes.post('/', authMiddleware, async (c: any) => {
  const userId = c.get('userId') as number
  const worldId = parseInt(c.req.param('id'))
  const world = requireWorld(userId, worldId)
  if (!world) return c.json({ error: 'Not found' }, 404)

  const body = await c.req.json()
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text) return c.json({ error: 'Prompt required' }, 400)

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

promptRoutes.get('/:promptId', authMiddleware, (c: any) => {
  const userId = c.get('userId') as number
  const worldId = parseInt(c.req.param('id'))
  const promptId = parseInt(c.req.param('promptId'))
  const world = requireWorld(userId, worldId)
  if (!world) return c.json({ error: 'Not found' }, 404)

  const prompt = db
    .select({
      id: prompts.id,
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
  const userId = c.get('userId') as number
  const worldId = parseInt(c.req.param('id'))
  const promptId = parseInt(c.req.param('promptId'))
  const world = requireWorld(userId, worldId)
  if (!world) return c.json({ error: 'Not found' }, 404)

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

  return c.json({ ok: true })
})

export default promptRoutes
