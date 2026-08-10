import { Hono } from 'hono'
import { and, asc, desc, eq, inArray, isNotNull, isNull, notInArray, or, sql } from 'drizzle-orm'
import { db, pieces, promptClusters, prompts, worldVersions } from '../../db'
import { type Variables, authMiddleware } from '../../middleware'
import { findUserWorld, getUserId, pagination, paramInt } from '../../route-helpers'
import { cosineSimilarity, embedPrompt, parseEmbedding, recomputePromptCluster } from '../../prompt-clustering'
import { parseAdditionIds } from '../../world-additions'

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
  world_version_id: number | null
  updated_at: number
}

// The world version a cluster is tagged with, as display fields. version_number/name are null when
// the tag points at a deleted version (orphaned) or is unset. Cheap — a world has few versions.
function versionLabelsForWorld(worldId: number) {
  const rows = db
    .select({ id: worldVersions.id, name: worldVersions.name, number: worldVersions.version_number })
    .from(worldVersions)
    .where(eq(worldVersions.world_id, worldId))
    .all()
  return new Map(rows.map(version => [version.id, version]))
}

function versionFields(versions: ReturnType<typeof versionLabelsForWorld>, worldVersionId: number | null) {
  const version = worldVersionId == null ? undefined : versions.get(worldVersionId)
  return {
    world_version_id: worldVersionId ?? null,
    version_number: version?.number ?? null,
    version_name: version?.name ?? null,
  }
}

