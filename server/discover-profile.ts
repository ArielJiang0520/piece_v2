// Discover's taste model, and like the paragraph-level one it is just text: a short prose
// profile of what kinds of *premises* this reader picks up in a given world. It is distilled
// from one source of evidence only — the prompts table. Everything the reader keeps ends up
// there (a hand-written prompt, a Liked card, an edited card they saved), so the distiller reads
// the DB and nothing else: no premise-card logs, no telemetry, no story-taste profile.
//
// Everything is per (world, version): versions are branches, and a profile learned on one
// setting describes a world that another version may have moved off of.

import { and, count, desc, eq, gt, isNull, lte, or } from 'drizzle-orm'
import { db, discoverProfile, prompts, worlds } from './db'
import { withGenerationSlot } from './generation-lock'
import { budgeted } from './llm-budget'
import { BLACKLISTED_PROVIDERS, TASTE_MODEL_ID } from '../src/preferences/generationModel'

// Background job: a generous backstop, not a UX deadline.
const DISTILL_TIMEOUT_MS = 60_000
// Re-distill once this many new prompt rows exist on the version since the last run.
const DISTILL_THRESHOLD = 5
// The most prompts one distill may read, delta and context together. Prompts, not characters —
// each one goes in whole.
const MAX_DISTILL_PROMPTS = 25
// How much of the older corpus one distill samples: a third, so the smaller the world the less
// it sends — the profile is a compression, never the corpus read back to the model.
const CONTEXT_FRACTION = 3

// (world, version) pairs with a distill in flight, so overlapping triggers collapse into one run.
const distilling = new Set<string>()

// Prompts of a version, the Prompts-tab convention: rows stamped with it, plus version-orphaned
// rows (their version was deleted) which fold into whatever is checked out.
function versionPrompts(userId: number, worldId: number, versionId: number) {
  return and(
    eq(prompts.user_id, userId),
    eq(prompts.world_id, worldId),
    or(eq(prompts.world_version_id, versionId), isNull(prompts.world_version_id)),
  )
}

// The trigger's signal number: how many prompt rows the version has. Every action that matters
// ends as one of these rows, so counting them is the whole signal model.
function promptCount(userId: number, worldId: number, versionId: number): number {
  return db
    .select({ n: count() })
    .from(prompts)
    .where(versionPrompts(userId, worldId, versionId))
    .get()?.n ?? 0
}

// The stored profile is plain prose. Read it as such, trimmed; empty when there's nothing yet.
export function readDiscoverProfile(userId: number, worldId: number, versionId: number): string {
  const row = db
    .select({ profile: discoverProfile.profile })
    .from(discoverProfile)
    .where(and(
      eq(discoverProfile.world_id, worldId),
      eq(discoverProfile.world_version_id, versionId),
      eq(discoverProfile.user_id, userId),
    ))
    .get()
  return row?.profile?.trim() ?? ''
}

// One item per line, so whitespace is flattened — never shortened.
function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

// Weighted sample without replacement. Weights are small integers (piece counts), corpora are
// small — the plain cumulative walk is fine.
function weightedSample<T>(pool: Array<{ item: T; weight: number }>, size: number): T[] {
  const remaining = [...pool]
  const out: T[] = []
  while (out.length < size && remaining.length > 0) {
    const total = remaining.reduce((sum, entry) => sum + entry.weight, 0)
    let roll = Math.random() * total
    let index = remaining.length - 1
    for (let i = 0; i < remaining.length; i++) {
      roll -= remaining[i]!.weight
      if (roll <= 0) {
        index = i
        break
      }
    }
    out.push(remaining[index]!.item)
    remaining.splice(index, 1)
  }
  return out
}

// Talk to the model like someone who has been reading over this writer's shoulder, not like a
// spec. The only steer is toward concreteness — "likes interesting premises" is true of everyone
// and useless to the next refill.
const DISTILL_SYSTEM = [
  'You are shown the story prompts one writer keeps for one particular fictional world — the ones they added recently, and a slice of the rest. Every prompt here is one they chose to keep.',
  '',
  'Write a short profile of what pulls this writer into a story here: the kinds of situations, characters, tensions, and angles on this world they keep choosing. Be concrete and specific to this world. Skip anything so general it would be true of any writer ("likes an interesting hook", "enjoys character depth"); the whole point is what is particular to them.',
  '',
  'If there is too little to go on, say so plainly in a sentence instead of inventing a pattern.',
  '',
  'Write it as a short, plain profile in your own words. Same language as the prompts (Chinese → Chinese, English → English). Just the profile, no preamble.',
].join('\n')

// Call the model once and return its profile prose. Null on any failure, so a distill degrades
// gracefully and the existing profile is left untouched.
async function requestDistillation(prompt: string, modelId: string): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    console.warn('[discover distill] OPENROUTER_API_KEY not set; skipping')
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
        ...(BLACKLISTED_PROVIDERS.length > 0 ? { provider: { ignore: BLACKLISTED_PROVIDERS } } : {}),
        messages: [
          { role: 'system', content: DISTILL_SYSTEM },
          { role: 'user', content: prompt },
        ],
      }, 'discover distill')),
    })
    if (!response.ok) {
      console.warn(`[discover distill] OpenRouter ${response.status} ${response.statusText}`)
      return null
    }
    const body = await response.json() as any
    const content = body?.choices?.[0]?.message?.content
    if (typeof content !== 'string') return null
    const profile = content.trim()
    return profile.length > 0 ? profile : null
  } catch (err) {
    console.warn(`[discover distill] failed: ${err instanceof Error ? err.message : 'unknown error'}`)
    return null
  } finally {
    clearTimeout(timeout)
  }
}

