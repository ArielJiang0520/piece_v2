import { Hono } from 'hono'
import { and, desc, eq } from 'drizzle-orm'
import { db, prompts } from '../../db'
import { type Variables, authMiddleware } from '../../middleware'
import { findUserWorld, getModelById, getUserId, paramInt } from '../../route-helpers'
import { SIMILAR_MODEL_ID } from '../../../src/preferences/generationModel'
import { requestPromptCandidates } from './prompt-candidates'

const similarRoutes = new Hono<{ Variables: Variables }>()

const CANDIDATE_COUNT = 5
const SIMILAR_TIMEOUT_MS = 60000
// Lower than story generation: the muse must stay anchored to the writer's prompt. At 1.0 it
// drifts into generic premises spun from the world setting instead of riffing on the prompt.
const SIMILAR_TEMPERATURE = 0.7
// A long, evocative world easily out-masses a one-sentence prompt and starts dominating the
// output. Cap the reference so it can keep names/facts straight without becoming the main source.
const MAX_WORLD_REFERENCE_CHARS = 1200
// The optional hint is a nudge, not a fresh brief — cap it so it can't swamp the source prompt.
const MAX_HINT_CHARS = 400

function truncateWorldReference(worldBody: string): string {
  const trimmed = worldBody.trim()
  if (trimmed.length <= MAX_WORLD_REFERENCE_CHARS) return trimmed
  return `${trimmed.slice(0, MAX_WORLD_REFERENCE_CHARS).trimEnd()}…`
}

// A muse, not a story writer. The writer's OWN prompt is the raw material — the goal is a set of
// fresh variations that stay recognizably similar to it, not new ideas spun out of the world. The
// world setting is demoted to a consistency-only reference so it doesn't dominate.
function buildSimilarSystemPrompt(worldBody: string): string {
  const sections: string[] = []

  sections.push(
    [
      '# Role',
      "You are a brainstorming partner who riffs on a writer's own story prompt into similar new ones.",
    ].join('\n'),
  )

  sections.push(
    [
      '# Task',
      `Below, the writer gives you one of their existing prompts. Create ${CANDIDATE_COUNT} NEW prompts that are each similar to it — riffing on its characters, situations, settings, relationships, or tone in a fresh direction.`,
      '',
      'Rules:',
      '- Each new prompt should feel clearly related to the original, but take it somewhere new — a different angle, twist, or "what if". Do NOT simply rephrase the original.',
      '- Do NOT invent a premise straight from the world setting on its own — the provided prompt is the seed of ideas, not the world.',
      `- Make all ${CANDIDATE_COUNT} new prompts clearly distinct from each other.`,
      '- A prompt is a short premise or instruction for a story (one or two sentences), not the story itself.',
    ].join('\n'),
  )

  const worldReference = truncateWorldReference(worldBody)
  if (worldReference) {
    sections.push(
      [
        '# World setting (background reference only — NOT a source of ideas)',
        'This is here ONLY so names and facts stay consistent. Do NOT pull premises, plots, or themes from it. Every new prompt must come from the writer\'s prompt below, not from this setting.',
        '',
        worldReference,
      ].join('\n'),
    )
  }

  sections.push(
    `# Output\nRespond with ONLY a JSON object of the form {"prompts": ["...", "..."]} containing exactly ${CANDIDATE_COUNT} prompt strings. No commentary, no markdown.`,
  )

  sections.push(
    `# Language\nRegardless of the language of these instructions, always write the new prompts in the same language as the prompt the writer provides.`,
  )

  return sections.join('\n\n')
}

// The prompts spun off THIS one via "More like this" — its children, recorded when each was first
// saved (`similar_to_prompt_id`). Powers the "N prompts inspired by this prompt" sheet.
similarRoutes.get('/:promptId/children', authMiddleware, (c: any) => {
  const userId = getUserId(c)
  const worldId = paramInt(c, 'id')
  const promptId = paramInt(c, 'promptId')
  if (!findUserWorld(userId, worldId)) return c.json({ error: 'Not found' }, 404)

  const children = db
    .select({
      id: prompts.id,
      text: prompts.text,
      piece_count: prompts.piece_count,
      created_at: prompts.created_at,
      updated_at: prompts.updated_at,
    })
    .from(prompts)
    .where(and(
      eq(prompts.similar_to_prompt_id, promptId),
      eq(prompts.world_id, worldId),
      eq(prompts.user_id, userId),
    ))
    .orderBy(desc(prompts.created_at), desc(prompts.id))
    .all()

  return c.json({ children })
})

similarRoutes.post('/', authMiddleware, async (c: any) => {
  const userId = getUserId(c)
  const worldId = paramInt(c, 'id')
  const world = findUserWorld(userId, worldId)
  if (!world) return c.json({ error: 'Not found' }, 404)

  const { promptId, hint } = await c.req.json()
  const id = Number(promptId)
  if (!Number.isInteger(id) || id < 1) return c.json({ error: 'A prompt is required' }, 400)

  // Only a prompt that actually belongs to this user's world.
  const source = db
    .select({ text: prompts.text })
    .from(prompts)
    .where(and(eq(prompts.id, id), eq(prompts.world_id, worldId), eq(prompts.user_id, userId)))
    .get()
  const sourceText = source?.text.trim()
  if (!sourceText) return c.json({ error: 'Prompt not found' }, 404)

  const hintText = typeof hint === 'string' ? hint.trim().slice(0, MAX_HINT_CHARS) : ''

  // "Similar prompts" always uses its own fixed model, not the user's story-generation choice.
  const modelOption = getModelById(SIMILAR_MODEL_ID)
  if (!modelOption) return c.json({ error: 'Similar-prompts model is not configured' }, 500)

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return c.json({ error: 'OPENROUTER_API_KEY is not set on the server' }, 500)

  const userMessageLines = [
    `Here is my prompt. Spin it into ${CANDIDATE_COUNT} new ones, each similar to it but taking a fresh direction:`,
    '',
    sourceText,
    '',
    // Repeated last so it is the freshest thing in context — this is where drift toward
    // generic, world-derived premises usually creeps in.
    'Build each new prompt out of the prompt above — its characters, situations, and tone. Do not invent a premise that comes only from the world setting.',
  ]
  if (hintText) {
    userMessageLines.push('', `Additionally, lean the new ideas toward this: ${hintText}`)
  }

  const messages = [
    { role: 'system', content: buildSimilarSystemPrompt(world.body) },
    { role: 'user', content: userMessageLines.join('\n') },
  ]

  const { candidates, failure } = await requestPromptCandidates({
    apiKey,
    model: modelOption,
    messages,
    temperature: SIMILAR_TEMPERATURE,
    count: CANDIDATE_COUNT,
    timeoutMs: SIMILAR_TIMEOUT_MS,
  })

  if (failure) return c.json({ error: failure.message }, failure.status as any)
  if (candidates.length === 0) return c.json({ error: 'No candidates returned' }, 502)
  return c.json({ candidates })
})

export default similarRoutes