function enrichClusters(userId: number, worldId: number, clusterRows: ClusterRow[]) {
  const clusterIds = clusterRows.map(cluster => cluster.id)
  const versions = versionLabelsForWorld(worldId)
  if (clusterIds.length === 0) return clusterRows.map(cluster => ({ ...cluster, ...versionFields(versions, cluster.world_version_id), title: 'Untitled cluster', latest_piece_at: null as number | null, used_additions: false }))

  const promptRows = db
    .select({
      id: prompts.id,
      cluster_id: prompts.cluster_id,
      text: prompts.text,
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

  const allPromptIds = promptRows.filter(prompt => prompt.cluster_id !== null).map(prompt => prompt.id)

  // Whether a prompt has ever been written with world additions switched on. The stamp lives on
  // pieces, so a prompt counts if any of its pieces carries a non-empty one. A cluster takes this
  // from its latest prompt alone — that prompt is the cluster's current text, and the card shows
  // how the premise as it now stands was written.
  const usedAdditionsByPrompt = new Map<number, boolean>()
  if (allPromptIds.length > 0) {
    const additionRows = db
      .select({
        prompt_id: pieces.prompt_id,
        used: sql<number>`max(case when ${pieces.addition_ids} is not null and ${pieces.addition_ids} <> '[]' then 1 else 0 end)`,
      })
      .from(pieces)
      .where(and(
        inArray(pieces.prompt_id, allPromptIds),
        eq(pieces.world_id, worldId),
        eq(pieces.user_id, userId),
      ))
      .groupBy(pieces.prompt_id)
      .all()
    for (const row of additionRows) usedAdditionsByPrompt.set(row.prompt_id, Number(row.used) === 1)
  }

  return clusterRows.map(cluster => {
    const clusterPrompts = promptsByCluster.get(cluster.id) ?? []
    const latestPrompt = clusterPrompts[0]
    return {
      ...cluster,
      ...versionFields(versions, cluster.world_version_id),
      latest_prompt_id: latestPrompt?.id ?? cluster.latest_prompt_id,
      title: latestPrompt?.text ?? 'Untitled cluster',
      latest_piece_at: latestPieceByCluster.get(cluster.id) ?? null,
      used_additions: latestPrompt ? usedAdditionsByPrompt.get(latestPrompt.id) ?? false : false,
    }
  })
}

// The prompt list shows the checked-out world version and only that version — versions are
// branches, and you no more see another branch's prompts here than another branch's files. There
// is no orphan case to allow for: deleting a version deletes its clusters outright.
function clusterVersionFilter(currentVersionId: number | null) {
  if (currentVersionId == null) return undefined
  return eq(promptClusters.world_version_id, currentVersionId)
}

// What the list asked to be narrowed to. "Nothing switched on" is a state of its own, not an
// absence of one: `none` is the plain shelf — the prompts written with no additions at all — and
// is what the list sits in by default. An absent param is the reader stepping out to everything.
type AdditionScope =
  | { kind: 'all' }
  | { kind: 'none' }
  | { kind: 'ids'; ids: number[] }

function requestedAdditionScope(c: any): AdditionScope {
  const raw = (c.req.query('additions') ?? '').trim()
  if (!raw) return { kind: 'all' }
  if (raw === 'none') return { kind: 'none' }
  const ids = parseAdditionIds(raw.split(','))
  return ids.length > 0 ? { kind: 'ids', ids } : { kind: 'all' }
}

// The prompts carrying an addition stamp. The stamp lives on pieces, so a prompt counts when any
// of its pieces carries one. With `wanted`, one of those ids — "any", not "all": a premise
// written under one of the additions that are on still belongs to the shelf as it now stands.
// With null, any addition at all, which is the set the plain shelf is the complement of.
function promptsWithAdditions(userId: number, worldId: number, wanted: number[] | null): Set<number> {
  const wantedIds = wanted ? new Set(wanted) : null
  const matched = new Set<number>()
  if (wantedIds && wantedIds.size === 0) return matched

  const rows = db
    .select({ prompt_id: pieces.prompt_id, addition_ids: pieces.addition_ids })
    .from(pieces)
    .where(and(
      eq(pieces.world_id, worldId),
      eq(pieces.user_id, userId),
      isNotNull(pieces.addition_ids),
    ))
    .all()
  for (const row of rows) {
    const ids = parseAdditionIds(row.addition_ids)
    if (ids.length === 0) continue
    if (!wantedIds || ids.some(id => wantedIds.has(id))) matched.add(row.prompt_id)
  }
  return matched
}

const SEARCH_LIMIT = 50

clusterRoutes.get('/search', authMiddleware, async (c: any) => {
  const userId = getUserId(c)
  const worldId = paramInt(c, 'id')
  const world = findUserWorld(userId, worldId)
  if (!world) return c.json({ error: 'Not found' }, 404)

  const query = (c.req.query('q') ?? '').trim()
  if (!query) return c.json({ items: [], total: 0, query, hasMore: false })

  const queryEmbedding = await embedPrompt(query)
  if (!queryEmbedding) return c.json({ error: 'Embedding failed' }, 503)

  // A cluster is represented by its latest prompt — that is its current text, and so it is what
  // a text search should match against. Clusters whose latest prompt hasn't been embedded yet
  // (the fetch runs in the background after saving, and can fail) simply don't match.
  const versionFilter = clusterVersionFilter(world.current_version_id)
  const clusters = db
    .select({
      id: promptClusters.id,
      latest_embedding: prompts.embedding,
      prompt_count: promptClusters.prompt_count,
      piece_count: promptClusters.piece_count,
      latest_prompt_id: promptClusters.latest_prompt_id,
      world_version_id: promptClusters.world_version_id,
      updated_at: promptClusters.updated_at,
    })
    .from(promptClusters)
    .innerJoin(prompts, eq(prompts.id, promptClusters.latest_prompt_id))
    .where(and(
      eq(promptClusters.user_id, userId),
      eq(promptClusters.world_id, worldId),
      isNotNull(prompts.embedding),
      versionFilter,
    ))
    .all()

  const scored: { cluster: ClusterRow; score: number }[] = []
  for (const cluster of clusters) {
    const embedding = parseEmbedding(cluster.latest_embedding)
    if (!embedding) continue
    scored.push({
      cluster: {
        id: cluster.id,
        prompt_count: cluster.prompt_count,
        piece_count: cluster.piece_count,
        latest_prompt_id: cluster.latest_prompt_id,
        world_version_id: cluster.world_version_id,
        updated_at: cluster.updated_at,
      },
      score: cosineSimilarity(queryEmbedding, embedding),
    })
  }
  // Narrowing to the shelf happens before the cut-off, so the top matches are the top matches
  // among the prompts the reader is actually looking at.
  const scope = requestedAdditionScope(c)
  let matches = scored
  if (scope.kind === 'ids') {
    const usingAdditions = promptsWithAdditions(userId, worldId, scope.ids)
    matches = scored.filter(({ cluster }) =>
      cluster.latest_prompt_id !== null && usingAdditions.has(cluster.latest_prompt_id))
  } else if (scope.kind === 'none') {
    const usingAdditions = promptsWithAdditions(userId, worldId, null)
    matches = scored.filter(({ cluster }) =>
      cluster.latest_prompt_id === null || !usingAdditions.has(cluster.latest_prompt_id))
  }
  matches.sort((a, b) => b.score - a.score)
  const top = matches.slice(0, SEARCH_LIMIT)

  const enriched = enrichClusters(userId, worldId, top.map(s => s.cluster))
  const items = enriched.map((cluster, i) => ({ ...cluster, score: top[i]!.score }))

  return c.json({ items, total: matches.length, query, hasMore: false })
})

clusterRoutes.get('/', authMiddleware, (c: any) => {
  const userId = getUserId(c)
  const worldId = paramInt(c, 'id')
  const world = findUserWorld(userId, worldId)
  if (!world) return c.json({ error: 'Not found' }, 404)

  const versionFilter = clusterVersionFilter(world.current_version_id)

  const { page, limit, offset } = pagination(c)
  const sortParam = c.req.query('sort') as string | undefined
  const sortKey: SortKey = sortParam && sortParam in SORT_ORDERS ? sortParam as SortKey : 'latest_updated'

  // A cluster belongs to the shelf when its latest prompt does — the same prompt the card's text
  // and its addition mark come from. Nothing matching means an empty list, not an unfiltered one.
  const scope = requestedAdditionScope(c)
  let additionFilter = undefined
  if (scope.kind === 'ids') {
    const promptIds = [...promptsWithAdditions(userId, worldId, scope.ids)]
    if (promptIds.length === 0) {
      return c.json({ items: [], page, limit, total: 0, totalPieces: 0, hasMore: false })
    }
    additionFilter = inArray(promptClusters.latest_prompt_id, promptIds)
  } else if (scope.kind === 'none') {
    // The complement: everything except the prompts written with something on. A cluster with no
    // latest prompt was written with nothing either, so it stays.
    const promptIds = [...promptsWithAdditions(userId, worldId, null)]
    if (promptIds.length > 0) {
      additionFilter = or(
        isNull(promptClusters.latest_prompt_id),
        notInArray(promptClusters.latest_prompt_id, promptIds),
      )
    }
  }

  const total = db
    .select({ value: sql<number>`count(*)` })
    .from(promptClusters)
    .where(and(eq(promptClusters.world_id, worldId), eq(promptClusters.user_id, userId), versionFilter, additionFilter))
    .get()?.value ?? 0
  const totalPieces = db
    .select({ value: sql<number>`coalesce(sum(${promptClusters.piece_count}), 0)` })
    .from(promptClusters)
    .where(and(eq(promptClusters.world_id, worldId), eq(promptClusters.user_id, userId), versionFilter, additionFilter))
    .get()?.value ?? 0
  const rows = db
    .select({
      id: promptClusters.id,
      prompt_count: promptClusters.prompt_count,
      piece_count: promptClusters.piece_count,
      latest_prompt_id: promptClusters.latest_prompt_id,
      world_version_id: promptClusters.world_version_id,
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
    .where(and(eq(promptClusters.world_id, worldId), eq(promptClusters.user_id, userId), versionFilter, additionFilter))
    .groupBy(
      promptClusters.id,
      promptClusters.prompt_count,
      promptClusters.piece_count,
      promptClusters.latest_prompt_id,
      promptClusters.world_version_id,
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
      world_version_id: promptClusters.world_version_id,
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
      ...versionFields(versionLabelsForWorld(worldId), cluster.world_version_id),
      latest_prompt_id: promptRows[promptRows.length - 1]?.id ?? cluster.latest_prompt_id,
      title: promptRows[promptRows.length - 1]?.text ?? 'Untitled cluster',
    },
    prompts: promptRows,
  })
})

// Delete a whole cluster: every prompt variation in it and every piece written from them.
// The cluster row itself goes away via recomputePromptCluster once its last prompt is gone.
clusterRoutes.delete('/:clusterId', authMiddleware, (c: any) => {
  const userId = getUserId(c)
  const worldId = paramInt(c, 'id')
  const clusterId = paramInt(c, 'clusterId')
  if (!findUserWorld(userId, worldId)) return c.json({ error: 'Not found' }, 404)

  const cluster = db
    .select({ id: promptClusters.id })
    .from(promptClusters)
    .where(and(
      eq(promptClusters.id, clusterId),
      eq(promptClusters.world_id, worldId),
      eq(promptClusters.user_id, userId),
    ))
    .get()
  if (!cluster) return c.json({ error: 'Cluster not found' }, 404)

  const promptIds = db
    .select({ id: prompts.id })
    .from(prompts)
    .where(and(eq(prompts.cluster_id, clusterId), eq(prompts.world_id, worldId), eq(prompts.user_id, userId)))
    .all()
    .map(prompt => prompt.id)

  const pieceCount = promptIds.length === 0 ? 0 : Number(db
    .select({ count: sql<number>`count(*)` })
    .from(pieces)
    .where(and(inArray(pieces.prompt_id, promptIds), eq(pieces.world_id, worldId), eq(pieces.user_id, userId)))
    .get()?.count ?? 0)

  db.transaction(tx => {
    if (promptIds.length > 0) {
      tx.delete(pieces)
        .where(and(inArray(pieces.prompt_id, promptIds), eq(pieces.world_id, worldId), eq(pieces.user_id, userId)))
        .run()
      tx.delete(prompts)
        .where(and(inArray(prompts.id, promptIds), eq(prompts.world_id, worldId), eq(prompts.user_id, userId)))
        .run()
    }
  })

  recomputePromptCluster(clusterId)
  // Belt and braces: a cluster with no prompts at all leaves recompute nothing to delete.
  db.delete(promptClusters)
    .where(and(
      eq(promptClusters.id, clusterId),
      eq(promptClusters.world_id, worldId),
      eq(promptClusters.user_id, userId),
    ))
    .run()

  return c.json({ ok: true, deletedPrompts: promptIds.length, deletedPieces: pieceCount })
})

export default clusterRoutes
