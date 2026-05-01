import { asc, isNull } from 'drizzle-orm'
import { db, prompts } from '../db'
import { clusterPromptById } from '../prompt-clustering'

let processed = 0

while (true) {
  const prompt = db
    .select({ id: prompts.id })
    .from(prompts)
    .where(isNull(prompts.cluster_id))
    .orderBy(asc(prompts.id))
    .limit(1)
    .get()

  if (!prompt) break

  await clusterPromptById(prompt.id)
  processed += 1
  console.log(`clustered prompt ${prompt.id} (${processed} total)`)
}

console.log(`done; clustered ${processed} prompt${processed === 1 ? '' : 's'}`)
