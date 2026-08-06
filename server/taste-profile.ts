// The taste "model" is just text: a freeform prose profile of what a reader responds to in a
// given world, written by a cheap LLM from the passages they've loved there, and later fed into
// generation FOR THAT WORLD. No training, no per-generation ML — this module owns the writing of
// that profile and the read path generation uses. Taste is per (world, version): versions are
// branches, and a like and the profile it feeds both belong to the version they came from —
// switching HEAD switches which profile generation reads, and switching back restores it.

import { count, desc, eq, and } from 'drizzle-orm'
import { db, tasteLikes, tasteProfile, worlds } from './db'
import { currentWorldVersionId } from './route-helpers'
import { withGenerationSlot } from './generation-lock'
import { budgeted } from './llm-budget'
import { TASTE_MODEL_ID } from '../src/preferences/generationModel'
import { openRouterProvider } from './openrouter-provider'

// The distillation model is pinned in the shared model-roles block (generationModel.ts),
// alongside the piece-gen and similar/ideas models, so all three are tuned in one place.
//
// Distillation is a background job — the manual refresh no longer waits on it (see the refresh
// route), so this timeout is a generous backstop, not a UX deadline. Its real purpose is to
// bound how long one distill can hold the single process-wide generation slot
// (generation-lock.ts) and keep story generation queued behind it.
const DISTILL_TIMEOUT_MS = 60_000
// Re-distill in the background once this many new likes have piled up since the last run.
const DISTILL_THRESHOLD = 3

// (world, version) pairs with a distill in flight. Dedupes overlapping triggers (rapid refresh
// taps, or a background re-distill overlapping a manual one) and lets a polling client see that
// a refresh is still working (surfaced through getProfileForWorld).
const distilling = new Set<string>()

// Likes of a version, the same convention as prompts: rows stamped with it, plus
// version-orphaned rows (their version was deleted) which fold into whatever is checked out.
// A like belongs to the version it was recorded on, full stop. There is no "unversioned like"
// to fold in: deleting a version deletes its likes with it, so a like that survives always
// names a version that still exists.
export function versionLikes(userId: number, worldId: number, versionId: number) {
  return and(
    eq(tasteLikes.user_id, userId),
    eq(tasteLikes.world_id, worldId),
    eq(tasteLikes.world_version_id, versionId),
  )
}

// The likes that actually feed the profile: the version's likes the reader still has switched on.
// Turning one off is the ONLY thing that drops it from the model's input — a like is never
// retired by age or by how many have piled up, and it is never deleted or shortened either. The
// reader's list stays whole; what they hand the distiller is their call.
function activeVersionLikes(userId: number, worldId: number, versionId: number) {
  return and(versionLikes(userId, worldId, versionId), eq(tasteLikes.active, 1))
}

// The stored profile is plain prose. Read it as such, trimmed; empty when there's nothing yet.
function readProfile(userId: number, worldId: number, versionId: number): string {
  const row = db
    .select({ profile: tasteProfile.profile })
    .from(tasteProfile)
    .where(and(eq(tasteProfile.world_id, worldId), eq(tasteProfile.world_version_id, versionId), eq(tasteProfile.user_id, userId)))
    .get()
  return row?.profile?.trim() ?? ''
}

// Counts the likes that feed the profile, i.e. the switched-on ones — the same set the distiller
// reads, so `distilled_like_count` and the background trigger below compare like with like.
function likeCount(userId: number, worldId: number, versionId: number): number {
  return db
    .select({ n: count() })
    .from(tasteLikes)
    .where(activeVersionLikes(userId, worldId, versionId))
    .get()?.n ?? 0
}

// The generation read path: the checked-out version's taste profile, as prose (or '' when there
// is none). Resolves the version internally so callers stay version-unaware.
export function loadTasteForGeneration(userId: number, worldId: number): string {
  const versionId = currentWorldVersionId(userId, worldId)
  if (versionId == null) return ''
  return readProfile(userId, worldId, versionId)
}

