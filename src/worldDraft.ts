import { normalizePairings, type Pairing } from './pairings'
import { normalizeTags } from './tags'
import { EMPTY_WORLD_BODY, parseWorldBody, type WorldBody } from './worldBody'

// Everything the author works on in the creator center, as one document (worlds.draft): the world's
// metadata and text, and its collections and scenes in the author's order. The creator center edits only
// this, and it autosaves freely; readers never see it. Publish makes it what readers see — it is
// written out over the world's row and its collections and scenes tables.
//
// Collections and scenes are named by a `key` the creator center makes (the URL a creator center screen uses).
// `row_id` is the published row it became: null until its first publish, and a scene's row is
// what readers' stories hang on.
export interface WorldDraft {
  name: string
  blurb: string
  pairings: Pairing[]
  tags: string[]
  body: WorldBody
  collections: DraftCollection[]
  // The "No collection" group, in order.
  uncollected: DraftScene[]
}

export interface DraftCollection {
  key: string
  row_id: number | null
  name: string
  description: string
  premise: string
  tags: string[]
  scenes: DraftScene[]
}

export interface DraftScene {
  key: string
  row_id: number | null
  description: string
  instruction: string
}

export const EMPTY_WORLD_DRAFT: WorldDraft = {
  name: '',
  blurb: '',
  pairings: [],
  tags: [],
  body: EMPTY_WORLD_BODY,
  collections: [],
  uncollected: [],
}

// A scene readers can't be given yet: it needs both its description and its instruction.
export function isUnfinishedScene(scene: DraftScene) {
  return !scene.description.trim() || !scene.instruction.trim()
}

export function draftScenes(draft: WorldDraft) {
  return [...draft.collections.flatMap(collection => collection.scenes), ...draft.uncollected]
}

function text(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function rowId(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

function parseScenes(value: unknown): DraftScene[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null && typeof entry.key === 'string')
    .map(entry => ({
      key: entry.key as string,
      row_id: rowId(entry.row_id),
      description: text(entry.description),
      instruction: text(entry.instruction),
    }))
}

// Parse a stored or sent draft, dropping anything malformed. Fields are listed in a fixed order so
// two drafts that say the same thing serialize to the same string (that is how "changes not
// published" is told: the draft against the one last published).
export function parseWorldDraft(raw: unknown): WorldDraft {
  let value = raw
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      value = null
    }
  }
  if (typeof value !== 'object' || value === null) return EMPTY_WORLD_DRAFT
  const draft = value as Record<string, unknown>
  return {
    name: text(draft.name),
    blurb: text(draft.blurb),
    pairings: normalizePairings(draft.pairings),
    tags: normalizeTags(draft.tags),
    body: parseWorldBody(draft.body),
    collections: Array.isArray(draft.collections)
      ? draft.collections
        .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null && typeof entry.key === 'string')
        .map(entry => ({
          key: entry.key as string,
          row_id: rowId(entry.row_id),
          name: text(entry.name),
          description: text(entry.description),
          premise: text(entry.premise),
          tags: normalizeTags(entry.tags),
          scenes: parseScenes(entry.scenes),
        }))
      : [],
    uncollected: parseScenes(draft.uncollected),
  }
}

export function serializeWorldDraft(draft: WorldDraft) {
  return JSON.stringify(parseWorldDraft(draft))
}
