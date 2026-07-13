import { Hono } from 'hono'
import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { db, pieces, promptClusters, prompts } from '../../db'
import { type Variables, authMiddleware } from '../../middleware'
import { findUserWorld, getUserId, pagination, paramInt } from '../../route-helpers'
import { cosineSimilarity, embedPrompt, parseEmbedding } from '../../prompt-clustering'

const clusterRoutes = new Hono<{ Variables: Variables }>()

// Activity = the most recent piece edit (create or resume/re-save), so a resumed piece floats
// its cluster to the top. Falls back to the cluster's own timestamp when it has no pieces.
const clusterActivityAt = sql<number>`coalesce(max(${pieces.updated_at}), ${promptClusters.updated_at})`

const SORT_ORDERS = {
  latest: [desc(clusterActivityAt), desc(promptClusters.id)],
  latest_updated: [desc(clusterActivityAt), desc(promptClusters.id)],
  oldest: [asc(clusterActivityAt), asc(promptClusters.id)],
  oldest_updated: [asc(clusterActivityAt), asc(promptClusters.id)],
  most_pieces: [desc(promptClusters.piece_count), desc(clusterActivityAt), desc(promptClusters.id)],
  most_variations: [desc(promptClusters.prompt_count), desc(clusterActivityAt), desc(promptClusters.id)],
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
  if (clusterIds.length === 0) return clusterRows.map(cluster => ({ ...cluster, title: 'Untitled cluster', latest_piece_at: null as number | null, similar_count: 0, is_generated: false }))

  const promptRows = db
    .select({
      id: prompts.id,
      cluster_id: prompts.cluster_id,
      text: prompts.text,
      similar_to_prompt_id: prompts.similar_to_prompt_id,
      is_generated: prompts.is_generated,
      created_at: prompts.created_at,
    })
    .from(prompts)
    .where(and(
      inArray(prompts.cluster_id, clusterIds),
      eq(prompts.world_id, worldId),
      eq(prompts.user_id, userId),
    ))
    .orderBy(desc(prompts.created_at), desc(prompts.id))
    .all()
  const latestPieceRows = db
    .select({
      cluster_id: prompts.cluster_id,
      latest_piece_at: sql<number | null>`max(${pieces.updated_at})`,
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

  // "Similar prompts" ancestry, per cluster. A cluster is "generated" when any of its prompts was
  // born from an AI candidate — either seeded from an outside prompt ("More like this") or a
  // world-native "Spark ideas" pick (is_generated, no parent). Its similar_count is how many
  // prompts (anywhere in this world) were seeded from any prompt in the cluster.
  const promptIdToCluster = new Map<number, number>()
  const generated = new Set<number>()
  for (const prompt of promptRows) {
    if (prompt.cluster_id === null) continue
    promptIdToCluster.set(prompt.id, prompt.cluster_id)
    if (prompt.similar_to_prompt_id !== null || prompt.is_generated) generated.add(prompt.cluster_id)
  }

  const similarCountByCluster = new Map<number, number>()
  const allPromptIds = [...promptIdToCluster.keys()]
  if (allPromptIds.length > 0) {
    const childRows = db
      .select({
        similar_to_prompt_id: prompts.similar_to_prompt_id,
        count: sql<number>`count(*)`,
      })
      .from(prompts)
      .where(and(
        inArray(prompts.similar_to_prompt_id, allPromptIds),
        eq(prompts.world_id, worldId),
        eq(prompts.user_id, userId),
      ))
      .groupBy(prompts.similar_to_prompt_id)
      .all()
    for (const row of childRows) {
      if (row.similar_to_prompt_id === null) continue
      const clusterId = promptIdToCluster.get(row.similar_to_prompt_id)
      if (clusterId === undefined) continue
      similarCountByCluster.set(clusterId, (similarCountByCluster.get(clusterId) ?? 0) + Number(row.count))
    }
  }

  return clusterRows.map(cluster => {
    const clusterPrompts = promptsByCluster.get(cluster.id) ?? []
    const latestPrompt = clusterPrompts[0]
    return {
      ...cluster,
      latest_prompt_id: latestPrompt?.id ?? cluster.latest_prompt_id,
      title: latestPrompt?.text ?? 'Untitled cluster',
      latest_piece_at: latestPieceByCluster.get(cluster.id) ?? null,
      similar_count: similarCountByCluster.get(cluster.id) ?? 0,
      is_generated: generated.has(cluster.id),
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
    .leftJoin(prompts, and(
      eq(prompts.cluster_id, promptClusters.id),
      eq(prompts.world_id, worldId),
      eq(prompts.user_id, userId),
    ))
    .leftJoin(pieces, and(
      eq(pieces.prompt_id, prompts.id),
      eq(pieces.world_id, worldId),
      eq(pieces.user_id, userId),
    ))
    .where(and(eq(promptClusters.world_id, worldId), eq(promptClusters.user_id, userId)))
    .groupBy(
      promptClusters.id,
      promptClusters.prompt_count,
      promptClusters.piece_count,
      promptClusters.latest_prompt_id,
      promptClusters.updated_at,
    )
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
      latest_prompt_id: promptRows[promptRows.length - 1]?.id ?? cluster.latest_prompt_id,
      title: promptRows[promptRows.length - 1]?.text ?? 'Untitled cluster',
    },
    prompts: promptRows,
  })
})

export default clusterRoutes
