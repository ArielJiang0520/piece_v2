import { Hono } from 'hono'
import { and, desc, eq } from 'drizzle-orm'
import { db, prompts } from '../../db'
import { type Variables, authMiddleware } from '../../middleware'
import { findUserWorld, getModelById, getUserId, paramInt } from '../../route-helpers'
import { DISCOVER_MODEL_ID } from '../../../src/preferences/generationModel'
import { clusterPromptById } from '../../prompt-clustering'
import { normalizePromptInput, promptTextMatchesNormalized } from '../../prompt-text'
import { candidateFormatInstruction, requestPromptCandidates } from './prompt-candidates'
import { maybeDistillOnRefill, readDiscoverProfile } from '../../discover-profile'

// The Discover feed: a producer/consumer deck of story premises the reader browses one at a time.
// A refill makes two calls with the SAME prompt: one given the reader's Discover profile, one
// given only the world. The second is the wildcard arm — nothing tells it to be surprising, it
// simply has no pattern to conform to. A refill writes nothing: the deck is the client's browse
// cache, and the only thing Discover ever persists is the prompt row a Like creates.

const discoverRoutes = new Hono<{ Variables: Variables }>()

const ALIGNED_COUNT = 4
// Set to 0 to turn the arm off; nothing else in the pipeline assumes wildcards exist.
const WILDCARD_COUNT = 2
const TEMPERATURE = 1
const TIMEOUT_MS = 60_000

type Arm = 'aligned' | 'wildcard'

interface Candidate {
  text: string
  kind: Arm
}

// One prompt for both arms. The profile section simply doesn't render when it's empty, which is
// the entire difference between the two calls: the aligned call passes the Discover profile, the
// wildcard call passes nothing. No instruction tells the wildcard arm to deviate — with no
// pattern in context there's nothing for it to conform to, and the register still comes from the
// world body either way.
function buildSystemPrompt(input: {
  worldBody: string
  count: number
  discoverProfileText: string
}): string {
  const sections: string[] = []

  sections.push([
    '# Role',
    'You are the reader\'s muse: you know this story world, and you hand them one premise at a time to see which one catches.',
  ].join('\n'))

  sections.push([
    '# Task',
    `Offer ${input.count} story premises set in the world below.`,
    '',
    'Rules:',
    '- A premise is one or two sentences — a situation, not a story. Just the premise itself.',
    '- Stay true to the world setting and use its own language and tone.',
    `- Make all ${input.count} clearly different from each other.`,
  ].join('\n'))

  sections.push([
    '# World setting',
    input.worldBody.trim(),
  ].join('\n'))

  if (input.discoverProfileText) {
    sections.push([
      '# What this reader picks',
      'Written from what they have chosen in this world. Aim at this.',
      '',
      input.discoverProfileText,
    ].join('\n'))
  }

  sections.push(candidateFormatInstruction(input.count))

  sections.push('# Language\nRegardless of the language of these instructions, always write the premises in the same language as the world setting above.')

  return sections.join('\n\n')
}

// Wildcards go in among the aligned cards rather than after them, so the reader meets one before
// they've swiped through the whole batch.
function interleaveArms(aligned: string[], wildcards: string[]): Candidate[] {
  const out: Candidate[] = aligned.map(text => ({ text, kind: 'aligned' as const }))
  wildcards.forEach((text, index) => {
    const at = Math.min(out.length, (index + 1) * 2 + index)
    out.splice(at, 0, { text, kind: 'wildcard' })
  })
  return out
}

