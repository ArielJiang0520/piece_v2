import { Hono } from 'hono'
import { and, desc, eq } from 'drizzle-orm'
import { db, prompts } from '../../db'
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

const similarRoutes = new Hono<{ Variables: Variables }>()

const SIMILAR_TIMEOUT_MS = 60000
// Lower than story generation: the muse must stay anchored to the writer's prompt. At 1.0 it
// drifts into generic premises spun from the world setting instead of building on the prompt.
const SIMILAR_TEMPERATURE = 0.7
// Nothing here is capped by length. Keeping the world from dominating is the prompt's job — it
// says so in as many words below — not a job for cutting the writer's setting in half.

// Short on purpose — see the comment on workshopInstruction(). The source prompt lives here rather
// than in the conversation: the first user turn is the writer's own words, and on this screen they
// may not have typed any. The world stays a consistency-only reference so it doesn't take over from
// the prompt being built on.
//
// What this screen is FOR: a different story with the same appeal — new situation, new people, a
// different corner of the world. Not a better-worded version of the prompt it came from. Both
// failures here were the instructions, not the model. Naming only the tone as portable ("its
// characters, situation or tone taken somewhere new") let the model keep the cast and the scene and
// call that new, so the portable thing is now named alone and everything else is named as changing.
// And revisionInstruction() — "change what they asked for and leave the rest" — has nothing to
// attach to on the Ideas screen's first turn, but here the source prompt is in the system prompt,
// so it read as an instruction to edit that. It is withheld until there is a draft to revise.
function buildSimilarSystemPrompt(worldBody: string, sourceText: string, revising: boolean): string {
  const world = worldBody.trim()
  return [
    workshopInstruction(),
    '',
    `Here is a prompt the writer liked. What carries over from it is the feel — its mood, its register, the kind of thing it goes looking for. Nothing else does: a new situation, different people, another corner of the world. Never a rewording of the prompt below, and never the same scene from a different angle.\n\n${sourceText}`,
    '',
    revising
      ? `${revisionInstruction()}\nThe writer's notes are about the prompt you last wrote, not about the one above.`
      : '',
    '',
    world
      ? `This is the world it is set in, for names and facts only. Don't take ideas from it.\n\n${world}`
      : '',
    // Last, where it is closest to the answer: these instructions are in English and the writer's
    // prompt usually is not, and a model follows the language it was addressed in unless told.
    "Write the new prompt in the same language as the writer's prompt above, never in the language of these instructions.",
  ].filter(Boolean).join('\n')
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

  const body = await c.req.json()
  const id = Number(body?.promptId)
  if (!Number.isInteger(id) || id < 1) return c.json({ error: 'A prompt is required' }, 400)

  // Only a prompt that actually belongs to this user's world.
  const source = db
    .select({ text: prompts.text })
    .from(prompts)
    .where(and(eq(prompts.id, id), eq(prompts.world_id, worldId), eq(prompts.user_id, userId)))
    .get()
  const sourceText = source?.text.trim()
  if (!sourceText) return c.json({ error: 'Prompt not found' }, 404)

  const workshop = parseWorkshopInput(body)

  // Pinned, not chosen: the workshop model is a fixture of the feature and the client never sends one.
  const modelOption = getModelById(PROMPT_WORKSHOP_MODEL_ID)
  if (!modelOption) return c.json({ error: 'Similar-prompts model is not configured' }, 500)

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return c.json({ error: 'OPENROUTER_API_KEY is not set on the server' }, 500)

  // Unlike the Ideas screen, the writer need not say anything to start: they arrived here by
  // tapping "more like this" ON a prompt, and that tap is the brief. The conversation still needs
  // a first turn, so stand one in for them. The client normally sends this in the reader's own
  // language; this fallback only covers a client that sent nothing.
  if (workshop.notes.length === 0) {
    workshop.notes = ['Write me a different prompt that feels like mine.']
  }

  const worldBody = worldBodyWithAdditions(userId, worldId, world.current_version_id, world.body, body?.additionIds)
  const messages = workshopMessages(
    buildSimilarSystemPrompt(worldBody, sourceText, workshop.drafts.length > 0),
    workshop,
  )

  const { draft, failure } = await requestDraft({
    apiKey,
    model: modelOption,
    messages,
    temperature: SIMILAR_TEMPERATURE,
    timeoutMs: SIMILAR_TIMEOUT_MS,
  })

  if (failure) return c.json({ error: failure.message }, failure.status as any)
  return c.json({ draft })
})

export default similarRoutes
