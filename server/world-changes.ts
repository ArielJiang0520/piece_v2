import { RENAME_SEPARATOR, type Character, type LoreSection, type WorldBody, type WorldChangeKind } from '../src/worldBody'
import { db, worldChanges } from './db'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export interface WorldChange {
  kind: WorldChangeKind
  label: string
}

function diffEntries<T extends { id: string; body: string }>(
  before: T[],
  after: T[],
  nameOf: (entry: T) => string,
  kinds: { added: WorldChangeKind; edited: WorldChangeKind; renamed: WorldChangeKind; removed: WorldChangeKind },
) {
  const changes: WorldChange[] = []
  const beforeById = new Map(before.map(entry => [entry.id, entry]))
  const afterIds = new Set(after.map(entry => entry.id))

  for (const entry of after) {
    const previous = beforeById.get(entry.id)
    if (!previous) {
      changes.push({ kind: kinds.added, label: nameOf(entry) })
      continue
    }
    if (nameOf(previous) !== nameOf(entry)) {
      changes.push({ kind: kinds.renamed, label: `${nameOf(previous)}${RENAME_SEPARATOR}${nameOf(entry)}` })
    }
    if (previous.body.trim() !== entry.body.trim()) {
      changes.push({ kind: kinds.edited, label: nameOf(entry) })
    }
  }
  for (const entry of before) {
    if (!afterIds.has(entry.id)) changes.push({ kind: kinds.removed, label: nameOf(entry) })
  }
  return changes
}

// What a publish changed, from the reader's side: the published body before and after. An
// instructions edit is logged without its text — readers never see the instructions, only that
// stories may now come out differently.
export function diffWorldBodies(before: WorldBody, after: WorldBody): WorldChange[] {
  const instructionsEdited = before.instructions.trim() !== after.instructions.trim()
  return [
    ...diffEntries<LoreSection>(before.lore, after.lore, section => section.title.trim(), {
      added: 'lore_added', edited: 'lore_edited', renamed: 'lore_renamed', removed: 'lore_removed',
    }),
    ...diffEntries<Character>(before.characters, after.characters, character => character.name.trim(), {
      added: 'character_added', edited: 'character_edited', renamed: 'character_renamed', removed: 'character_removed',
    }),
    ...(instructionsEdited ? [{ kind: 'instructions_edited' as const, label: '' }] : []),
  ]
}

export function recordWorldChanges(tx: Tx | typeof db, worldId: number, changes: WorldChange[], now = Date.now()) {
  if (changes.length === 0) return
  tx.insert(worldChanges)
    .values(changes.map(change => ({ world_id: worldId, kind: change.kind, label: change.label, created_at: now })))
    .run()
}
