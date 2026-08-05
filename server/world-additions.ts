import { and, asc, eq, inArray } from 'drizzle-orm'
import { db, worldAdditions } from './db'

export interface WorldAddition {
  id: number
  name: string
  body: string
  created_at: number
  updated_at: number
}

// Creation order, always. There is no reorder UI and no position column: the shelf reads in the
// order it was written, and so does the text appended to the world body.
const additionOrder = [asc(worldAdditions.created_at), asc(worldAdditions.id)]

export function listAdditions(userId: number, worldId: number, versionId: number | null): WorldAddition[] {
  if (versionId == null) return []
  return db
    .select({
      id: worldAdditions.id,
      name: worldAdditions.name,
      body: worldAdditions.body,
      created_at: worldAdditions.created_at,
      updated_at: worldAdditions.updated_at,
    })
    .from(worldAdditions)
    .where(and(
      eq(worldAdditions.user_id, userId),
      eq(worldAdditions.world_id, worldId),
      eq(worldAdditions.world_version_id, versionId),
    ))
    .orderBy(...additionOrder)
    .all()
}

// The additions a request asked for, narrowed to the ones that actually belong to this reader,
// this world and this version. Anything else — a stale id from a deleted addition, an id from
// another version — is dropped rather than rejected: a switched-off or deleted addition should
// leave the world as it was written, not fail the generation.
export function resolveAdditions(
  userId: number,
  worldId: number,
  versionId: number | null,
  ids: unknown,
): WorldAddition[] {
  const requested = parseAdditionIds(ids)
  if (requested.length === 0 || versionId == null) return []

  const rows = db
    .select({
      id: worldAdditions.id,
      name: worldAdditions.name,
      body: worldAdditions.body,
      created_at: worldAdditions.created_at,
      updated_at: worldAdditions.updated_at,
    })
    .from(worldAdditions)
    .where(and(
      eq(worldAdditions.user_id, userId),
      eq(worldAdditions.world_id, worldId),
      eq(worldAdditions.world_version_id, versionId),
      inArray(worldAdditions.id, requested),
    ))
    .orderBy(...additionOrder)
    .all()

  return rows
}

// Accepts the raw `additionIds` off a request body or a piece's stored stamp. Non-numeric
// entries and duplicates fall out here so nothing downstream has to think about them.
export function parseAdditionIds(value: unknown): number[] {
  const raw = typeof value === 'string' ? safeParseJson(value) : value
  if (!Array.isArray(raw)) return []
  const seen = new Set<number>()
  for (const entry of raw) {
    const id = Number(entry)
    if (Number.isInteger(id) && id >= 1) seen.add(id)
  }
  return [...seen]
}

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

// The world as the model should see it: the body, then each switched-on addition's text, as if
// the reader had typed it into the world description themselves. Names are a label for the
// shelf, not part of the setting, so they aren't sent. Nothing is truncated here — the one size
// limit lives at the model call (llm-budget.ts).
export function composeWorldBody(worldBody: string, additions: WorldAddition[]): string {
  const parts = [worldBody.trimEnd()]
  for (const addition of additions) {
    const body = addition.body.trim()
    if (body) parts.push(body)
  }
  return parts.filter(part => part.length > 0).join('\n\n')
}

// The composed world body for a request that carried `additionIds`. The one call every model
// route makes; passing nothing gives back the bare body, which is what every route did before
// additions existed.
export function worldBodyWithAdditions(
  userId: number,
  worldId: number,
  versionId: number | null,
  worldBody: string,
  ids: unknown,
): string {
  return composeWorldBody(worldBody, resolveAdditions(userId, worldId, versionId, ids))
}
