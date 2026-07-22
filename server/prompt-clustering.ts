import { and, desc, eq, isNotNull, sql } from 'drizzle-orm'
import { db, pieces, promptClusters, prompts } from './db'

const EMBEDDING_MODEL = 'baai/bge-m3'
const EMBEDDING_TIMEOUT_MS = 15000
const DEFAULT_SIMILARITY_THRESHOLD = 0.95

interface PromptForCluster {
  id: number
  user_id: number
  world_id: number
  cluster_id: number | null
  text: string
  embedding: string | null
  piece_count: number
  world_version_id: number | null
  created_at: number
  updated_at: number
}

interface ClusterPromptOptions {
  logDecisions?: boolean
  reuseExistingEmbedding?: boolean
}

export function similarityThreshold() {
  const parsed = Number(process.env.PROMPT_CLUSTER_SIMILARITY_THRESHOLD)
  return Number.isFinite(parsed) ? parsed : DEFAULT_SIMILARITY_THRESHOLD
}

export function parseEmbedding(value: string | null): number[] | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed) || parsed.some(item => typeof item !== 'number')) return null
    return parsed
  } catch {
    return null
  }
}

function stringifyEmbedding(embedding: number[] | null) {
  return embedding ? JSON.stringify(embedding) : null
}

export function cosineSimilarity(a: number[], b: number[]) {
  if (a.length === 0 || a.length !== b.length) return 0

  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i += 1) {
    const av = a[i]!
    const bv = b[i]!
    dot += av * bv
    normA += av * av
    normB += bv * bv
  }

  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

function averageEmbeddings(embeddings: number[][]) {
  const first = embeddings[0]
  if (!first) return null

  const average = Array.from({ length: first.length }, () => 0)
  for (const embedding of embeddings) {
    if (embedding.length !== first.length) continue
    for (let i = 0; i < embedding.length; i += 1) {
      average[i] += embedding[i]!
    }
  }

  for (let i = 0; i < average.length; i += 1) {
    average[i] /= embeddings.length
  }
  return average
}

export async function embedPrompt(text: string) {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    console.warn('OPENROUTER_API_KEY is not set; creating singleton prompt cluster without embedding')
    return null
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), EMBEDDING_TIMEOUT_MS)

  try {
    const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      console.warn(`Prompt embedding failed: OpenRouter ${response.status} ${response.statusText}`)
      return null
    }

    const body = await response.json() as any
    const embedding = body?.data?.[0]?.embedding
    if (!Array.isArray(embedding) || embedding.some((item: unknown) => typeof item !== 'number')) {
      console.warn('Prompt embedding response did not contain a numeric embedding')
      return null
    }

    return embedding as number[]
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown embedding error'
    console.warn(`Prompt embedding failed: ${message}`)
    return null
  } finally {
    clearTimeout(timeout)
  }
}

function createCluster(prompt: PromptForCluster, embedding: number[] | null) {
  const now = Date.now()
  const cluster = db.insert(promptClusters).values({
    user_id: prompt.user_id,
    world_id: prompt.world_id,
    average_embedding: stringifyEmbedding(embedding),
    prompt_count: 1,
    piece_count: prompt.piece_count,
    latest_prompt_id: prompt.id,
    world_version_id: prompt.world_version_id,
    created_at: now,
    updated_at: prompt.created_at,
  }).returning({ id: promptClusters.id }).get()

  db.update(prompts)
    .set({
      cluster_id: cluster.id,
      embedding: stringifyEmbedding(embedding),
    })
    .where(eq(prompts.id, prompt.id))
    .run()

  return cluster.id
}

function bestClusterForEmbedding(userId: number, worldId: number, embedding: number[], logDecision?: (message: string) => void) {
  const clusters = db
    .select({
      id: promptClusters.id,
      average_embedding: promptClusters.average_embedding,
      prompt_count: promptClusters.prompt_count,
      piece_count: promptClusters.piece_count,
      latest_prompt_id: promptClusters.latest_prompt_id,
      world_version_id: promptClusters.world_version_id,
      updated_at: promptClusters.updated_at,
    })
    .from(promptClusters)
    .where(and(
      eq(promptClusters.user_id, userId),
      eq(promptClusters.world_id, worldId),
      isNotNull(promptClusters.average_embedding),
    ))
    .all()

  let best: (typeof clusters)[number] | null = null
  let bestScore = 0
  const threshold = similarityThreshold()

  logDecision?.(`  comparing with ${clusters.length} existing cluster${clusters.length === 1 ? '' : 's'}; threshold=${threshold}`)

  for (const cluster of clusters) {
    const clusterEmbedding = parseEmbedding(cluster.average_embedding)
    if (!clusterEmbedding) {
      logDecision?.(`  cluster ${cluster.id}: skipped; invalid average embedding`)
      continue
    }

    const score = cosineSimilarity(embedding, clusterEmbedding)
    logDecision?.(`  cluster ${cluster.id}: prompts=${cluster.prompt_count} cos_sim=${score.toFixed(6)}`)
    if (score > bestScore) {
      best = cluster
      bestScore = score
    }
  }

  if (!best) {
    logDecision?.('  decision: create new cluster; no comparable cluster found')
    return null
  }

  if (bestScore < threshold) {
    logDecision?.(`  decision: create new cluster; best cluster ${best.id} cos_sim=${bestScore.toFixed(6)} is below threshold`)
    return null
  }

  logDecision?.(`  decision: use cluster ${best.id}; cos_sim=${bestScore.toFixed(6)}`)
  return best
}

