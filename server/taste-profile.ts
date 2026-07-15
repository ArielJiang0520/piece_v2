// The taste "model" is just text: paragraphs the reader loved, distilled by a cheap LLM
// into a handful of abstract sensibility statements that later seed generation. No
// training, no per-generation ML — this module owns the distillation and the read path
// that generation uses.

import { count, desc, eq, inArray } from 'drizzle-orm'
import { db, tasteLikes, tasteProfile, worlds } from './db'
import { withGenerationSlot } from './generation-lock'
import { TASTE_TAGS, TASTE_TAG_DEFS, isCraftTag, isTasteTag, type TasteTag } from '../src/pages/worlds/shared/tasteTags'
import { TASTE_MODEL_ID } from '../src/preferences/generationModel'

// The distillation model is pinned in the shared model-roles block (generationModel.ts),
// alongside the piece-gen and similar/ideas models, so all three are tuned in one place.
const DISTILL_TIMEOUT_MS = 30_000
// Re-distill in the background once this many new likes have piled up since the last run.
const DISTILL_THRESHOLD = 3
// Keep the profile small so it stays a light seasoning on the prompt, never a wall of text.
const MAX_STATEMENTS = 8

export interface TasteStatement {
  id: string
  // Which reason the statement came from; drives grouping in the UI and the craft/content
  // split at injection time.
  dimension: TasteTag
  text: string
  enabled: boolean
  // Set only for `content` statements: the world they belong to, so they never leak into a
  // different world's generation. Craft statements are global (undefined).
  world_id?: number
}

export function parseStatements(raw: string | null): TasteStatement[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((s: any): s is TasteStatement =>
      s && typeof s.id === 'string' && typeof s.text === 'string' && typeof s.enabled === 'boolean')
  } catch {
    return []
  }
}

function serializeStatements(statements: TasteStatement[]): string {
  return JSON.stringify(statements)
}

function likeCount(userId: number): number {
  return db.select({ n: count() }).from(tasteLikes).where(eq(tasteLikes.user_id, userId)).get()?.n ?? 0
}

// The generation read path: enabled statements that apply to `worldId` — every craft
// statement plus only this world's content statements. Returns the split so the caller can
// word craft (global "how") and content (world-scoped, subordinate) differently.
export function loadTasteForGeneration(userId: number, worldId: number): { craft: TasteStatement[]; content: TasteStatement[] } {
  const row = db.select({ statements: tasteProfile.statements }).from(tasteProfile).where(eq(tasteProfile.user_id, userId)).get()
  const statements = parseStatements(row?.statements ?? null).filter(s => s.enabled)
  const craft: TasteStatement[] = []
  const content: TasteStatement[] = []
  for (const s of statements) {
    if (!isCraftTag(s.dimension)) {
      if (s.world_id === worldId) content.push(s)
    } else {
      craft.push(s)
    }
  }
  return { craft, content }
}

// Whether the reader's taste profile would actually shape a generation for this world —
// i.e. loadTasteForGeneration returns at least one statement. Used at save time to record
// the truth (toggle on but empty profile injects nothing) on the piece.
export function tasteApplies(userId: number, worldId: number): boolean {
  const { craft, content } = loadTasteForGeneration(userId, worldId)
  return craft.length > 0 || content.length > 0
}

export function getProfileForUser(userId: number): { statements: TasteStatement[]; likeCount: number } {
  const row = db.select({ statements: tasteProfile.statements }).from(tasteProfile).where(eq(tasteProfile.user_id, userId)).get()
  return { statements: parseStatements(row?.statements ?? null), likeCount: likeCount(userId) }
}

// Mutate a single statement (enable/disable or delete). Returns the updated list, or null
// when the id isn't found. This is the reader's veto / overfitting kill-switch.
export function updateStatement(userId: number, statementId: string, change: { enabled?: boolean; deleted?: boolean }): TasteStatement[] | null {
  const row = db.select({ statements: tasteProfile.statements }).from(tasteProfile).where(eq(tasteProfile.user_id, userId)).get()
  const statements = parseStatements(row?.statements ?? null)
  const idx = statements.findIndex(s => s.id === statementId)
  if (idx === -1) return null

  const next = change.deleted
    ? statements.filter(s => s.id !== statementId)
    : statements.map(s => (s.id === statementId ? { ...s, enabled: change.enabled ?? s.enabled } : s))

  db.update(tasteProfile).set({ statements: serializeStatements(next), updated_at: Date.now() }).where(eq(tasteProfile.user_id, userId)).run()
  return next
}

interface LikeRow {
  world_id: number
  snippet: string
  context: string | null
  reasons: string | null
}

