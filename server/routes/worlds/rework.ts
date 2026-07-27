import { Hono } from 'hono'
import { type Variables, authMiddleware } from '../../middleware'
import { findUserWorld, getModelById, getUserId, paramInt } from '../../route-helpers'
import { PROMPT_WORKSHOP_MODEL_ID } from '../../../src/preferences/generationModel'
import {
  parseWorkshopInput,
  requestDraft,
  revisionInstruction,
  workshopInstruction,
  workshopMessages,
} from './prompt-workshop'

const reworkRoutes = new Hono<{ Variables: Variables }>()

const REWORK_TIMEOUT_MS = 60000
// Lower than story generation for the same reason as the other two workshops: the model is working
// to the writer's text, not ranging on its own.
const REWORK_TEMPERATURE = 0.7

// The third workshop, and the counterpart to "More like this": this one stays on the prompt the
// writer already has. Same story, same people, same situation — sharper. What it produces is
// another version inside the same cluster, which is what makes it a different thing from
// `similar.ts` rather than a differently-worded version of it.
//
// The anchor is the text in the writer's editor, not a saved row: they may have typed over it
// before asking for a pass, and that half-finished edit is exactly what they want worked on.
//
// revisionInstruction() belongs here from the first turn — it is what it was written for. The one
// line after it is this screen's own: "revising never makes it longer" is the right default against
// walls of text, but detail the writer explicitly asks for is the whole point of the screen.
function buildReworkSystemPrompt(worldBody: string, text: string): string {
  const world = worldBody.trim()
  return [
    workshopInstruction(),
    '',
    revisionInstruction(),
    'Detail the writer asks for is worth the words it takes. Nothing else is.',
    '',
    `Here is the writer's prompt — this is the one you are working on. Keep its story: the same situation, the same people, the same corner of the world. You are making it sharper, clearer, more like what they are reaching for. Never hand back a different premise.\n\n${text}`,
    '',
    world
      ? `This is the world it is set in, for names and facts only. Don't take ideas from it.\n\n${world}`
      : '',
    // Last, where it is closest to the answer: these instructions are in English and the writer's
    // prompt usually is not, and a model follows the language it was addressed in unless told.
    "Write the prompt in the same language as the writer's prompt above, never in the language of these instructions.",
  ].filter(Boolean).join('\n')
}

reworkRoutes.post('/', authMiddleware, async (c: any) => {
  const userId = getUserId(c)
  const worldId = paramInt(c, 'id')
  const world = findUserWorld(userId, worldId)
  if (!world) return c.json({ error: 'Not found' }, 404)

  const body = await c.req.json().catch(() => ({}))
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  if (!text) return c.json({ error: 'A prompt is required' }, 400)

  const workshop = parseWorkshopInput(body)

  // Pinned, not chosen: the workshop model is a fixture of the feature and the client never sends one.
  const modelOption = getModelById(PROMPT_WORKSHOP_MODEL_ID)
  if (!modelOption) return c.json({ error: 'Workshop model is not configured' }, 500)

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return c.json({ error: 'OPENROUTER_API_KEY is not set on the server' }, 500)

  // Like "More like this", the writer need not say anything to start: they tapped Rework ON their
  // own text, and that tap is the brief. The conversation still needs a first turn, so stand one
  // in. The client normally sends this in the reader's own language.
  if (workshop.notes.length === 0) {
    workshop.notes = ['Give my prompt a pass — same story, sharper.']
  }

  const messages = workshopMessages(buildReworkSystemPrompt(world.body, text), workshop)

  const { draft, failure } = await requestDraft({
    apiKey,
    model: modelOption,
    messages,
    temperature: REWORK_TEMPERATURE,
    timeoutMs: REWORK_TIMEOUT_MS,
  })

  if (failure) return c.json({ error: failure.message }, failure.status as any)
  return c.json({ draft })
})

export default reworkRoutes
