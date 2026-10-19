import { Hono } from 'hono'
import { db, stories } from '../../db'
import { type Variables, authMiddleware } from '../../middleware'
import { findWorldScene, getUserId, isValidModelId, paramInt } from '../../route-helpers'
import { parseStructure, serializeStructure } from '../../../src/pages/worlds/shared/storyStructure'

const storyRoutes = new Hono<{ Variables: Variables }>()

// Save a generation as a story of one of the world's scenes. Stories are private to whoever saved
// them.
storyRoutes.post('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const body = await c.req.json()
  const found = findWorldScene(userId, paramInt(c, 'id'), Number(body.sceneId))
  if (!found) return c.json({ error: 'Scene not found' }, 404)

  const storyBody = typeof body.body === 'string' ? body.body : ''
  if (!storyBody.trim()) return c.json({ error: 'Story body required' }, 400)

  // Optional action history. Validated against the body; a mismatch is dropped (stored as
  // plain text) rather than rejected, so a save never fails over a bad structure payload.
  const structure = parseStructure(body.structure, storyBody)

  if (!isValidModelId(body.model)) return c.json({ error: 'Invalid model' }, 400)
  const providerRaw = typeof body.provider === 'string' ? body.provider.trim() : ''

  const now = Date.now()
  const story = db.insert(stories).values({
    user_id: userId,
    scene_id: found.scene.id,
    body: storyBody,
    structure: structure ? serializeStructure(structure) : null,
    model: body.model,
    provider: providerRaw || null,
    created_at: now,
    updated_at: now,
  }).returning({ id: stories.id }).get()

  return c.json({ sceneId: found.scene.id, storyId: story.id })
})

export default storyRoutes