// A rendering of a like for the distiller prompt: the loved line, the surrounding passage it
// sat in (so the model can read what led up to it and what it paid off), and the reader's
// free-form reason (their quick-pick chips + note, folded into one string).
function renderLike(row: LikeRow, worldName: string): string {
  const reasons = row.reasons?.trim()
  const reasonPart = reasons ? `\n  reader's reason: "${reasons}"` : ''
  const loved = row.snippet.replace(/\s+/g, ' ').trim().slice(0, 600)
  const surrounding = (row.context ?? '').replace(/\s+/g, ' ').trim().slice(0, 1200)
  // Only show the surrounding block when it adds something beyond the loved line itself.
  const contextPart = surrounding && surrounding !== loved ? `\n  in context: "${surrounding}"` : ''
  return `(world: ${worldName})\n  loved line: "${loved}"${contextPart}${reasonPart}`
}

// The dimension vocabulary AND the per-dimension distillation guidance are both derived from
// the shared tag list, so editing that one list keeps the distiller in sync.
const DIMENSION_DISTILL = TASTE_TAG_DEFS.map(d => `- ${d.key}: ${d.distill}`).join('\n')
const CRAFT_KEYS = TASTE_TAG_DEFS.filter(d => d.craft).map(d => d.key).join(', ')
const CONTENT_KEYS = TASTE_TAG_DEFS.filter(d => !d.craft).map(d => d.key).join(', ')
const DIMENSION_ENUM = TASTE_TAGS.join('|')

const DISTILL_SYSTEM = [
  'You maintain a reader\'s taste profile for an interactive-fiction writing app.',
  'You are given passages the reader marked as loved. Each has the loved line, the surrounding passage it appeared in (context — read it to see what the line is doing), and the reader\'s own reason for loving it (when given). The reason names WHICH aspect they responded to (their tag) and sometimes a free note — trust it to pick the dimension and to decide what to keep.',
  'Your job: turn these into a small set of sensibility statements that, handed to the writer, would help produce more moments this reader loves.',
  '',
  'THE ONE RULE THAT MATTERS: calibrate how far you generalize to WHY they liked it. Generalize only as far as needed to make the preference reusable in a new scene, and NO further. A statement so generic it fits any story ("enjoys emotional intimacy", "likes charged moments") guides nothing — it is worse than useless. Keep the specific thing the reader actually responded to.',
  '',
  'How to distill each aspect:',
  DIMENSION_DISTILL,
  '',
  'Rules:',
  `- Key each statement to exactly one dimension: ${DIMENSION_ENUM}.`,
  `- ${CRAFT_KEYS} are craft (HOW the writing works) — set "world" to null, they apply everywhere. ${CONTENT_KEYS} is content (WHAT happens) — set "world" to the exact world name it came from, and keep it concrete.`,
  `- Output at most ${MAX_STATEMENTS} statements, each one short sentence.`,
  '- Merge only genuine restatements of the SAME preference. Never fold two different specific likes into one broader category to save space — keep them separate and concrete.',
  '- Write every statement in the SAME language the reader\'s passages are written in (e.g. Chinese passages → Chinese statements, English → English). If passages mix languages, use the language of the majority.',
  `Respond with ONLY a JSON object: {"statements":[{"dimension":"${DIMENSION_ENUM}","text":"...","world":"<exact world name or null>"}]}. No prose, no code fences.`,
].join('\n')

interface RawStatement {
  dimension?: string
  text?: string
  world?: string | null
}

// Unknown/garbage dimensions from the model fall back to the first tag in the list (a craft
// dimension) rather than being dropped.
function coerceDimension(value: unknown): TasteTag {
  return isTasteTag(value) ? value : TASTE_TAGS[0]
}

// Call the cheap model once and parse its JSON. Returns [] on any failure so distillation
// degrades gracefully (the existing profile is left untouched by the caller).
async function requestDistillation(prompt: string): Promise<RawStatement[]> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    console.warn('[taste distill] OPENROUTER_API_KEY not set; skipping')
    return []
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DISTILL_TIMEOUT_MS)
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: TASTE_MODEL_ID,
        temperature: 0.3,
        reasoning: { effort: 'none' },
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: DISTILL_SYSTEM },
          { role: 'user', content: prompt },
        ],
      }),
    })
    if (!response.ok) {
      console.warn(`[taste distill] OpenRouter ${response.status} ${response.statusText}`)
      return []
    }
    const body = await response.json() as any
    const content = body?.choices?.[0]?.message?.content
    if (typeof content !== 'string') return []
    // Be lenient: strip any accidental fencing before parsing.
    const json = content.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
    const parsed = JSON.parse(json)
    const statements = parsed?.statements
    return Array.isArray(statements) ? statements : []
  } catch (err) {
    console.warn(`[taste distill] failed: ${err instanceof Error ? err.message : 'unknown error'}`)
    return []
  } finally {
    clearTimeout(timeout)
  }
}

