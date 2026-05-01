// Utility: rebuild all prompt clusters from scratch using the current similarity threshold.
// Mutates the database by clearing prompt cluster assignments, deleting clusters, and reclustering every prompt.
import { asc } from 'drizzle-orm'
import { db, promptClusters, prompts } from '../db'
import { clusterPromptById, similarityThreshold } from '../prompt-clustering'

const promptRows = db
  .select({ id: prompts.id })
  .from(prompts)
  .orderBy(asc(prompts.id))
  .all()

console.log(`regrouping ${promptRows.length} prompt${promptRows.length === 1 ? '' : 's'} from scratch; threshold=${similarityThreshold()}`)
console.log('resetting prompt cluster assignments and deleting prompt cluster rows')

db.update(prompts).set({ cluster_id: null }).run()
db.delete(promptClusters).run()

let processed = 0

for (const prompt of promptRows) {
  const clusterId = await clusterPromptById(prompt.id, {
    logDecisions: true,
    reuseExistingEmbedding: true,
  })
  processed += 1
  console.log(`regrouped prompt ${prompt.id} into cluster ${clusterId} (${processed}/${promptRows.length})`)
}

console.log(`done; regrouped ${processed} prompt${processed === 1 ? '' : 's'}`)