// Whether the reader's taste would actually shape a generation for this world — i.e. there is a
// non-empty profile. Used at save time to record the truth (toggle on but no profile injects
// nothing) on the piece.
export function tasteApplies(userId: number, worldId: number): boolean {
  return loadTasteForGeneration(userId, worldId).length > 0
}

// `updatedAt` is the completion signal a polling client watches: distillTasteProfile stamps it
// on every successful (re)build, so a value newer than the pre-refresh one means the background
// distill finished. `distilling` reports whether one is in flight right now.
export function getProfileForWorld(userId: number, worldId: number): { profile: string; likeCount: number; updatedAt: number; distilling: boolean } {
  const versionId = currentWorldVersionId(userId, worldId)
  if (versionId == null) return { profile: '', likeCount: 0, updatedAt: 0, distilling: false }
  const row = db
    .select({ profile: tasteProfile.profile, updated_at: tasteProfile.updated_at })
    .from(tasteProfile)
    .where(and(eq(tasteProfile.world_id, worldId), eq(tasteProfile.world_version_id, versionId), eq(tasteProfile.user_id, userId)))
    .get()
  return {
    profile: row?.profile?.trim() ?? '',
    likeCount: likeCount(userId, worldId, versionId),
    updatedAt: row?.updated_at ?? 0,
    distilling: distilling.has(`${worldId}:${versionId}`),
  }
}

interface LikeRow {
  snippet: string
  context: string | null
  reasons: string | null
}

// A rendering of a like for the distiller prompt: the loved line, the surrounding passage it
// sat in (so the model can read what led up to it and what it paid off), and the reader's
// optional free-form reaction — a raw feeling or half-sentence, not an analysis.
function renderLike(row: LikeRow): string {
  const reasons = row.reasons?.trim()
  const reactionPart = reasons ? `\n  reader's reaction: "${reasons}"` : ''
  const loved = row.snippet.replace(/\s+/g, ' ').trim().slice(0, 600)
  const surrounding = (row.context ?? '').replace(/\s+/g, ' ').trim().slice(0, 1200)
  // Only show the surrounding block when it adds something beyond the loved line itself.
  const contextPart = surrounding && surrounding !== loved ? `\n  in context: "${surrounding}"` : ''
  return `- loved line: "${loved}"${contextPart}${reactionPart}`
}

// Talk to the model like a perceptive person getting to know someone, not a spec. We hand it the
// passages this reader loved and ask it to write who they are as a reader. No counts, no bullet
// scaffolding, no output format — the shape of the profile is the model's to judge. The only
// steer is toward concreteness, because "they like intimacy" is true of every scene and useless.
const DISTILL_SYSTEM = [
  'This reader uses an interactive-fiction app to read erotica set in one particular story world. You know them only through the passages they\'ve tapped as "loved" in that world — each comes with the line itself, the passage around it, and sometimes a raw reaction of their own.',
  '',
  'Read them all together, the way you\'d read someone you\'re coming to understand, and write a profile of this reader: what actually turns them on here, what they keep responding to across these moments. Be concrete and specific to this world. Skip anything so general it would be true of any erotica ("likes it hot", "enjoys intimacy"); the whole point is what\'s particular to them.',
  '',
  'Write it as a short, plain profile in your own words. Same language as the passages (Chinese → Chinese, English → English). Just the profile, no preamble.',
].join('\n')

// Call the chosen model once and return its profile prose. Returns null on any failure so
// distillation degrades gracefully (the existing profile is left untouched by the caller).
async function requestDistillation(prompt: string, modelId: string): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    console.warn('[taste distill] OPENROUTER_API_KEY not set; skipping')
    return null
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DISTILL_TIMEOUT_MS)
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(budgeted({
        model: modelId,
        temperature: 0.3,
        reasoning: { effort: 'none' },
        provider: openRouterProvider(),
        messages: [
          { role: 'system', content: DISTILL_SYSTEM },
          { role: 'user', content: prompt },
        ],
      }, 'taste distill')),
    })
    if (!response.ok) {
      console.warn(`[taste distill] OpenRouter ${response.status} ${response.statusText}`)
      return null
    }
    const body = await response.json() as any
    const content = body?.choices?.[0]?.message?.content
    if (typeof content !== 'string') return null
    const profile = content.trim()
    return profile.length > 0 ? profile : null
  } catch (err) {
    console.warn(`[taste distill] failed: ${err instanceof Error ? err.message : 'unknown error'}`)
    return null
  } finally {
    clearTimeout(timeout)
  }
}

