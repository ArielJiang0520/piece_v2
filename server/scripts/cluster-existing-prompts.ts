// Utility: cluster only prompts that do not already have a cluster_id.
// Mutates the database by assigning missing prompt clusters and logs each clustering decision.
import { asc, isNull } from 'drizzle-orm'
import { db, prompts } from '../db'
import { clusterPromptById, similarityThreshold } from '../prompt-clustering'

let processed = 0

console.log(`clustering unclustered prompts; threshold=${similarityThreshold()}`)

while (true) {
  const prompt = db
    .select({ id: prompts.id })
    .from(prompts)
    .where(isNull(prompts.cluster_id))
    .orderBy(asc(prompts.id))
    .limit(1)
    .get()

  if (!prompt) break

  await clusterPromptById(prompt.id, { logDecisions: true, reuseExistingEmbedding: true })
  processed += 1
  console.log(`clustered prompt ${prompt.id} (${processed} total)`)
}

console.log(`done; clustered ${processed} prompt${processed === 1 ? '' : 's'}`)
