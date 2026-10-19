// The shape of a world's text (worlds.body / worlds.draft_body), shared by client and server.
// Each lore section and character carries a stable id so the changelog can tell an edit or a
// rename from a delete-and-add. Array order is the author's order. Lore and characters are what
// readers see; instructions are the author's notes to the AI, which only the author and the
// model ever read.

export interface LoreSection {
  id: string
  title: string
  body: string
}

export interface Character {
  id: string
  name: string
  body: string
  // The character's picture, drafted and published with the rest of the body. Null until uploads
  // exist; the letter circle stands in.
  image_url: string | null
}

export interface WorldBody {
  lore: LoreSection[]
  characters: Character[]
  instructions: string
}

export const EMPTY_WORLD_BODY: WorldBody = { lore: [], characters: [], instructions: '' }

function isEntry(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string'
}

function str(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function imageUrl(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

// Accepts anything (a stored column, a request body) and returns a well-formed WorldBody,
// dropping entries without an id rather than failing the whole document.
export function parseWorldBody(value: unknown): WorldBody {
  let raw = value
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    } catch {
      return EMPTY_WORLD_BODY
    }
  }
  if (!raw || typeof raw !== 'object') return EMPTY_WORLD_BODY
  const { lore, characters, instructions } = raw as { lore?: unknown; characters?: unknown; instructions?: unknown }
  return {
    lore: Array.isArray(lore)
      ? lore.filter(isEntry).map(entry => ({ id: entry.id as string, title: str(entry.title), body: str(entry.body) }))
      : [],
    characters: Array.isArray(characters)
      ? characters.filter(isEntry).map(entry => ({ id: entry.id as string, name: str(entry.name), body: str(entry.body), image_url: imageUrl(entry.image_url) }))
      : [],
    instructions: str(instructions),
  }
}

export function serializeWorldBody(body: WorldBody) {
  return JSON.stringify(body)
}

// Whether readers have anything to read: instructions don't count, readers never see them.
export function isWorldBodyEmpty(body: WorldBody) {
  return body.lore.every(section => !section.title.trim() && !section.body.trim())
    && body.characters.every(character => !character.name.trim() && !character.body.trim())
}

// The reader-facing world as one block of text, the form the model reads it in: lore sections in
// order, then the characters. Empty entries are left out. Instructions go to the model separately.
export function renderWorldBody(body: WorldBody) {
  const parts: string[] = []
  for (const section of body.lore) {
    const title = section.title.trim()
    const text = section.body.trim()
    if (!title && !text) continue
    parts.push(title ? `## ${title}\n\n${text}` : text)
  }
  const characters = body.characters.filter(character => character.name.trim() || character.body.trim())
  if (characters.length > 0) {
    parts.push(['# Characters', ...characters.map(character => {
      const name = character.name.trim()
      const text = character.body.trim()
      return name ? `## ${name}\n\n${text}` : text
    })].join('\n\n'))
  }
  return parts.join('\n\n')
}

// Changelog entry codes (world_changes.kind); the client turns each into a sentence in the
// reader's language, around world_changes.label.
export type WorldChangeKind =
  | 'published'
  | 'lore_added' | 'lore_edited' | 'lore_renamed' | 'lore_removed'
  | 'character_added' | 'character_edited' | 'character_renamed' | 'character_removed'
  | 'instructions_edited'

// For a rename the label carries both names, old first, joined by this.
export const RENAME_SEPARATOR = ' → '