// Rebuild the checked-out version's profile from the likes it has switched on. Runs the LLM call inside the
// generation slot so it never opens a second OpenRouter session alongside a live story stream.
// Deduped per (world, version). Returns the new profile (persisted), or null when there was
// nothing to do / it failed.
export async function distillTasteProfile(userId: number, worldId: number): Promise<string | null> {
  const versionId = currentWorldVersionId(userId, worldId)
  if (versionId == null) return null
  const key = `${worldId}:${versionId}`
  if (distilling.has(key)) return null
  distilling.add(key)
  try {
    return await runDistillation(userId, worldId, versionId)
  } finally {
    distilling.delete(key)
  }
}

async function runDistillation(userId: number, worldId: number, versionId: number): Promise<string | null> {
  const likes = db
    .select({ snippet: tasteLikes.snippet, context: tasteLikes.context, reasons: tasteLikes.reasons })
    .from(tasteLikes)
    .where(activeVersionLikes(userId, worldId, versionId))
    .orderBy(desc(tasteLikes.created_at))
    .all()

  const total = likes.length
  if (total === 0) {
    // Nothing switched on: clear the profile, so a version whose likes were all deleted — or all
    // turned off — shows an empty slate rather than one distilled from likes that no longer count.
    const now = Date.now()
    db.insert(tasteProfile)
      .values({ world_id: worldId, world_version_id: versionId, user_id: userId, profile: '', distilled_like_count: 0, updated_at: now })
      .onConflictDoUpdate({ target: [tasteProfile.world_id, tasteProfile.world_version_id], set: { profile: '', distilled_like_count: 0, updated_at: now } })
      .run()
    return ''
  }

  const worldBody = db
    .select({ body: worlds.body })
    .from(worlds)
    .where(and(eq(worlds.id, worldId), eq(worlds.user_id, userId)))
    .get()?.body?.trim() ?? ''

  const lines = likes.map(renderLike)
  const parts: string[] = []
  if (worldBody) parts.push(`The world's description:\n\n${worldBody}`)
  parts.push(`The passages this reader loved, all from this world:\n\n${lines.join('\n\n')}`)
  const prompt = parts.join('\n\n')

  const profile = await new Promise<string | null>((resolve) => {
    withGenerationSlot(async () => {
      resolve(await requestDistillation(prompt, TASTE_MODEL_ID))
    }).catch(() => resolve(null))
  })

  if (!profile) return null

  const now = Date.now()
  db.insert(tasteProfile)
    .values({ world_id: worldId, world_version_id: versionId, user_id: userId, profile, distilled_like_count: total, updated_at: now })
    .onConflictDoUpdate({ target: [tasteProfile.world_id, tasteProfile.world_version_id], set: { profile, distilled_like_count: total, updated_at: now } })
    .run()

  return profile
}

// Fire a background re-distill after a like is saved, but only once enough new likes have
// accumulated for this version since the last run — so we don't spend a call on every single
// like. Never awaited by the request; failures are swallowed.
export function maybeDistillAfterLike(userId: number, worldId: number): void {
  const versionId = currentWorldVersionId(userId, worldId)
  if (versionId == null) return
  const distilled = db
    .select({ n: tasteProfile.distilled_like_count })
    .from(tasteProfile)
    .where(and(eq(tasteProfile.world_id, worldId), eq(tasteProfile.world_version_id, versionId), eq(tasteProfile.user_id, userId)))
    .get()?.n ?? 0
  if (likeCount(userId, worldId, versionId) - distilled < DISTILL_THRESHOLD) return
  void distillTasteProfile(userId, worldId).catch(err =>
    console.warn(`[taste distill] background run failed: ${err instanceof Error ? err.message : 'unknown error'}`))
}
