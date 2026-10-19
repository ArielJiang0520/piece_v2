import { eq, inArray, sql } from 'drizzle-orm'
import { draftScenes, isUnfinishedScene, parseWorldDraft, serializeWorldDraft, type DraftScene, type WorldDraft } from '../src/worldDraft'
import { parseWorldBody, serializeWorldBody } from '../src/worldBody'
import { collections, db, stories, scenes, worlds } from './db'
import { setWorldPairings } from './pairings'
import { setCollectionTags, setWorldTags } from './tags'
import { diffWorldBodies, recordWorldChanges } from './world-changes'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type World = typeof worlds.$inferSelect

export function readDraft(world: { draft: string }) {
  return parseWorldDraft(world.draft)
}

// Read the world's draft, change it, write it back, in one transaction so two autosaves from two
// screens never overwrite each other. `edit` changes the draft in place and may return a value
// (or undefined: nothing found, nothing written).
export function editDraft<T>(worldId: number, edit: (draft: WorldDraft) => T | undefined): T | undefined {
  return db.transaction(tx => {
    const row = tx.select({ draft: worlds.draft }).from(worlds).where(eq(worlds.id, worldId)).get()
    if (!row) return undefined
    const draft = parseWorldDraft(row.draft)
    const result = edit(draft)
    if (result === undefined) return undefined
    tx.update(worlds).set({ draft: serializeWorldDraft(draft) }).where(eq(worlds.id, worldId)).run()
    return result
  })
}

export function findDraftScene(draft: WorldDraft, key: string) {
  for (const collection of draft.collections) {
    const index = collection.scenes.findIndex(scene => scene.key === key)
    if (index >= 0) return { group: collection.scenes, index, scene: collection.scenes[index], collection }
  }
  const index = draft.uncollected.findIndex(scene => scene.key === key)
  if (index >= 0) return { group: draft.uncollected, index, scene: draft.uncollected[index], collection: null }
  return null
}

// Readers' saved stories of these scenes, all readers together: what deleting them would take (on
// the next publish). Scenes never published have none.
export function storyCount(draftScenesList: DraftScene[]) {
  const ids = draftScenesList.map(scene => scene.row_id).filter((id): id is number => id !== null)
  if (ids.length === 0) return 0
  return Number(db
    .select({ count: sql<number>`count(*)` })
    .from(stories)
    .where(inArray(stories.scene_id, ids))
    .get()?.count ?? 0)
}

// Why the draft can't be published yet, or null when it can: the world needs a name, every
// collection a name (readers see it as a heading), every scene its description and instruction.
export function publishBlocker(draft: WorldDraft): 'name' | 'collection_name' | 'unfinished' | null {
  if (!draft.name.trim()) return 'name'
  if (draft.collections.some(collection => !collection.name.trim())) return 'collection_name'
  if (draftScenes(draft).some(isUnfinishedScene)) return 'unfinished'
  return null
}

// Make the draft what readers see. The world's row gets its name, blurb and body; tags and
// pairings are replaced; collections and scenes are written out in the draft's order — updated
// where the draft names a row, inserted where it doesn't, and deleted where the draft no longer
// has them (a deleted scene takes readers' stories of it). A scene's updated_at moves only when
// its instruction changed, which is what makes readers' earlier stories of it outdated. The first
// publish is logged as one 'published' entry; later ones log what changed in the body.
export function publishDraft(world: World, now: number) {
  db.transaction(tx => {
    const draft = parseWorldDraft(world.draft)
    const changes = world.published
      ? diffWorldBodies(parseWorldBody(world.body), draft.body)
      : [{ kind: 'published' as const, label: draft.name.trim() }]

    writeCollections(tx, world, draft, now)
    setWorldTags(tx, world.id, draft.tags, now)
    setWorldPairings(tx, world.id, draft.pairings)
    const serialized = serializeWorldDraft(draft)
    tx.update(worlds)
      .set({
        name: draft.name.trim(),
        blurb: draft.blurb.trim(),
        body: serializeWorldBody(draft.body),
        draft: serialized,
        published_draft: serialized,
        published: 1,
        updated_at: now,
      })
      .where(eq(worlds.id, world.id))
      .run()
    recordWorldChanges(tx, world.id, changes, now)
  })
}

function writeCollections(tx: Tx, world: World, draft: WorldDraft, now: number) {
  const storedScenes = new Map(
    tx.select().from(scenes).where(eq(scenes.world_id, world.id)).all().map(row => [row.id, row]),
  )
  const storedCollections = new Set(
    tx.select({ id: collections.id }).from(collections).where(eq(collections.world_id, world.id)).all().map(row => row.id),
  )

  // What the draft no longer has goes first.
  const keptScenes = new Set(draftScenes(draft).map(scene => scene.row_id))
  const removedScenes = [...storedScenes.keys()].filter(id => !keptScenes.has(id))
  if (removedScenes.length > 0) tx.delete(scenes).where(inArray(scenes.id, removedScenes)).run()
  const keptCollections = new Set(draft.collections.map(collection => collection.row_id))
  const removedCollections = [...storedCollections].filter(id => !keptCollections.has(id))
  if (removedCollections.length > 0) tx.delete(collections).where(inArray(collections.id, removedCollections)).run()

  draft.collections.forEach((collection, position) => {
    const values = {
      name: collection.name.trim(),
      description: collection.description.trim(),
      premise: collection.premise.trim(),
      position,
      updated_at: now,
    }
    if (collection.row_id !== null && storedCollections.has(collection.row_id)) {
      tx.update(collections).set(values).where(eq(collections.id, collection.row_id)).run()
    } else {
      collection.row_id = tx.insert(collections)
        .values({ ...values, world_id: world.id, created_at: now })
        .returning({ id: collections.id })
        .get().id
    }
    setCollectionTags(tx, collection.row_id, collection.tags, now)
    writeGroup(tx, world, collection.scenes, collection.row_id, storedScenes, now)
  })
  writeGroup(tx, world, draft.uncollected, null, storedScenes, now)
}

function writeGroup(
  tx: Tx,
  world: World,
  group: DraftScene[],
  collectionId: number | null,
  stored: Map<number, typeof scenes.$inferSelect>,
  now: number,
) {
  group.forEach((scene, position) => {
    const description = scene.description.trim()
    const instruction = scene.instruction.trim()
    const existing = scene.row_id === null ? undefined : stored.get(scene.row_id)
    if (existing) {
      tx.update(scenes)
        .set(existing.instruction === instruction
          ? { description, collection_id: collectionId, position }
          : { description, instruction, collection_id: collectionId, position, updated_at: now })
        .where(eq(scenes.id, existing.id))
        .run()
    } else {
      scene.row_id = tx.insert(scenes)
        .values({ user_id: world.user_id, world_id: world.id, collection_id: collectionId, description, instruction, position, created_at: now, updated_at: now })
        .returning({ id: scenes.id })
        .get().id
    }
  })
}
