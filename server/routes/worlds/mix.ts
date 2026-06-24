import { Hono } from 'hono'
import { and, eq, inArray } from 'drizzle-orm'
import { db, prompts } from '../../db'
import { type Variables, authMiddleware } from '../../middleware'
import { findUserWorld, getModelById, getUserId, paramInt } from '../../route-helpers'
import { BLACKLISTED_PROVIDERS, MIX_MODEL_ID } from '../../../src/preferences/generationModel'
import { withGenerationSlot } from '../../generation-lock'

const mixRoutes = new Hono<{ Variables: Variables }>()

const CANDIDATE_COUNT = 4
const MIX_TIMEOUT_MS = 60000

// A muse, not a story writer. The writer's OWN prompts are the raw material — the goal is a
// recognizable crossover of them, not fresh ideas spun out of the world. The world setting is
// demoted to a consistency-only reference so it doesn't dominate and produce generic prompts.
// With a single source prompt there is nothing to cross over, so the task degrades to spinning
// fresh variations inspired by that one prompt.
function buildMixSystemPrompt(worldBody: string, sourceCount: number): string {
  const sections: string[] = []

  sections.push(
    [
      '# Role',
      "You are a brainstorming partner who remixes a writer's own story prompts into new ones.",
    ].join('\n'),
  )

  if (sourceCount < 2) {
    sections.push(
      [
        '# Task',
        `Below, the writer gives you one of their existing prompts. Create ${CANDIDATE_COUNT} NEW prompts that are each inspired by it — riffing on its characters, situations, settings, relationships, or tone in a fresh direction.`,
        '',
        'Rules:',
        '- Each new prompt should feel related to the original, but take it somewhere new — a different angle, twist, or "what if". Do NOT simply rephrase the original.',
        '- Do NOT invent a premise straight from the world setting on its own — the provided prompt is the seed of ideas, not the world.',
        `- Make all ${CANDIDATE_COUNT} new prompts clearly distinct from each other.`,
        '- A prompt is a short premise or instruction for a story (one or two sentences), not the story itself.',
      ].join('\n'),
    )
  } else {
    sections.push(
      [
        '# Task',
        `Below, the writer gives you several of their existing prompts. Create ${CANDIDATE_COUNT} NEW prompts, where each one deliberately MIXES concrete elements — characters, situations, settings, relationships, tones — taken from TWO OR MORE of the writer's prompts.`,
        '',
        'Rules:',
        '- Every new prompt must visibly combine elements from at least two of the provided prompts. Someone who knows the originals should be able to point at which prompts each new one came from.',
        '- Do NOT simply rephrase a single existing prompt, and do NOT invent a premise straight from the world setting on its own — the provided prompts are the source of ideas, not the world.',
        `- Make all ${CANDIDATE_COUNT} new prompts clearly distinct from each other.`,
        '- A prompt is a short premise or instruction for a story (one or two sentences), not the story itself.',
      ].join('\n'),
    )
  }

  if (worldBody.trim()) {
    sections.push(
      `# World setting (reference only)\nUse this only to keep names and facts consistent. It is NOT a source of new ideas.\n\n${worldBody.trim()}`,
    )
  }

  sections.push(
    `# Output\nRespond with ONLY a JSON object of the form {"prompts": ["...", "..."]} containing exactly ${CANDIDATE_COUNT} prompt strings. No commentary, no markdown.`,
  )

  sections.push(
    `# Language\nRegardless of the language of these instructions, always write the new prompts in the same language as the prompts the writer provides.`,
  )

  return sections.join('\n\n')
}

