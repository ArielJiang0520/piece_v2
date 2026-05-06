import { Hono } from 'hono'
import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { db, pieces, promptClusters, prompts } from '../../db'
import { type Variables, authMiddleware } from '../../middleware'
import { findUserWorld, getUserId, pagination, paramInt } from '../../route-helpers'
import { cosineSimilarity, embedPrompt, parseEmbedding } from '../../prompt-clustering'

const clusterRoutes = new Hono<{ Variables: Variables }>()

const SORT_ORDERS = {
  latest_updated: [desc(promptClusters.updated_at), desc(promptClusters.id)],
  oldest_updated: [asc(promptClusters.updated_at), asc(promptClusters.id)],
  most_pieces: [desc(promptClusters.piece_count), desc(promptClusters.updated_at), desc(promptClusters.id)],
  most_variations: [desc(promptClusters.prompt_count), desc(promptClusters.updated_at), desc(promptClusters.id)],
} as const

type SortKey = keyof typeof SORT_ORDERS

interface ClusterRow {
  id: number
  prompt_count: number
  piece_count: number
  latest_prompt_id: number | null
  updated_at: number
}

function enrichClusters(userId: number, worldId: number, clusterRows: ClusterRow[]) {
  const clusterIds = clusterRows.map(cluster => cluster.id)
  if (clusterIds.length === 0) return clusterRows.map(cluster => ({ ...cluster, title: 'Untitled cluster', latest_piece_at: null as number | null }))

  const promptRows = db
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
  const latestPieceRows = db
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

  return clusterRows.map(cluster => {
    const clusterPrompts = promptsByCluster.get(cluster.id) ?? []
    const latestPrompt = clusterPrompts.find(prompt => prompt.id === cluster.latest_prompt_id) ?? clusterPrompts[0]
    return {
      ...cluster,
      title: latestPrompt?.text ?? 'Untitled cluster',
      latest_piece_at: latestPieceByCluster.get(cluster.id) ?? null,
    }
  })
}

const SEARCH_LIMIT = 50

clusterRoutes.get('/search', authMiddleware, async (c: any) => {
  const userId = getUserId(c)
  const worldId = paramInt(c, 'id')
  if (!findUserWorld(userId, worldId)) return c.json({ error: 'Not found' }, 404)

  const query = (c.req.query('q') ?? '').trim()
  if (!query) return c.json({ items: [], total: 0, query, hasMore: false })

  const queryEmbedding = await embedPrompt(query)
  if (!queryEmbedding) return c.json({ error: 'Embedding failed' }, 503)

  const clusters = db
    .select({
      id: promptClusters.id,
      average_embedding: promptClusters.average_embedding,
      prompt_count: promptClusters.prompt_count,
      piece_count: promptClusters.piece_count,
      latest_prompt_id: promptClusters.latest_prompt_id,
      updated_at: promptClusters.updated_at,
    })
    .from(promptClusters)
    .where(and(
      eq(promptClusters.user_id, userId),
      eq(promptClusters.world_id, worldId),
      isNotNull(promptClusters.average_embedding),
    ))
    .all()

  const scored: { cluster: ClusterRow; score: number }[] = []
  for (const cluster of clusters) {
    const embedding = parseEmbedding(cluster.average_embedding)
    if (!embedding) continue
    scored.push({
      cluster: {
        id: cluster.id,
        prompt_count: cluster.prompt_count,
        piece_count: cluster.piece_count,
        latest_prompt_id: cluster.latest_prompt_id,
        updated_at: cluster.updated_at,
      },
      score: cosineSimilarity(queryEmbedding, embedding),
    })
  }
  scored.sort((a, b) => b.score - a.score)
  const top = scored.slice(0, SEARCH_LIMIT)

  const enriched = enrichClusters(userId, worldId, top.map(s => s.cluster))
  const items = enriched.map((cluster, i) => ({ ...cluster, score: top[i]!.score }))

  return c.json({ items, total: scored.length, query, hasMore: false })
})

clusterRoutes.get('/', authMiddleware, (c: any) => {
  const userId = getUserId(c)
  const worldId = paramInt(c, 'id')
  if (!findUserWorld(userId, worldId)) return c.json({ error: 'Not found' }, 404)

  const { page, limit, offset } = pagination(c)
  const sortParam = c.req.query('sort') as string | undefined
  const sortKey: SortKey = sortParam && sortParam in SORT_ORDERS ? sortParam as SortKey : 'latest_updated'
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
    .orderBy(...SORT_ORDERS[sortKey])
    .limit(limit + 1)
    .offset(offset)
    .all()

  const pageRows = rows.slice(0, limit)
  const items = enrichClusters(userId, worldId, pageRows)

  return c.json({ items, page, limit, total, totalPieces, hasMore: rows.length > limit })
})

clusterRoutes.get('/:clusterId', authMiddleware, (c: any) => {
  const userId = getUserId(c)
  const worldId = paramInt(c, 'id')
  const clusterId = paramInt(c, 'clusterId')
  if (!findUserWorld(userId, worldId)) return c.json({ error: 'Not found' }, 404)

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
