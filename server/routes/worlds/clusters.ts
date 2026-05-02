import { Hono } from 'hono'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
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
  const total = db
    .select({ value: sql<number>`count(*)` })
    .from(promptClusters)
    .where(and(eq(promptClusters.world_id, worldId), eq(promptClusters.user_id, userId)))
    .get()?.value ?? 0
  const totalPieces = db
    .select({ value: sql<number>`coalesce(sum(${promptClusters.piece_count}), 0)` })
    .from(promptClusters)
    .where(and(eq(promptClusters.world_id, worldId), eq(promptClusters.user_id, userId)))
    .get()?.value ?? 0
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

  const pageRows = rows.slice(0, limit)
  const clusterIds = pageRows.map(cluster => cluster.id)
  const promptRows = clusterIds.length === 0 ? [] : db
    .select({
      id: prompts.id,
      cluster_id: prompts.cluster_id,
      text: prompts.text,
      updated_at: prompts.updated_at,
    })
    .from(prompts)
    .where(and(
      inArray(prompts.cluster_id, clusterIds),
      eq(prompts.world_id, worldId),
      eq(prompts.user_id, userId),
    ))
    .orderBy(desc(prompts.updated_at), desc(prompts.id))
    .all()
  const latestPieceRows = clusterIds.length === 0 ? [] : db
    .select({
      cluster_id: prompts.cluster_id,
      latest_piece_at: sql<number | null>`max(${pieces.created_at})`,
    })
    .from(pieces)
    .innerJoin(prompts, eq(pieces.prompt_id, prompts.id))
    .where(and(
      inArray(prompts.cluster_id, clusterIds),
      eq(pieces.world_id, worldId),
      eq(pieces.user_id, userId),
      eq(prompts.world_id, worldId),
      eq(prompts.user_id, userId),
    ))
    .groupBy(prompts.cluster_id)
    .all()

  const promptsByCluster = new Map<number, typeof promptRows>()
  for (const prompt of promptRows) {
    if (prompt.cluster_id === null) continue
    const clusterPrompts = promptsByCluster.get(prompt.cluster_id) ?? []
    clusterPrompts.push(prompt)
    promptsByCluster.set(prompt.cluster_id, clusterPrompts)
  }

  const latestPieceByCluster = new Map(
    latestPieceRows
      .filter(row => row.cluster_id !== null)
      .map(row => [row.cluster_id!, row.latest_piece_at]),
  )

  const items = pageRows.map(cluster => {
    const clusterPrompts = promptsByCluster.get(cluster.id) ?? []
    const latestPrompt = clusterPrompts.find(prompt => prompt.id === cluster.latest_prompt_id) ?? clusterPrompts[0]

    return {
      ...cluster,
      title: latestPrompt?.text ?? 'Untitled cluster',
      latest_piece_at: latestPieceByCluster.get(cluster.id) ?? null,
    }
  })

  return c.json({ items, page, limit, total, totalPieces, hasMore: rows.length > limit })
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
    .orderBy(asc(prompts.created_at), asc(prompts.id))
    .all()

  return c.json({
    cluster: {
      ...cluster,
      title: promptRows.find(prompt => prompt.id === cluster.latest_prompt_id)?.text ?? promptRows[0]?.text ?? 'Untitled cluster',
    },
    prompts: promptRows,
  })
})

export default clusterRoutes
