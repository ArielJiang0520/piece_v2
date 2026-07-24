import { and, desc, eq, sql } from 'drizzle-orm'
import { db, pieces, promptClusters, prompts } from './db'

const EMBEDDING_MODEL = 'baai/bge-m3'
const EMBEDDING_TIMEOUT_MS = 15000

// Clusters are never inferred. A new prompt gets its own cluster; a cluster grows only when the
// reader explicitly writes a new version of one of its prompts (pieces.ts passes the source
// cluster through). Embeddings exist for free-text search and nothing else — a prompt with no
// embedding is simply not findable by fuzzy search, and everything else about it still works.

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

export async function embedPrompt(text: string) {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    console.warn('OPENROUTER_API_KEY is not set; prompt will not be searchable by text')
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

// Give a prompt its own cluster, on the world version it was written against. Synchronous and
// caller-transaction-safe: no network call stands between the prompt row and its cluster, so
// cluster_id is never null and the prompt always has a version to be found under.
export function createClusterForPrompt(
  prompt: { id: number; user_id: number; world_id: number; piece_count: number; created_at: number },
  worldVersionId: number | null,
) {
  const now = Date.now()
  const cluster = db.insert(promptClusters).values({
    user_id: prompt.user_id,
    world_id: prompt.world_id,
    prompt_count: 1,
    piece_count: prompt.piece_count,
    latest_prompt_id: prompt.id,
    world_version_id: worldVersionId,
    created_at: now,
    updated_at: prompt.created_at,
  }).returning({ id: promptClusters.id }).get()

  db.update(prompts)
    .set({ cluster_id: cluster.id })
    .where(eq(prompts.id, prompt.id))
    .run()

  return cluster.id
}

// Fire-and-forget: fetch the prompt's embedding and store it so free-text search can find it.
// Failure is logged and dropped — the prompt is already saved, clustered and usable.
export async function embedPromptForSearch(promptId: number, text: string) {
  const embedding = await embedPrompt(text)
  if (!embedding) return
  db.update(prompts)
    .set({ embedding: stringifyEmbedding(embedding) })
    .where(eq(prompts.id, promptId))
    .run()
}

// Re-derive a cluster's rollups from the prompts it holds. The representative is always the
// latest created prompt. A cluster with no prompts left is deleted.
export function recomputePromptCluster(clusterId: number | null | undefined) {
  if (!clusterId) return

  const clusterPrompts = db
    .select({
      id: prompts.id,
      piece_count: prompts.piece_count,
      created_at: prompts.created_at,
    })
    .from(prompts)
    .where(eq(prompts.cluster_id, clusterId))
    .orderBy(desc(prompts.created_at), desc(prompts.id))
    .all()

  if (clusterPrompts.length === 0) {
    db.delete(promptClusters).where(eq(promptClusters.id, clusterId)).run()
    return
  }

  db.update(promptClusters)
    .set({
      prompt_count: clusterPrompts.length,
      piece_count: clusterPrompts.reduce((sum, prompt) => sum + prompt.piece_count, 0),
      latest_prompt_id: clusterPrompts[0]!.id,
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