// Tolerant of models that wrap the JSON in prose or fall back to a bulleted list.
function extractCandidates(content: string): string[] {
  const tryParse = (text: string): any => {
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }

  let parsed = tryParse(content)
  if (!parsed) {
    const objectMatch = content.match(/\{[\s\S]*\}/)
    const arrayMatch = content.match(/\[[\s\S]*\]/)
    parsed = (objectMatch && tryParse(objectMatch[0])) || (arrayMatch && tryParse(arrayMatch[0])) || null
  }

  let list: unknown = null
  if (Array.isArray(parsed)) list = parsed
  else if (parsed && Array.isArray(parsed.prompts)) list = parsed.prompts

  if (Array.isArray(list)) {
    return list.map(item => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
  }

  // Last resort: treat non-empty lines as candidates, stripping bullets/numbering.
  return content
    .split('\n')
    .map(line => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean)
}

mixRoutes.post('/', authMiddleware, async (c: any) => {
  const userId = getUserId(c)
  const worldId = paramInt(c, 'id')
  const world = findUserWorld(userId, worldId)
  if (!world) return c.json({ error: 'Not found' }, 404)

  const { promptIds } = await c.req.json()
  const ids = Array.isArray(promptIds)
    ? promptIds.filter((value: unknown): value is number => typeof value === 'number' && Number.isInteger(value))
    : []
  if (ids.length < 1) return c.json({ error: 'Select at least one prompt to mix' }, 400)

  // Mix always uses its own fixed model, not the user's story-generation choice.
  const modelOption = getModelById(MIX_MODEL_ID)
  if (!modelOption) return c.json({ error: 'Mix model is not configured' }, 500)

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return c.json({ error: 'OPENROUTER_API_KEY is not set on the server' }, 500)

  // Only prompts that actually belong to this user's world; ignore the rest.
  const rows = db
    .select({ text: prompts.text })
    .from(prompts)
    .where(and(eq(prompts.world_id, worldId), eq(prompts.user_id, userId), inArray(prompts.id, ids)))
    .all()
  const sourceTexts = rows.map(row => row.text.trim()).filter(Boolean)
  if (sourceTexts.length < 1) return c.json({ error: 'Select at least one prompt to mix' }, 400)

  const userInstruction =
    sourceTexts.length < 2
      ? `Here is my prompt. Spin it into ${CANDIDATE_COUNT} new ones, each inspired by it but taking a fresh direction:`
      : `Here are my ${sourceTexts.length} prompts. Mix them into ${CANDIDATE_COUNT} new ones, each combining elements from two or more of these:`

  const messages = [
    { role: 'system', content: buildMixSystemPrompt(world.body, sourceTexts.length) },
    {
      role: 'user',
      content: [
        userInstruction,
        '',
        sourceTexts.map((text, i) => `Prompt ${i + 1}: ${text}`).join('\n\n'),
      ].join('\n'),
    },
  ]

  const provider: Record<string, unknown> = { sort: 'latency', require_parameters: true }
  if (modelOption.preferredProviders.length > 0) provider.only = modelOption.preferredProviders
  if (BLACKLISTED_PROVIDERS.length > 0) provider.ignore = BLACKLISTED_PROVIDERS

  // A holder object so the assignments inside the slot closure survive TS's control-flow
  // narrowing (a plain `let` would be narrowed back to its initial value after the await).
  const out: { candidates: string[]; failure: { status: number; message: string } | null } = {
    candidates: [],
    failure: null,
  }

  // Same OpenRouter chat endpoint as story generation, so it shares the single-session
  // slot — overlapping the two would 429 the whole account.
  await withGenerationSlot(async () => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), MIX_TIMEOUT_MS)
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelOption.id,
          temperature: 1,
          reasoning: { effort: 'none' },
          stream: false,
          provider,
          response_format: { type: 'json_object' },
          messages,
        }),
      })

      if (!response.ok) {
        const raw = await response.text().catch(() => '')
        console.error('[mix error]', response.status, raw)
        out.failure = { status: 502, message: `OpenRouter ${response.status} ${response.statusText}`.trim() }
        return
      }

      const body = (await response.json()) as any
      const content = body?.choices?.[0]?.message?.content
      if (typeof content !== 'string' || !content.trim()) {
        out.failure = { status: 502, message: 'No candidates returned' }
        return
      }
      out.candidates = extractCandidates(content).slice(0, CANDIDATE_COUNT)
    } catch (error) {
      console.error('[mix error]', error)
      out.failure = { status: 502, message: 'Failed to reach the model' }
    } finally {
      clearTimeout(timeout)
    }
  })

  if (out.failure) return c.json({ error: out.failure.message }, out.failure.status as any)
  if (out.candidates.length === 0) return c.json({ error: 'No candidates returned' }, 502)
  return c.json({ candidates: out.candidates })
})

export default mixRoutes