// Rebuild the user's profile from all their likes. Runs the LLM call inside the generation
// slot so it never opens a second OpenRouter session alongside a live story stream.
// Returns the new statements (persisted), or null when there was nothing to do / it failed.
export async function distillTasteProfile(userId: number): Promise<TasteStatement[] | null> {
  const likes = db
    .select({ world_id: tasteLikes.world_id, snippet: tasteLikes.snippet, context: tasteLikes.context, reasons: tasteLikes.reasons })
    .from(tasteLikes)
    .where(eq(tasteLikes.user_id, userId))
    .orderBy(desc(tasteLikes.created_at))
    .all()

  const total = likes.length
  if (total === 0) {
    // No likes: clear the profile so a user who deleted everything sees an empty slate.
    db.insert(tasteProfile)
      .values({ user_id: userId, statements: '[]', distilled_like_count: 0, updated_at: Date.now() })
      .onConflictDoUpdate({ target: tasteProfile.user_id, set: { statements: '[]', distilled_like_count: 0, updated_at: Date.now() } })
      .run()
    return []
  }

  // Resolve world names (and a name→id map for reattaching content statements).
  const worldIds = [...new Set(likes.map(l => l.world_id))]
  const worldRows = worldIds.length > 0
    ? db.select({ id: worlds.id, name: worlds.name }).from(worlds).where(inArray(worlds.id, worldIds)).all()
    : []
  const nameById = new Map(worldRows.map(w => [w.id, w.name]))
  const idByName = new Map(worldRows.map(w => [w.name, w.id]))

  const lines = likes.map(l => renderLike(l, nameById.get(l.world_id) ?? `#${l.world_id}`))
  const prompt = `The reader loved these ${total} passages:\n\n${lines.join('\n\n')}`

  const raw = await new Promise<RawStatement[]>((resolve) => {
    withGenerationSlot(async () => {
      resolve(await requestDistillation(prompt))
    }).catch(() => resolve([]))
  })

  if (raw.length === 0) return null

  // Carry over a prior disabled veto by exact text match, so re-distilling doesn't silently
  // re-enable something the reader turned off.
  const priorRow = db.select({ statements: tasteProfile.statements }).from(tasteProfile).where(eq(tasteProfile.user_id, userId)).get()
  const disabledText = new Set(parseStatements(priorRow?.statements ?? null).filter(s => !s.enabled).map(s => s.text.trim()))

  const statements: TasteStatement[] = []
  for (const item of raw.slice(0, MAX_STATEMENTS)) {
    const text = typeof item.text === 'string' ? item.text.trim() : ''
    if (!text) continue
    const dimension = coerceDimension(item.dimension)
    const statement: TasteStatement = {
      id: crypto.randomUUID(),
      dimension,
      text,
      enabled: !disabledText.has(text),
    }
    if (!isCraftTag(dimension)) {
      // Only keep a content statement if we can bind it to a real world; otherwise drop it
      // rather than let it apply globally.
      const worldId = typeof item.world === 'string' ? idByName.get(item.world) : undefined
      if (worldId === undefined) continue
      statement.world_id = worldId
    }
    statements.push(statement)
  }

  const now = Date.now()
  db.insert(tasteProfile)
    .values({ user_id: userId, statements: serializeStatements(statements), distilled_like_count: total, updated_at: now })
    .onConflictDoUpdate({ target: tasteProfile.user_id, set: { statements: serializeStatements(statements), distilled_like_count: total, updated_at: now } })
    .run()

  return statements
}

// Fire a background re-distill after a like is saved, but only once enough new likes have
// accumulated since the last run — so we don't spend a call on every single like. Never
// awaited by the request; failures are swallowed.
export function maybeDistillAfterLike(userId: number): void {
  const row = db.select({ distilled_like_count: tasteProfile.distilled_like_count }).from(tasteProfile).where(eq(tasteProfile.user_id, userId)).get()
  const distilled = row?.distilled_like_count ?? 0
  if (likeCount(userId) - distilled < DISTILL_THRESHOLD) return
  void distillTasteProfile(userId).catch(err =>
    console.warn(`[taste distill] background run failed: ${err instanceof Error ? err.message : 'unknown error'}`))
}
