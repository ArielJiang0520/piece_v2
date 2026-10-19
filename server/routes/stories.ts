import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { db, stories, scenes } from '../db'
import { type Variables, authMiddleware } from '../middleware'
import { getUserId, isValidModelId, paramInt } from '../route-helpers'
import { parseStructure, serializeStructure } from '../../src/pages/worlds/shared/storyStructure'

const storyRoutes = new Hono<{ Variables: Variables }>()

const STORY_SELECT = {
  id: stories.id,
  scene_id: stories.scene_id,
  scene_updated_at: scenes.updated_at,
  body: stories.body,
  structure: stories.structure,
  model: stories.model,
  provider: stories.provider,
  created_at: stories.created_at,
  updated_at: stories.updated_at,
} as const

function findOwnStory(userId: number, id: number) {
  return db
    .select(STORY_SELECT)
    .from(stories)
    .innerJoin(scenes, eq(stories.scene_id, scenes.id))
    .where(and(eq(stories.id, id), eq(stories.user_id, userId)))
    .get()
}

// Outdated: the scene's instruction changed after the story was made. It can still be read, not resumed.
function storyResponse({ scene_updated_at, ...story }: NonNullable<ReturnType<typeof findOwnStory>>) {
  return { ...story, outdated: scene_updated_at > story.created_at, structure: parseStructure(story.structure, story.body) }
}

storyRoutes.get('/:id', authMiddleware, (c) => {
  const story = findOwnStory(getUserId(c), paramInt(c, 'id'))
  if (!story) return c.json({ error: 'Not found' }, 404)
  return c.json(storyResponse(story))
})

// Overwrite a story in place — used when a saved story is resumed, continued, and
// re-saved. Same story (created_at preserved), just a longer body. An outdated story can't be
// resumed: it would continue toward a scene it was never written from.
storyRoutes.patch('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = paramInt(c, 'id')
  const existing = findOwnStory(userId, id)
  if (!existing) return c.json({ error: 'Not found' }, 404)
  // For now an outdated story can be resumed too.
  // if (existing.scene_updated_at > existing.created_at) {
  //   return c.json({ error: 'This story is outdated: its scene has changed since' }, 409)
  // }

  const body = await c.req.json()
  const storyBody = typeof body.body === 'string' ? body.body : ''
  if (!storyBody.trim()) return c.json({ error: 'Story body required' }, 400)

  // Action history is validated against the new body; a mismatch (or absent payload) clears
  // any prior structure so the stored decomposition never disagrees with the text.
  const structure = parseStructure(body.structure, storyBody)

  const updates: { body: string; structure: string | null; updated_at: number; model?: string; provider?: string | null } = {
    body: storyBody,
    structure: structure ? serializeStructure(structure) : null,
    updated_at: Date.now(),
  }
  if (body.model !== undefined) {
    if (!isValidModelId(body.model)) return c.json({ error: 'Invalid model' }, 400)
    updates.model = body.model
  }
  if (body.provider !== undefined) {
    const providerRaw = typeof body.provider === 'string' ? body.provider.trim() : ''
    updates.provider = providerRaw ? providerRaw : null
  }

  const updated = db
    .update(stories)
    .set(updates)
    .where(and(eq(stories.id, id), eq(stories.user_id, userId)))
    .returning({ id: stories.id })
    .get()
  if (!updated) return c.json({ error: 'Not found' }, 404)

  const story = findOwnStory(userId, id)
  if (!story) return c.json({ error: 'Not found' }, 404)
  return c.json(storyResponse(story))
})

export default storyRoutes
