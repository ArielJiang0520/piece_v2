import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { db, worldAdditions } from '../../db'
import { type Variables, authMiddleware } from '../../middleware'
import { findUserWorld, getUserId, paramInt } from '../../route-helpers'
import { listAdditions } from '../../world-additions'

const additionRoutes = new Hono<{ Variables: Variables }>()

// Additions belong to the checked-out version, so every handler here works against
// world.current_version_id. Switching versions shows a different shelf; a new version starts
// with an empty one, and deleting a version takes its additions with it (FK cascade).
additionRoutes.get('/', authMiddleware, (c) => {
  const userId = getUserId(c)
  const worldId = paramInt(c, 'id')
  const world = findUserWorld(userId, worldId)
  if (!world) return c.json({ error: 'Not found' }, 404)

  return c.json(listAdditions(userId, worldId, world.current_version_id))
})

additionRoutes.post('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const worldId = paramInt(c, 'id')
  const world = findUserWorld(userId, worldId)
  if (!world) return c.json({ error: 'Not found' }, 404)
  if (world.current_version_id == null) return c.json({ error: 'World has no version' }, 400)

  const payload = await c.req.json()
  const name = typeof payload.name === 'string' ? payload.name.trim() : ''
  if (!name) return c.json({ error: 'Name required' }, 400)
  const body = typeof payload.body === 'string' ? payload.body : ''

  const now = Date.now()
  const created = db.insert(worldAdditions).values({
    user_id: userId,
    world_id: worldId,
    world_version_id: world.current_version_id,
    name,
    body,
    created_at: now,
    updated_at: now,
  }).returning().get()

  return c.json({
    id: created.id,
    name: created.name,
    body: created.body,
    created_at: created.created_at,
    updated_at: created.updated_at,
  })
})

additionRoutes.patch('/:additionId', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const worldId = paramInt(c, 'id')
  const world = findUserWorld(userId, worldId)
  if (!world) return c.json({ error: 'Not found' }, 404)

  const additionId = paramInt(c, 'additionId')
  const existing = findAddition(userId, worldId, world.current_version_id, additionId)
  if (!existing) return c.json({ error: 'Not found' }, 404)

  const payload = await c.req.json()
  let nextName = existing.name
  let nextBody = existing.body
  if (payload.name !== undefined) {
    const name = typeof payload.name === 'string' ? payload.name.trim() : ''
    if (!name) return c.json({ error: 'Name required' }, 400)
    nextName = name
  }
  if (payload.body !== undefined) nextBody = typeof payload.body === 'string' ? payload.body : ''

  if (nextName === existing.name && nextBody === existing.body) {
    return c.json({ ok: true, changed: false })
  }

  db.update(worldAdditions)
    .set({ name: nextName, body: nextBody, updated_at: Date.now() })
    .where(eq(worldAdditions.id, additionId))
    .run()

  return c.json({ ok: true, changed: true })
})

// Deleting leaves the stamp on any piece that used this addition pointing at nothing. That is
// deliberate and surfaced by the reading view, rather than rewritten away — the piece really was
// written with something that no longer exists.
additionRoutes.delete('/:additionId', authMiddleware, (c) => {
  const userId = getUserId(c)
  const worldId = paramInt(c, 'id')
  const world = findUserWorld(userId, worldId)
  if (!world) return c.json({ error: 'Not found' }, 404)

  const additionId = paramInt(c, 'additionId')
  const existing = findAddition(userId, worldId, world.current_version_id, additionId)
  if (!existing) return c.json({ error: 'Not found' }, 404)

  db.delete(worldAdditions).where(eq(worldAdditions.id, additionId)).run()
  return c.json({ ok: true })
})

function findAddition(userId: number, worldId: number, versionId: number | null, additionId: number) {
  if (versionId == null) return undefined
  return db
    .select({ id: worldAdditions.id, name: worldAdditions.name, body: worldAdditions.body })
    .from(worldAdditions)
    .where(and(
      eq(worldAdditions.id, additionId),
      eq(worldAdditions.user_id, userId),
      eq(worldAdditions.world_id, worldId),
      eq(worldAdditions.world_version_id, versionId),
    ))
    .get()
}

export default additionRoutes
