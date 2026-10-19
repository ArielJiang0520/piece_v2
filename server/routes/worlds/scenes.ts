import { Hono } from 'hono'
import { and, desc, eq, sql } from 'drizzle-orm'
import { collections, db, stories } from '../../db'
import { type Variables, authMiddleware } from '../../middleware'
import { findVisibleWorld, findWorldScene, getUserId, pagination, paramInt } from '../../route-helpers'
import { worldSceneTree } from '../../scene-lists'

const sceneRoutes = new Hono<{ Variables: Variables }>()

// The world's Scenes tab, the same for everyone, the author included: the author's collections in
// order, each with its scenes, then the scenes in no collection.
sceneRoutes.get('/', authMiddleware, (c) => {
  const world = findVisibleWorld(getUserId(c), paramInt(c, 'id'))
  if (!world) return c.json({ error: 'Not found' }, 404)
  return c.json(worldSceneTree(world.id, { includeEmpty: false }))
})

// A scene and this reader's saved stories of it (stories are always private). A story is outdated
// when the scene's instruction changed after it was made. The instruction itself is the model's
// only and never leaves the creator center.
sceneRoutes.get('/:sceneId', authMiddleware, (c) => {
  const userId = getUserId(c)
  const found = findWorldScene(userId, paramInt(c, 'id'), paramInt(c, 'sceneId'))
  if (!found) return c.json({ error: 'Not found' }, 404)
  const { scene } = found

  const collection = scene.collection_id == null ? null : db
    .select({ id: collections.id, name: collections.name })
    .from(collections)
    .where(eq(collections.id, scene.collection_id))
    .get() ?? null

  const { page, limit, offset } = pagination(c)
  const rows = db
    .select({ id: stories.id, created_at: stories.created_at, updated_at: stories.updated_at })
    .from(stories)
    .where(and(eq(stories.scene_id, scene.id), eq(stories.user_id, userId)))
    .orderBy(desc(stories.created_at), desc(stories.id))
    .limit(limit + 1)
    .offset(offset)
    .all()

  const storyCount = db
    .select({ count: sql<number>`count(*)` })
    .from(stories)
    .where(and(eq(stories.scene_id, scene.id), eq(stories.user_id, userId)))
    .get()?.count ?? 0

  return c.json({
    scene: {
      id: scene.id,
      description: scene.description,
      updated_at: scene.updated_at,
      collection,
      // This reader's saved stories of it — what numbers them.
      story_count: Number(storyCount),
    },
    stories: rows.slice(0, limit).map(row => ({ ...row, outdated: scene.updated_at > row.created_at })),
    page,
    limit,
    hasMore: rows.length > limit,
  })
})

export default sceneRoutes
