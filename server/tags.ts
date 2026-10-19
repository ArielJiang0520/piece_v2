import { eq, inArray, sql } from 'drizzle-orm'
import { normalizeTags } from '../src/tags'
import { collectionTags, db, tags, worldTags } from './db'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Db = typeof db | Tx

// Find-or-create each (already normalized) name; returns their ids in the same order.
function tagIds(tx: Db, names: string[], now: number) {
  if (names.length === 0) return []
  tx.insert(tags)
    .values(names.map(name => ({ name, created_at: now })))
    .onConflictDoNothing()
    .run()
  const rows = tx.select({ id: tags.id, name: tags.name }).from(tags).where(inArray(tags.name, names)).all()
  const idByName = new Map(rows.map(row => [row.name, row.id]))
  return names.map(name => idByName.get(name)!)
}

// Replace a world's tags with these, keeping the typed order (rowid). Input is raw; it is normalized here.
export function setWorldTags(tx: Db, worldId: number, raw: unknown, now = Date.now()) {
  const ids = tagIds(tx, normalizeTags(raw), now)
  tx.delete(worldTags).where(eq(worldTags.world_id, worldId)).run()
  if (ids.length > 0) tx.insert(worldTags).values(ids.map(tag_id => ({ world_id: worldId, tag_id }))).run()
}

export function setCollectionTags(tx: Db, collectionId: number, raw: unknown, now = Date.now()) {
  const ids = tagIds(tx, normalizeTags(raw), now)
  tx.delete(collectionTags).where(eq(collectionTags.collection_id, collectionId)).run()
  if (ids.length > 0) tx.insert(collectionTags).values(ids.map(tag_id => ({ collection_id: collectionId, tag_id }))).run()
}

export function tagsByWorld(worldIds: number[]) {
  const map = new Map<number, string[]>()
  if (worldIds.length === 0) return map
  const rows = db
    .select({ world_id: worldTags.world_id, name: tags.name })
    .from(worldTags)
    .innerJoin(tags, eq(tags.id, worldTags.tag_id))
    .where(inArray(worldTags.world_id, worldIds))
    .orderBy(sql`world_tags.rowid`)
    .all()
  for (const row of rows) map.set(row.world_id, [...(map.get(row.world_id) ?? []), row.name])
  return map
}

export function tagsByCollection(collectionIds: number[]) {
  const map = new Map<number, string[]>()
  if (collectionIds.length === 0) return map
  const rows = db
    .select({ collection_id: collectionTags.collection_id, name: tags.name })
    .from(collectionTags)
    .innerJoin(tags, eq(tags.id, collectionTags.tag_id))
    .where(inArray(collectionTags.collection_id, collectionIds))
    .orderBy(sql`collection_tags.rowid`)
    .all()
  for (const row of rows) map.set(row.collection_id, [...(map.get(row.collection_id) ?? []), row.name])
  return map
}
