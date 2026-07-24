import { Hono } from 'hono'
import { type Variables, authMiddleware } from '../../middleware'
import { findUserWorld, getModelById, getUserId, paramInt } from '../../route-helpers'
import { SIMILAR_MODEL_ID } from '../../../src/preferences/generationModel'
import {
  candidateFormatInstruction,
  parseSessionInput,
  requestPromptCandidates,
  sessionInstructionLines,
  withoutKept,
} from './prompt-candidates'

const ideasRoutes = new Hono<{ Variables: Variables }>()

const CANDIDATE_COUNT = 5
const IDEAS_TIMEOUT_MS = 60000
// Higher than "similar prompts": here the whole point is to spin fresh premises out of the world
// setting, so we WANT the model to range widely across it rather than stay anchored to one seed.
const IDEAS_TEMPERATURE = 0.9
// The world is the source of ideas here, and it goes in whole — the one size limit lives at the
// call itself (llm-budget.ts), not in a slice taken out of the writer's setting.

// A muse for a blank page: invent fresh story prompts grounded in the world. Unlike "more like
// this", there is no seed prompt — the world setting IS the raw material, and each idea should
// mine a different corner of it. Across a session the writer narrows that down round by round.
function buildIdeasSystemPrompt(worldBody: string, count: number): string {
  const sections: string[] = []

  sections.push(
    [
      '# Role',
      'You are a brainstorming partner who invents fresh story prompts set in a given world.',
      'You work in rounds: the writer tells you what they are after, you offer a batch, they tell you which ones landed and what to change, and you go again. Each round should move toward what they are describing, not restart from scratch.',
    ].join('\n'),
  )

  sections.push(
    [
      '# Task',
      `Read the world setting below and create ${count} NEW story prompts grounded in it. Each prompt is a premise for a one-shot — something that could happen in this world.`,
      '',
      'Rules:',
      '- Stay true to the world setting. Use the world\'s own language/tone. Do not polish language.',
      `- Make the ${count} prompts different from each other.`,
      '- A prompt is a short premise (one or two sentences), not the story itself. No too many details.',
      '- When the writer has said what they want, that is the target — follow it even where the world offers something easier.',
    ].join('\n'),
  )

  const worldReference = worldBody.trim()
  sections.push(
    [
      '# World setting (the source of ideas)',
      worldReference || '(The writer has not written a setting yet — invent evocative, open-ended prompts a writer could take anywhere.)',
    ].join('\n'),
  )

  sections.push(candidateFormatInstruction(count))

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

  const body = await c.req.json().catch(() => ({}))
  const session = parseSessionInput(body)
  // The board is always five. Whatever the writer kept stays put, so this round only fills the
  // slots they freed — keeping the batch a fixed size no matter how far into a session they are.
  const wanted = Math.max(1, CANDIDATE_COUNT - session.kept.length)

  // The writer picks the brainstorming model (shares the story-generation choice on the client);
  // fall back to the pinned idea model for an absent/invalid pick.
  const modelOption = getModelById(body?.model) ?? getModelById(SIMILAR_MODEL_ID)
  if (!modelOption) return c.json({ error: 'Idea-generation model is not configured' }, 500)

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return c.json({ error: 'OPENROUTER_API_KEY is not set on the server' }, 500)

  const userMessageLines = [
    `Give me ${wanted} fresh story prompts set in this world, each exploring a different part of it.`,
    ...sessionInstructionLines(session, wanted),
  ]

  const messages = [
    { role: 'system', content: buildIdeasSystemPrompt(world.body, wanted) },
    { role: 'user', content: userMessageLines.join('\n') },
  ]

  const { candidates, failure } = await requestPromptCandidates({
    apiKey,
    model: modelOption,
    messages,
    temperature: IDEAS_TEMPERATURE,
    count: wanted,
    timeoutMs: IDEAS_TIMEOUT_MS,
  })

  if (failure) return c.json({ error: failure.message }, failure.status as any)
  const fresh = withoutKept(candidates, session.kept)
  if (fresh.length === 0) return c.json({ error: 'No candidates returned' }, 502)
  return c.json({ candidates: fresh })
})

export default ideasRoutes
