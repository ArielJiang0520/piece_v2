import { Hono } from 'hono'
import { type Variables, authMiddleware } from '../../middleware'
import { findUserWorld, getModelById, getUserId, paramInt } from '../../route-helpers'
import { SIMILAR_MODEL_ID } from '../../../src/preferences/generationModel'
import { requestPromptCandidates } from './prompt-candidates'

const ideasRoutes = new Hono<{ Variables: Variables }>()

const CANDIDATE_COUNT = 5
const IDEAS_TIMEOUT_MS = 60000
// Higher than "similar prompts": here the whole point is to spin fresh premises out of the world
// setting, so we WANT the model to range widely across it rather than stay anchored to one seed.
const IDEAS_TEMPERATURE = 0.9
// The world is the source of ideas here (not a demoted reference), so give the model a generous slice
// of it — but still cap so a sprawling world can't blow the budget.
const MAX_WORLD_REFERENCE_CHARS = 4000
// The optional hint is a nudge, not a fresh brief — cap it so it can't swamp the world.
const MAX_HINT_CHARS = 400

function truncateWorldReference(worldBody: string): string {
  const trimmed = worldBody.trim()
  if (trimmed.length <= MAX_WORLD_REFERENCE_CHARS) return trimmed
  return `${trimmed.slice(0, MAX_WORLD_REFERENCE_CHARS).trimEnd()}…`
}

// A muse for a blank page: invent fresh story prompts grounded in the world. Unlike "similar
// prompts", there is no seed prompt — the world setting IS the raw material, and each idea should
// mine a different corner of it.
function buildIdeasSystemPrompt(worldBody: string): string {
  const sections: string[] = []

  sections.push(
    [
      '# Role',
      'You are a brainstorming partner who invents fresh story prompts set in a given world.',
    ].join('\n'),
  )

  sections.push(
    [
      '# Task',
      `Read the world setting below and create ${CANDIDATE_COUNT} NEW story prompts grounded in it. Each prompt is a premise for a one-shot — something that could happen in this world.`,
      '',
      'Rules:',
      '- Stay true to the world setting. Use the world\'s own language/tone. Do not polish language.',
      `- Make the ${CANDIDATE_COUNT} prompts different from each other.`,
      '- A prompt is a short premise (one or two sentences), not the story itself. No too many details.',
    ].join('\n'),
  )

  const worldReference = truncateWorldReference(worldBody)
  sections.push(
    [
      '# World setting (the source of ideas)',
      worldReference || '(The writer has not written a setting yet — invent evocative, open-ended prompts a writer could take anywhere.)',
    ].join('\n'),
  )

  sections.push(
    `# Output\nRespond with ONLY a JSON object of the form {"prompts": ["...", "..."]} containing exactly ${CANDIDATE_COUNT} prompt strings. No commentary, no markdown.`,
  )

  sections.push(
    `# Language\nRegardless of the language of these instructions, always write the prompts in the same language as the world setting above.`,
  )

  return sections.join('\n\n')
}

ideasRoutes.post('/', authMiddleware, async (c: any) => {
  const userId = getUserId(c)
  const worldId = paramInt(c, 'id')
  const world = findUserWorld(userId, worldId)
  if (!world) return c.json({ error: 'Not found' }, 404)

  const { hint, model } = await c.req.json().catch(() => ({}))
  const hintText = typeof hint === 'string' ? hint.trim().slice(0, MAX_HINT_CHARS) : ''

  // The writer picks the brainstorming model (shares the story-generation choice on the client);
  // fall back to the pinned idea model for an absent/invalid pick.
  const modelOption = getModelById(model) ?? getModelById(SIMILAR_MODEL_ID)
  if (!modelOption) return c.json({ error: 'Idea-generation model is not configured' }, 500)

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return c.json({ error: 'OPENROUTER_API_KEY is not set on the server' }, 500)

  const userMessageLines = [
    `Give me ${CANDIDATE_COUNT} fresh story prompts set in this world, each exploring a different part of it.`,
  ]
  if (hintText) {
    userMessageLines.push('', `Lean the ideas toward this: ${hintText}`)
  }

  const messages = [
    { role: 'system', content: buildIdeasSystemPrompt(world.body) },
    { role: 'user', content: userMessageLines.join('\n') },
  ]

  const { candidates, failure } = await requestPromptCandidates({
    apiKey,
    model: modelOption,
    messages,
    temperature: IDEAS_TEMPERATURE,
    count: CANDIDATE_COUNT,
    timeoutMs: IDEAS_TIMEOUT_MS,
  })

  if (failure) return c.json({ error: failure.message }, failure.status as any)
  if (candidates.length === 0) return c.json({ error: 'No candidates returned' }, 502)
  return c.json({ candidates })
})

export default ideasRoutes
