import { Hono } from 'hono'
import { type Variables, authMiddleware } from '../../middleware'
import { findUserWorld, getModelById, getUserId, paramInt } from '../../route-helpers'
import { PROMPT_WORKSHOP_MODEL_ID } from '../../../src/preferences/generationModel'
import { worldBodyWithAdditions } from '../../world-additions'
import {
  parseWorkshopInput,
  requestDraft,
  revisionInstruction,
  workshopInstruction,
  workshopMessages,
} from './prompt-workshop'

// The empty-editor half of the AI sheet over the prompt editor: there is no prompt to work from
// yet, so the world is the anchor and the writer's brief is the whole ask. `rework.ts` is the other
// half, for once there is text on the page — from the writer's side it is one sheet, and which
// request goes out is decided by whether the editor has anything in it.
const ideasRoutes = new Hono<{ Variables: Variables }>()

const IDEAS_TIMEOUT_MS = 60000
// The writer always says what they are after before the first draft, so the model is never
// ranging over the world on its own — it is working to a brief, and stays anchored to it.
const IDEAS_TEMPERATURE = 0.7
// The world is the source of ideas here, and it goes in whole — the one size limit lives at the
// call itself (llm-budget.ts), not in a slice taken out of the writer's setting.

// Short on purpose. The instructions set the register of the answer, so a long, carefully sectioned
// brief gets a long, carefully sectioned prompt back — see the comment on workshopInstruction().
// The world body is the only long thing here, and it is the writer's own text.
function buildIdeasSystemPrompt(worldBody: string): string {
  const world = worldBody.trim()
  return [
    workshopInstruction(),
    '',
    revisionInstruction(),
    '',
    world
      ? `The story is set in this world. Stay true to it and use its own words.\n\n${world}`
      : 'The writer has not written a setting yet, so keep the prompt open-ended.',
    '',
    // Last, where it is closest to the answer: these instructions are in English and the setting
    // usually is not, and a model follows the language it was addressed in unless told otherwise.
    'Write the prompt in the same language as the world above, never in the language of these instructions.',
  ].join('\n')
}

ideasRoutes.post('/', authMiddleware, async (c: any) => {
  const userId = getUserId(c)
  const worldId = paramInt(c, 'id')
  const world = findUserWorld(userId, worldId)
  if (!world) return c.json({ error: 'Not found' }, 404)

  const body = await c.req.json().catch(() => ({}))
  const workshop = parseWorkshopInput(body)
  // The writer always seeds this one. Nothing here can write a prompt worth revising out of a
  // blank world alone, so an empty trail is a client bug, not a case to invent a default for.
  if (workshop.notes.length === 0) return c.json({ error: 'Say what you are after first' }, 400)

  // Pinned, not chosen: the workshop model is a fixture of the feature and the client never sends one.
  const modelOption = getModelById(PROMPT_WORKSHOP_MODEL_ID)
  if (!modelOption) return c.json({ error: 'Idea-generation model is not configured' }, 500)

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return c.json({ error: 'OPENROUTER_API_KEY is not set on the server' }, 500)

  const worldBody = worldBodyWithAdditions(userId, worldId, world.current_version_id, world.body, body?.additionIds)
  const messages = workshopMessages(buildIdeasSystemPrompt(worldBody), workshop)

  const { draft, failure } = await requestDraft({
    apiKey,
    model: modelOption,
    messages,
    temperature: IDEAS_TEMPERATURE,
    timeoutMs: IDEAS_TIMEOUT_MS,
  })

  if (failure) return c.json({ error: failure.message }, failure.status as any)
  return c.json({ draft })
})

export default ideasRoutes
