import { asc, eq } from 'drizzle-orm'
import { collections, db, scenes } from './db'
import { tagsByCollection } from './tags'

// A world's scenes as every list shows them: its collections in the author's order, each with its
// scenes in order, then the scenes in no collection. Readers don't get empty collections.
export function worldSceneTree(worldId: number, { includeEmpty }: { includeEmpty: boolean }) {
  const collectionRows = db
    .select({ id: collections.id, name: collections.name, description: collections.description, premise: collections.premise })
    .from(collections)
    .where(eq(collections.world_id, worldId))
    .orderBy(asc(collections.position), asc(collections.id))
    .all()
  const sceneRows = db
    .select({ id: scenes.id, collection_id: scenes.collection_id, description: scenes.description, updated_at: scenes.updated_at })
    .from(scenes)
    .where(eq(scenes.world_id, worldId))
    .orderBy(asc(scenes.position), asc(scenes.id))
    .all()
  const tags = tagsByCollection(collectionRows.map(row => row.id))

  const byCollection = new Map<number | null, { id: number; description: string; updated_at: number }[]>()
  for (const { collection_id, ...scene } of sceneRows) {
    byCollection.set(collection_id, [...(byCollection.get(collection_id) ?? []), scene])
  }

  return {
    collections: collectionRows
      .map(row => ({ ...row, tags: tags.get(row.id) ?? [], scenes: byCollection.get(row.id) ?? [] }))
      .filter(row => includeEmpty || row.scenes.length > 0),
    uncollected: byCollection.get(null) ?? [],
  }
}

// Move an item within a list to a new index, clamped to the list.
export function moveTo<T>(items: T[], item: T, index: number) {
  const rest = items.filter(existing => existing !== item)
  const at = Math.max(0, Math.min(rest.length, Number.isFinite(index) ? index : rest.length))
  return [...rest.slice(0, at), item, ...rest.slice(at)]
}
