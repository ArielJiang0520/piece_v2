import { Hono } from 'hono'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db, pieces, promptClusters, prompts, worlds } from '../../db'
import { type Variables, authMiddleware } from '../../middleware'

const clusterRoutes = new Hono<{ Variables: Variables }>()

function requireWorld(userId: number, worldId: number) {
  return db
    .select()
    .from(worlds)
    .where(and(eq(worlds.id, worldId), eq(worlds.user_id, userId)))
    .get()
}

function pagination(c: any, fallbackLimit = 20) {
  const page = Math.max(1, parseInt(c.req.query('page') || '1') || 1)
  const limit = Math.min(50, Math.max(1, parseInt(c.req.query('limit') || String(fallbackLimit)) || fallbackLimit))
  return { page, limit, offset: (page - 1) * limit }
}

clusterRoutes.get('/', authMiddleware, (c: any) => {
  const userId = c.get('userId') as number
  const worldId = parseInt(c.req.param('id'))
  const world = requireWorld(userId, worldId)
  if (!world) return c.json({ error: 'Not found' }, 404)

  const { page, limit, offset } = pagination(c)
  const rows = db
    .select({
      id: promptClusters.id,
      prompt_count: promptClusters.prompt_count,
      piece_count: promptClusters.piece_count,
      latest_prompt_id: promptClusters.latest_prompt_id,
      updated_at: promptClusters.updated_at,
    })
    .from(promptClusters)
    .where(and(eq(promptClusters.world_id, worldId), eq(promptClusters.user_id, userId)))
    .orderBy(desc(promptClusters.updated_at), desc(promptClusters.id))
    .limit(limit + 1)
    .offset(offset)
    .all()

  const items = rows.slice(0, limit).map(cluster => {
    const clusterPrompts = db
      .select({
        id: prompts.id,
        text: prompts.text,
        updated_at: prompts.updated_at,
      })
      .from(prompts)
      .where(and(eq(prompts.cluster_id, cluster.id), eq(prompts.world_id, worldId), eq(prompts.user_id, userId)))
      .orderBy(desc(prompts.updated_at), desc(prompts.id))
      .all()
    const promptIds = clusterPrompts.map(prompt => prompt.id)
    const latestPrompt = clusterPrompts.find(prompt => prompt.id === cluster.latest_prompt_id) ?? clusterPrompts[0]

    return {
      ...cluster,
      title: latestPrompt?.text ?? 'Untitled cluster',
      prompt_ids: promptIds,
      pieces: promptIds.length === 0 ? [] : db
        .select({
          id: pieces.id,
          prompt_id: pieces.prompt_id,
          prompt: prompts.text,
          preview: sql<string>`substr(${pieces.body}, 1, 120)`,
          created_at: pieces.created_at,
        })
        .from(pieces)
        .innerJoin(prompts, eq(pieces.prompt_id, prompts.id))
        .where(and(
          inArray(pieces.prompt_id, promptIds),
          eq(pieces.world_id, worldId),
          eq(pieces.user_id, userId),
        ))
        .orderBy(desc(pieces.created_at), desc(pieces.id))
        .limit(3)
        .all(),
    }
  })

  return c.json({ items, page, limit, hasMore: rows.length > limit })
})

clusterRoutes.get('/:clusterId', authMiddleware, (c: any) => {
  const userId = c.get('userId') as number
  const worldId = parseInt(c.req.param('id'))
  const clusterId = parseInt(c.req.param('clusterId'))
  const world = requireWorld(userId, worldId)
  if (!world) return c.json({ error: 'Not found' }, 404)

  const cluster = db
    .select({
      id: promptClusters.id,
      prompt_count: promptClusters.prompt_count,
      piece_count: promptClusters.piece_count,
      latest_prompt_id: promptClusters.latest_prompt_id,
      created_at: promptClusters.created_at,
      updated_at: promptClusters.updated_at,
    })
    .from(promptClusters)
    .where(and(
      eq(promptClusters.id, clusterId),
      eq(promptClusters.world_id, worldId),
      eq(promptClusters.user_id, userId),
    ))
    .get()
  if (!cluster) return c.json({ error: 'Cluster not found' }, 404)

  const promptRows = db
    .select({
      id: prompts.id,
      text: prompts.text,
      piece_count: prompts.piece_count,
      created_at: prompts.created_at,
      updated_at: prompts.updated_at,
    })
    .from(prompts)
    .where(and(eq(prompts.cluster_id, clusterId), eq(prompts.world_id, worldId), eq(prompts.user_id, userId)))
    .orderBy(desc(prompts.updated_at), desc(prompts.id))
    .all()

  const items = promptRows.map(prompt => ({
    ...prompt,
    pieces: db
      .select({
        id: pieces.id,
        preview: sql<string>`substr(${pieces.body}, 1, 200)`,
        created_at: pieces.created_at,
      })
      .from(pieces)
      .where(and(eq(pieces.prompt_id, prompt.id), eq(pieces.world_id, worldId), eq(pieces.user_id, userId)))
      .orderBy(desc(pieces.created_at), desc(pieces.id))
      .all(),
  }))

  return c.json({
    cluster: {
      ...cluster,
      title: items.find(prompt => prompt.id === cluster.latest_prompt_id)?.text ?? items[0]?.text ?? 'Untitled cluster',
    },
    prompts: items,
  })
})

export default clusterRoutes