function addPromptToCluster(prompt: PromptForCluster, cluster: ReturnType<typeof bestClusterForEmbedding>, embedding: number[]) {
  if (!cluster) return createCluster(prompt, embedding)

  const existingAverage = parseEmbedding(cluster.average_embedding)
  const nextPromptCount = cluster.prompt_count + 1
  const nextAverage = existingAverage
    ? existingAverage.map((value, index) => ((value * cluster.prompt_count) + embedding[index]!) / nextPromptCount)
    : embedding

  db.update(promptClusters)
    .set({
      average_embedding: stringifyEmbedding(nextAverage),
      prompt_count: nextPromptCount,
      piece_count: cluster.piece_count + prompt.piece_count,
      latest_prompt_id: prompt.created_at >= cluster.updated_at ? prompt.id : cluster.latest_prompt_id,
      // The cluster is tagged with its latest prompt's version, so it moves only when the
      // incoming prompt becomes the latest.
      world_version_id: prompt.created_at >= cluster.updated_at ? prompt.world_version_id : cluster.world_version_id,
      updated_at: Math.max(cluster.updated_at, prompt.created_at),
    })
    .where(eq(promptClusters.id, cluster.id))
    .run()

  db.update(prompts)
    .set({
      cluster_id: cluster.id,
      embedding: stringifyEmbedding(embedding),
    })
    .where(eq(prompts.id, prompt.id))
    .run()

  return cluster.id
}

export async function clusterPromptById(promptId: number, options: ClusterPromptOptions = {}) {
  const logDecision = options.logDecisions ? (message: string) => console.log(message) : undefined
  const prompt = db
    .select({
      id: prompts.id,
      user_id: prompts.user_id,
      world_id: prompts.world_id,
      cluster_id: prompts.cluster_id,
      text: prompts.text,
      embedding: prompts.embedding,
      piece_count: prompts.piece_count,
      world_version_id: prompts.world_version_id,
      created_at: prompts.created_at,
      updated_at: prompts.updated_at,
    })
    .from(prompts)
    .where(eq(prompts.id, promptId))
    .get()

  if (!prompt) throw new Error(`Prompt ${promptId} not found`)
  if (prompt.cluster_id !== null) {
    logDecision?.(`prompt ${prompt.id}: already in cluster ${prompt.cluster_id}; skipping`)
    return prompt.cluster_id
  }

  logDecision?.(`prompt ${prompt.id}: ${JSON.stringify(prompt.text.slice(0, 120))}`)

  let embedding = options.reuseExistingEmbedding ? parseEmbedding(prompt.embedding) : null
  if (embedding) {
    logDecision?.('  embedding: reused stored embedding')
  } else {
    logDecision?.('  embedding: requesting embedding')
    embedding = await embedPrompt(prompt.text)
  }

  if (!embedding) {
    const clusterId = createCluster(prompt, null)
    logDecision?.(`  decision: create singleton cluster ${clusterId}; no embedding available`)
    return clusterId
  }

  const cluster = bestClusterForEmbedding(prompt.user_id, prompt.world_id, embedding, logDecision)
  if (cluster) return addPromptToCluster(prompt, cluster, embedding)
  return createCluster(prompt, embedding)
}

export function recomputePromptCluster(clusterId: number | null | undefined) {
  if (!clusterId) return

  const clusterPrompts = db
    .select({
      id: prompts.id,
      embedding: prompts.embedding,
      piece_count: prompts.piece_count,
      world_version_id: prompts.world_version_id,
      created_at: prompts.created_at,
      updated_at: prompts.updated_at,
    })
    .from(prompts)
    .where(eq(prompts.cluster_id, clusterId))
    .orderBy(desc(prompts.created_at), desc(prompts.id))
    .all()

  if (clusterPrompts.length === 0) {
    db.delete(promptClusters).where(eq(promptClusters.id, clusterId)).run()
    return
  }

  const embeddings = clusterPrompts
    .map(prompt => parseEmbedding(prompt.embedding))
    .filter((embedding): embedding is number[] => embedding !== null)

  db.update(promptClusters)
    .set({
      average_embedding: stringifyEmbedding(averageEmbeddings(embeddings)),
      prompt_count: clusterPrompts.length,
      piece_count: clusterPrompts.reduce((sum, prompt) => sum + prompt.piece_count, 0),
      latest_prompt_id: clusterPrompts[0]!.id,
      world_version_id: clusterPrompts[0]!.world_version_id,
      updated_at: clusterPrompts[0]!.created_at,
    })
    .where(eq(promptClusters.id, clusterId))
    .run()
}

export function recomputePromptPieceCount(promptId: number, userId: number) {
  const summary = db
    .select({
      count: sql<number>`count(*)`,
      latest_at: sql<number | null>`max(${pieces.created_at})`,
    })
    .from(pieces)
    .where(and(eq(pieces.prompt_id, promptId), eq(pieces.user_id, userId)))
    .get()

  db.update(prompts)
    .set({
      piece_count: summary?.count ?? 0,
      updated_at: summary?.latest_at ?? Date.now(),
    })
    .where(eq(prompts.id, promptId))
    .run()
}
