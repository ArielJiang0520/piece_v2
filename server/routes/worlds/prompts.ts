import { Hono } from 'hono'
import { eq, and, desc, sql } from 'drizzle-orm'
import { db, worlds, prompts, pieces } from '../../db'
import { type Variables, authMiddleware } from '../../middleware'
import { clusterPromptById, recomputePromptCluster } from '../../prompt-clustering'
import { MODELS, PROMPT_SUGGESTION_MODEL_ID } from '../../../src/config'

const promptRoutes = new Hono<{ Variables: Variables }>()
const modelsById = new Map(MODELS.map(model => [model.id, model]))

function pagination(c: any, fallbackLimit = 20) {
  const page = Math.max(1, parseInt(c.req.query('page') || '1') || 1)
  const limit = Math.min(50, Math.max(1, parseInt(c.req.query('limit') || String(fallbackLimit)) || fallbackLimit))
  return { page, limit, offset: (page - 1) * limit }
}

function requireWorld(userId: number, worldId: number) {
  return db
    .select()
    .from(worlds)
    .where(and(eq(worlds.id, worldId), eq(worlds.user_id, userId)))
    .get()
}

function suggestionInstruction(direction: string, previousPrompts: string[]) {
  const avoidSection = previousPrompts.length === 0
    ? ''
    : `\n\nDO NOT GENERATE THESE AGAIN\n${previousPrompts.join('\n')}`

  return `The system message above contains the world setting for a story. Generate 5 one-shot prompts a writer model will use to continue the story.

RULES
- Each prompt is a setup that fits naturally within the given world.
- You are a DIRECTOR, not the writer. Your job is to set up the scenario. Do NOT write the details or dialogues yourself. Just give directions.
- Aim for variety across the 5: different scenarios, situations, angles, vibes. Have fun with it.
- Match the language of the world setting. Chinese setting -> Chinese prompts. Japanese setting -> Japanese prompts. Etc.

OUTPUT
Output exactly 5 prompts, one per line. No numbering, no bullets, no labels, no blank lines between them, no commentary before or after. Just 5 lines, each line is one prompt.

USER DIRECTION (optional, may be empty):
${direction}${avoidSection}`
}

function parseSuggestionOutput(content: string) {
  return content
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
}

promptRoutes.post('/', authMiddleware, async (c: any) => {
  const userId = c.get('userId') as number
  const worldId = parseInt(c.req.param('id'))
  const world = requireWorld(userId, worldId)
  if (!world) return c.json({ error: 'Not found' }, 404)

  const body = await c.req.json()
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text) return c.json({ error: 'Prompt required' }, 400)

  const now = Date.now()
  const prompt = db.insert(prompts).values({
    user_id: userId,
    world_id: worldId,
    text,
    piece_count: 0,
    created_at: now,
    updated_at: now,
  }).returning().get()
  const clusterId = await clusterPromptById(prompt.id)

  return c.json({
    id: prompt.id,
    cluster_id: clusterId,
    text: prompt.text,
    piece_count: prompt.piece_count,
    created_at: prompt.created_at,
    updated_at: prompt.updated_at,
  })
})

promptRoutes.post('/suggestions', authMiddleware, async (c: any) => {
  const userId = c.get('userId') as number
  const worldId = parseInt(c.req.param('id'))
  const world = requireWorld(userId, worldId)
  if (!world) return c.json({ error: 'Not found' }, 404)

  const body = await c.req.json()
  const direction = typeof body.direction === 'string' ? body.direction.trim() : ''
  const previousPrompts = Array.isArray(body.previousPrompts)
    ? body.previousPrompts
      .filter((prompt: unknown): prompt is string => typeof prompt === 'string')
      .map((prompt: string) => prompt.trim())
      .filter(Boolean)
    : []

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return c.json({ error: 'OPENROUTER_API_KEY is not set on the server' }, 500)

  const modelOption = modelsById.get(PROMPT_SUGGESTION_MODEL_ID)
  if (!modelOption) return c.json({ error: 'Prompt suggestion model is not configured' }, 500)

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelOption.id,
      temperature: 1,
      reasoning: modelOption.reasoning,
      provider: { sort: 'throughput' },
      messages: [
        { role: 'system', content: [world.summary, world.body].filter(Boolean).join('\n\n') },
        { role: 'user', content: suggestionInstruction(direction, previousPrompts) },
      ],
    }),
  })

  if (!response.ok) {
    let message = `OpenRouter ${response.status} ${response.statusText}`
    try {
      const errBody = await response.json() as any
      if (errBody?.error?.message) message = errBody.error.message
      else if (typeof errBody?.error === 'string') message = errBody.error
    } catch {}
    return c.json({ error: message }, 502)
  }

  const result = await response.json() as any
  const content = result?.choices?.[0]?.message?.content
  const suggestions = typeof content === 'string' ? parseSuggestionOutput(content) : []

  if (suggestions.length !== 5) {
    return c.json({ error: 'Prompt suggestion model did not return 5 prompts' }, 502)
  }

  return c.json({ prompts: suggestions })
})

promptRoutes.get('/:promptId', authMiddleware, (c: any) => {
  const userId = c.get('userId') as number
  const worldId = parseInt(c.req.param('id'))
  const promptId = parseInt(c.req.param('promptId'))
  const world = requireWorld(userId, worldId)
  if (!world) return c.json({ error: 'Not found' }, 404)

  const prompt = db
    .select({
      id: prompts.id,
      text: prompts.text,
      piece_count: prompts.piece_count,
      created_at: prompts.created_at,
      updated_at: prompts.updated_at,
    })
    .from(prompts)
    .where(and(eq(prompts.id, promptId), eq(prompts.world_id, worldId), eq(prompts.user_id, userId)))
    .get()
  if (!prompt) return c.json({ error: 'Prompt not found' }, 404)

  const { page, limit, offset } = pagination(c)
  const rows = db
    .select({
      id: pieces.id,
      preview: sql<string>`substr(${pieces.body}, 1, 200)`,
      created_at: pieces.created_at,
    })
    .from(pieces)
    .where(and(eq(pieces.prompt_id, promptId), eq(pieces.world_id, worldId), eq(pieces.user_id, userId)))
    .orderBy(desc(pieces.created_at), desc(pieces.id))
    .limit(limit + 1)
    .offset(offset)
    .all()

  return c.json({
    prompt,
    pieces: rows.slice(0, limit),
    page,
    limit,
    hasMore: rows.length > limit,
  })
})

promptRoutes.delete('/:promptId', authMiddleware, (c: any) => {
  const userId = c.get('userId') as number
  const worldId = parseInt(c.req.param('id'))
  const promptId = parseInt(c.req.param('promptId'))
  const world = requireWorld(userId, worldId)
  if (!world) return c.json({ error: 'Not found' }, 404)

  const prompt = db
    .select({ id: prompts.id, cluster_id: prompts.cluster_id })
    .from(prompts)
    .where(and(eq(prompts.id, promptId), eq(prompts.world_id, worldId), eq(prompts.user_id, userId)))
    .get()
  if (!prompt) return c.json({ error: 'Prompt not found' }, 404)

  db.delete(prompts)
    .where(and(eq(prompts.id, promptId), eq(prompts.world_id, worldId), eq(prompts.user_id, userId)))
    .run()
  recomputePromptCluster(prompt.cluster_id)

  return c.json({ ok: true })
})

export default promptRoutes
