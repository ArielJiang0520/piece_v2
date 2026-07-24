import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { pieces, promptClusters, prompts, worldVersions, worlds } from './db'
import { normalizePromptInput } from './prompt-text'

interface ExamplePrompt {
  text: string
  pieces?: string[]
}

interface ExampleWorld {
  name: string
  body?: string
  prompts?: ExamplePrompt[]
}

const EXAMPLES_DIR = join(import.meta.dir, '..', 'examples')
type ExampleLanguage = 'en' | 'zh'

function readExampleWorlds(language: ExampleLanguage) {
  return readdirSync(EXAMPLES_DIR, { withFileTypes: true })
    .filter(entry => {
      if (!entry.isFile() || !entry.name.endsWith('.json')) return false
      const isZhExample = entry.name.endsWith('_zh.json')
      return language === 'zh' ? isZhExample : !isZhExample
    })
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map(file => {
      const path = join(EXAMPLES_DIR, file)
      return JSON.parse(readFileSync(path, 'utf8')) as ExampleWorld
    })
}

const exampleWorldsByLanguage: Record<ExampleLanguage, ExampleWorld[]> = {
  en: readExampleWorlds('en'),
  zh: readExampleWorlds('zh'),
}

export function createExampleWorldsForUser(tx: any, userId: number, now = Date.now(), language: ExampleLanguage = 'en') {
  let timestamp = now

  for (const example of exampleWorldsByLanguage[language]) {
    timestamp += 1
    const worldBody = example.body ?? ''
    const world = tx.insert(worlds).values({
      user_id: userId,
      name: example.name.trim(),
      is_example: 1,
      body: worldBody,
      created_at: timestamp,
      updated_at: timestamp,
    }).returning({ id: worlds.id }).get()

    const version = tx.insert(worldVersions).values({
      world_id: world.id,
      body: worldBody,
      version_number: 1,
      created_at: timestamp,
    }).returning({ id: worldVersions.id }).get()

    tx.update(worlds)
      .set({ current_version_id: version.id })
      .where(eq(worlds.id, world.id))
      .run()

    for (const examplePrompt of example.prompts ?? []) {
      const text = normalizePromptInput(examplePrompt.text)
      if (!text) continue

      timestamp += 1
      const promptPieces = (examplePrompt.pieces ?? []).filter(piece => piece.trim())
      const prompt = tx.insert(prompts).values({
        user_id: userId,
        world_id: world.id,
        text,
        piece_count: promptPieces.length,
        created_at: timestamp,
        updated_at: timestamp,
      }).returning({ id: prompts.id }).get()

      for (const body of promptPieces) {
        timestamp += 1
        tx.insert(pieces).values({
          user_id: userId,
          world_id: world.id,
          prompt_id: prompt.id,
          body,
          model: null,
          created_at: timestamp,
        }).run()
      }

      const cluster = tx.insert(promptClusters).values({
        user_id: userId,
        world_id: world.id,
        prompt_count: 1,
        piece_count: promptPieces.length,
        latest_prompt_id: prompt.id,
        world_version_id: version.id,
        created_at: timestamp,
        updated_at: timestamp,
      }).returning({ id: promptClusters.id }).get()

      tx.update(prompts)
        .set({ cluster_id: cluster.id })
        .where(eq(prompts.id, prompt.id))
        .run()
    }
  }
}