discoverRoutes.post('/refill', authMiddleware, async (c: any) => {
  const userId = getUserId(c)
  const worldId = paramInt(c, 'id')
  const world = findUserWorld(userId, worldId)
  if (!world) return c.json({ error: 'Not found' }, 404)

  // A world with no setting has nothing for Discover to be about — the client shows an empty
  // state instead of calling; this is the backstop.
  if (!world.body.trim()) return c.json({ error: 'This world has no setting yet' }, 409)
  // Every world has a checked-out version; one without is a bug state, not a case to serve.
  if (world.current_version_id == null) return c.json({ error: 'World has no version' }, 500)
  const versionId = world.current_version_id

  // Discover has its own pinned model (generationModel.ts), not the reader's story-model choice:
  // the two jobs are unrelated, and the feed generates in the background where the reader never
  // sees or chooses the model.
  const modelOption = getModelById(DISCOVER_MODEL_ID)
  if (!modelOption) return c.json({ error: 'Discover model is not configured' }, 500)

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return c.json({ error: 'OPENROUTER_API_KEY is not set on the server' }, 500)

  // Refills are also the only place the profile trigger lives: the DB is the signal (every kept
  // premise and written prompt is a prompt row), so the check runs where the profile has a
  // consumer and nowhere else. Never awaited — a refill never waits on a distill.
  maybeDistillOnRefill(userId, worldId, versionId)

  // Two independent calls, run in parallel under separate owner keys so neither waits on the
  // other. They are separate because the arms need opposite context: the aligned prompt gets the
  // reader's profile, the wildcard prompt gets none of it.
  const alignedRequest = requestPromptCandidates({
    apiKey,
    model: modelOption,
    temperature: TEMPERATURE,
    count: ALIGNED_COUNT,
    timeoutMs: TIMEOUT_MS,
    ownerKey: `discover:${userId}:${worldId}`,
    messages: [
      {
        role: 'system',
        content: buildSystemPrompt({
          worldBody: world.body,
          count: ALIGNED_COUNT,
          discoverProfileText: readDiscoverProfile(userId, worldId, versionId),
        }),
      },
      { role: 'user', content: `Give me ${ALIGNED_COUNT} premises for this reader.` },
    ],
  })

  const wildcardRequest = WILDCARD_COUNT > 0
    ? requestPromptCandidates({
      apiKey,
      model: modelOption,
      temperature: TEMPERATURE,
      count: WILDCARD_COUNT,
      timeoutMs: TIMEOUT_MS,
      ownerKey: `discover-wild:${userId}:${worldId}`,
      messages: [
        {
          role: 'system',
          // Same builder, no profile — that omission is the whole wildcard mechanism.
          content: buildSystemPrompt({
            worldBody: world.body,
            count: WILDCARD_COUNT,
            discoverProfileText: '',
          }),
        },
        { role: 'user', content: `Give me ${WILDCARD_COUNT} premises from this world.` },
      ],
    })
    : Promise.resolve({ candidates: [] as string[], failure: null })

  const [aligned, wildcards] = await Promise.all([alignedRequest, wildcardRequest])

  // The aligned arm is the feed; without it there is nothing to show. A failed wildcard call is
  // survivable — the reader gets four cards instead of six rather than an error screen.
  if (aligned.failure) return c.json({ error: aligned.failure.message }, aligned.failure.status as any)
  if (aligned.candidates.length === 0) return c.json({ error: 'No candidates returned' }, 502)
  if (wildcards.failure) console.warn('[discover] wildcard arm failed:', wildcards.failure.message)

  // `kind` is transient — it drives the interleave and the client's wildcard pill, and is
  // recorded nowhere.
  return c.json({ candidates: interleaveArms(aligned.candidates, wildcards.candidates) })
})

// Like: the premise becomes a real prompt in this world, visible in the Prompts tab right away
// (generated, zero pieces). That prompt row is the entire record of the like — it is also what
// the next distill reads, so nothing else needs to hear about it.
discoverRoutes.post('/like', authMiddleware, async (c: any) => {
  const userId = getUserId(c)
  const worldId = paramInt(c, 'id')
  const world = findUserWorld(userId, worldId)
  if (!world) return c.json({ error: 'Not found' }, 404)

  const payload = await c.req.json().catch(() => ({}))
  const text = normalizePromptInput(payload.text)
  if (!text) return c.json({ error: 'Prompt text required' }, 400)

  const findExisting = () => db
    .select({ id: prompts.id, cluster_id: prompts.cluster_id })
    .from(prompts)
    .where(and(promptTextMatchesNormalized(prompts.text, text), eq(prompts.world_id, worldId), eq(prompts.user_id, userId)))
    .orderBy(desc(prompts.updated_at), desc(prompts.id))
    .get()

  // The same premise may already exist as a prompt — the reader wrote it before, or saved a piece
  // from this very card a moment ago. Dedupe first (and again on a failed insert, which is what
  // the unique normalized-text index throws when a save lands in between).
  const existing = findExisting()
  if (existing) {
    return c.json({ promptId: existing.id, clusterId: existing.cluster_id, alreadyExisted: true })
  }

  const now = Date.now()
  let promptId: number
  try {
    promptId = db.insert(prompts).values({
      user_id: userId,
      world_id: worldId,
      is_generated: 1,
      text,
      piece_count: 0,
      world_version_id: world.current_version_id,
      created_at: now,
      updated_at: now,
    }).returning({ id: prompts.id }).get().id
  } catch {
    const raced = findExisting()
    if (!raced) return c.json({ error: 'Could not save this prompt' }, 500)
    return c.json({ promptId: raced.id, clusterId: raced.cluster_id, alreadyExisted: true })
  }

  const clusterId = await clusterPromptById(promptId)
  return c.json({ promptId, clusterId, alreadyExisted: false })
})

export default discoverRoutes