// The distiller's user message: the version's world body, everything added since the last
// distill (guaranteed — these are the rows that tripped the trigger), and a proportional random
// slice of the older corpus for context. Bare prompt text, no annotations: popularity is spent
// as sampling weight, never shown to the model.
function buildDistillPrompt(userId: number, worldId: number, versionId: number, since: number): string | null {
  const delta = db
    .select({ text: prompts.text })
    .from(prompts)
    .where(and(versionPrompts(userId, worldId, versionId), gt(prompts.created_at, since)))
    .orderBy(desc(prompts.created_at), desc(prompts.id))
    .limit(MAX_DISTILL_PROMPTS)
    .all()

  const olderRows = db
    .select({ text: prompts.text, piece_count: prompts.piece_count })
    .from(prompts)
    .where(and(versionPrompts(userId, worldId, versionId), lte(prompts.created_at, since)))
    .all()

  const contextSize = Math.min(
    Math.ceil(olderRows.length / CONTEXT_FRACTION),
    MAX_DISTILL_PROMPTS - delta.length,
  )
  const context = contextSize > 0
    ? weightedSample(olderRows.map(row => ({ item: row.text, weight: 1 + Math.min(row.piece_count, 5) })), contextSize)
    : []

  if (delta.length === 0 && context.length === 0) return null

  const worldBody = db
    .select({ body: worlds.body })
    .from(worlds)
    .where(and(eq(worlds.id, worldId), eq(worlds.user_id, userId)))
    .get()?.body?.trim() ?? ''

  const sections: string[] = []
  if (worldBody) sections.push(`The world:\n\n${worldBody}`)
  if (delta.length > 0) {
    sections.push(`Prompts they've added lately:\n\n${delta.map(row => `- "${oneLine(row.text)}"`).join('\n')}`)
  }
  if (context.length > 0) {
    sections.push(`Their prompts overall (a sample):\n\n${context.map(text => `- "${oneLine(text)}"`).join('\n')}`)
  }
  return sections.join('\n\n')
}

// Rebuild one version's Discover profile. Runs the LLM call under its own owner key so it never
// queues behind (or holds up) a live story stream. Deduped per (world, version). Returns the new
// profile, or null when there was nothing to do / it failed.
export async function distillDiscoverProfile(userId: number, worldId: number, versionId: number, modelId: string = TASTE_MODEL_ID): Promise<string | null> {
  const key = `${worldId}:${versionId}`
  if (distilling.has(key)) return null
  distilling.add(key)
  try {
    // The watermark this run will store, measured before the model call so prompts added while
    // it runs still count toward the next trigger.
    const signals = promptCount(userId, worldId, versionId)
    const since = db
      .select({ updated_at: discoverProfile.updated_at })
      .from(discoverProfile)
      .where(and(
        eq(discoverProfile.world_id, worldId),
        eq(discoverProfile.world_version_id, versionId),
        eq(discoverProfile.user_id, userId),
      ))
      .get()?.updated_at ?? 0

    const prompt = buildDistillPrompt(userId, worldId, versionId, since)
    if (!prompt) return null

    const profile = await new Promise<string | null>((resolve) => {
      withGenerationSlot(`discover-distill:${userId}:${worldId}`, async () => {
        resolve(await requestDistillation(prompt, modelId))
      }).catch(() => resolve(null))
    })
    if (!profile) return null

    const now = Date.now()
    db.insert(discoverProfile)
      .values({ world_id: worldId, world_version_id: versionId, user_id: userId, profile, distilled_signal_count: signals, updated_at: now })
      .onConflictDoUpdate({
        target: [discoverProfile.world_id, discoverProfile.world_version_id],
        set: { profile, distilled_signal_count: signals, updated_at: now },
      })
      .run()

    return profile
  } finally {
    distilling.delete(key)
  }
}

// The single trigger checkpoint, called from the refill and nowhere else — nothing outside
// Discover knows the distiller exists. The DB is the signal: every like, edit-then-save, or
// hand-written prompt ends as a prompt row, so counting rows covers them all. Never awaited;
// failures are swallowed.
export function maybeDistillOnRefill(userId: number, worldId: number, versionId: number): void {
  const distilled = db
    .select({ n: discoverProfile.distilled_signal_count })
    .from(discoverProfile)
    .where(and(
      eq(discoverProfile.world_id, worldId),
      eq(discoverProfile.world_version_id, versionId),
      eq(discoverProfile.user_id, userId),
    ))
    .get()?.n ?? 0
  if (promptCount(userId, worldId, versionId) - distilled < DISTILL_THRESHOLD) return
  void distillDiscoverProfile(userId, worldId, versionId).catch(err =>
    console.warn(`[discover distill] background run failed: ${err instanceof Error ? err.message : 'unknown error'}`))
}
