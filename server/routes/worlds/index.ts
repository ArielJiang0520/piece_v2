import { Hono } from 'hono'
import { eq, and, desc, inArray, ne, sql } from 'drizzle-orm'
import { db, pieces, promptClusters, prompts, worldVersions, worlds } from '../../db'
import { type Variables, authMiddleware } from '../../middleware'
import { findUserWorld, findUserWorldId, getUserId, paramInt } from '../../route-helpers'
import additionRoutes from './additions'
import promptRoutes from './prompts'
import generateRoutes from './generate'
import clusterRoutes from './clusters'
import pieceRoutes from './pieces'
import similarRoutes from './similar'
import reworkRoutes from './rework'
import ideasRoutes from './ideas'
import tasteRoutes from './taste'
import chatRoutes from './chat'

const worldRoutes = new Hono<{ Variables: Variables }>()

// Version numbers are stable: each new version takes the highest number this
// world has ever used +1, so deleting a version never renumbers the others.
function nextVersionNumber(worldId: number) {
  const row = db
    .select({ max: sql<number | null>`MAX(${worldVersions.version_number})` })
    .from(worldVersions)
    .where(eq(worldVersions.world_id, worldId))
    .get()
  return (row?.max ?? 0) + 1
}

function bodySummary(value: string) {
  return value
    .trim()
    .replace(/\r\n?/g, '\n')
    .replace(/\n[ \t]*\n+/g, '\n')
    .split('\n')
    .slice(0, 3)
    .join('\n')
}

worldRoutes.get('/', authMiddleware, (c) => {
  const userId = getUserId(c)
  const worldRows = db
    .select({
      id: worlds.id,
      name: worlds.name,
      is_example: worlds.is_example,
      body: worlds.body,
      updated_at: worlds.updated_at,
    })
    .from(worlds)
    .where(eq(worlds.user_id, userId))
    .orderBy(desc(worlds.updated_at))
    .all()

  const worldIds = worldRows.map(world => world.id)
  if (worldIds.length === 0) return c.json([])

  // Both counts are for the world's checked-out version only, so a card never promises prompts or
  // pieces that opening the world won't show. A piece reaches its version the long way — through
  // its prompt's cluster — because that is the only place a version is recorded.
  const currentVersion = eq(promptClusters.world_version_id, worlds.current_version_id)
  const pieceStats = db
    .select({
      world_id: pieces.world_id,
      piece_count: sql<number>`count(*)`,
      latest_piece_at: sql<number | null>`max(${pieces.updated_at})`,
    })
    .from(pieces)
    .innerJoin(prompts, eq(prompts.id, pieces.prompt_id))
    .innerJoin(promptClusters, eq(promptClusters.id, prompts.cluster_id))
    .innerJoin(worlds, eq(worlds.id, pieces.world_id))
    .where(and(eq(pieces.user_id, userId), inArray(pieces.world_id, worldIds), currentVersion))
    .groupBy(pieces.world_id)
    .all()
  const clusterStats = db
    .select({
      world_id: promptClusters.world_id,
      prompt_cluster_count: sql<number>`count(*)`,
    })
    .from(promptClusters)
    .innerJoin(worlds, eq(worlds.id, promptClusters.world_id))
    .where(and(eq(promptClusters.user_id, userId), inArray(promptClusters.world_id, worldIds), currentVersion))
    .groupBy(promptClusters.world_id)
    .all()

  const piecesByWorld = new Map(pieceStats.map(stat => [stat.world_id, stat]))
  const clustersByWorld = new Map(clusterStats.map(stat => [stat.world_id, stat]))
  const rows = worldRows
    .map(world => {
      const { body, ...worldFields } = world
      const pieceStat = piecesByWorld.get(world.id)
      const clusterStat = clustersByWorld.get(world.id)
      return {
        ...worldFields,
        is_example: Boolean(world.is_example),
        body_summary: bodySummary(body),
        latest_piece_at: pieceStat?.latest_piece_at ?? null,
        prompt_cluster_count: Number(clusterStat?.prompt_cluster_count ?? 0),
        piece_count: Number(pieceStat?.piece_count ?? 0),
      }
    })
    .sort((a, b) => Math.max(b.latest_piece_at ?? 0, b.updated_at) - Math.max(a.latest_piece_at ?? 0, a.updated_at))

  return c.json(rows)
})

worldRoutes.post('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const body = await c.req.json()
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return c.json({ error: 'Name required' }, 400)
  const now = Date.now()
  const worldBody = typeof body.body === 'string' ? body.body : ''
  const result = db.transaction(tx => {
    const world = tx.insert(worlds).values({
      user_id: userId,
      name,
      is_example: 0,
      body: worldBody,
      created_at: now,
      updated_at: now,
    }).returning().get()

    const version = tx.insert(worldVersions).values({
      world_id: world.id,
      body: world.body,
      version_number: 1,
      created_at: now,
    }).returning({ id: worldVersions.id }).get()

    tx.update(worlds)
      .set({ current_version_id: version.id })
      .where(eq(worlds.id, world.id))
      .run()

    return world
  })

  return c.json({
    id: result.id,
    name: result.name,
    is_example: Boolean(result.is_example),
    body: result.body,
    updated_at: result.updated_at,
  })
})

worldRoutes.get('/:id/versions', authMiddleware, (c) => {
  const id = paramInt(c, 'id')
  const world = findUserWorldId(getUserId(c), id)
  if (!world) return c.json({ error: 'Not found' }, 404)

  const rows = db
    .select({
      id: worldVersions.id,
      name: worldVersions.name,
      number: worldVersions.version_number,
      created_at: worldVersions.created_at,
    })
    .from(worldVersions)
    .where(eq(worldVersions.world_id, id))
    .orderBy(desc(worldVersions.created_at), desc(worldVersions.id))
    .all()

  return c.json(rows)
})

// Switch which version is checked out (like `git switch`): move the HEAD pointer and
// mirror that version's body onto the world. No copy, nothing is lost.
worldRoutes.post('/:id/versions/:versionId/switch', authMiddleware, (c) => {
  const id = paramInt(c, 'id')
  const world = findUserWorld(getUserId(c), id)
  if (!world) return c.json({ error: 'Not found' }, 404)

  const targetVersionId = paramInt(c, 'versionId')
  const targetVersion = db
    .select({
      id: worldVersions.id,
      body: worldVersions.body,
    })
    .from(worldVersions)
    .where(and(eq(worldVersions.world_id, id), eq(worldVersions.id, targetVersionId)))
    .get()

  if (!targetVersion) return c.json({ error: 'Not found' }, 404)
  if (world.current_version_id === targetVersion.id) {
    return c.json({ ok: true, changed: false })
  }

  const now = Date.now()
  db.transaction(tx => {
    tx.update(worlds)
      .set({ body: targetVersion.body, current_version_id: targetVersion.id, updated_at: now })
      .where(eq(worlds.id, id))
      .run()
  })

  return c.json({ ok: true, changed: true })
})

worldRoutes.post('/:id/versions', authMiddleware, async (c) => {
  const id = paramInt(c, 'id')
  const world = findUserWorld(getUserId(c), id)
  if (!world) return c.json({ error: 'Not found' }, 404)

  const payload = await c.req.json()
  const name = typeof payload.name === 'string' ? payload.name.trim() : world.name
  if (!name) return c.json({ error: 'Name required' }, 400)
  const nextBody = typeof payload.body === 'string' ? payload.body : world.body
  const rawVersionName = typeof payload.version_name === 'string' ? payload.version_name.trim() : ''
  const versionName = rawVersionName.length > 0 ? rawVersionName : null

  const now = Date.now()
  const created = db.transaction(tx => {
    const version = tx.insert(worldVersions).values({
      world_id: id,
      body: nextBody,
      name: versionName,
      version_number: nextVersionNumber(id),
      created_at: now,
    }).returning({ id: worldVersions.id }).get()
    // The new version becomes the checked-out one; the previous version stays frozen.
    tx.update(worlds)
      .set({ name, body: nextBody, current_version_id: version.id, updated_at: now })
      .where(eq(worlds.id, id))
      .run()
    return version
  })

  return c.json({ ok: true, version_id: created.id })
})

// Delete a version. Deleting the checked-out version first moves HEAD to the most
// recent remaining one and mirrors its body onto the world. Only the last remaining
// version can't be deleted — a world always has one.
worldRoutes.delete('/:id/versions/:versionId', authMiddleware, (c) => {
  const id = paramInt(c, 'id')
  const world = findUserWorld(getUserId(c), id)
  if (!world) return c.json({ error: 'Not found' }, 404)

  const targetVersionId = paramInt(c, 'versionId')
  const targetVersion = db
    .select({ id: worldVersions.id })
    .from(worldVersions)
    .where(and(eq(worldVersions.world_id, id), eq(worldVersions.id, targetVersionId)))
    .get()
  if (!targetVersion) return c.json({ error: 'Not found' }, 404)

  const remaining = db
    .select({ count: sql<number>`count(*)` })
    .from(worldVersions)
    .where(eq(worldVersions.world_id, id))
    .get()
  if ((remaining?.count ?? 0) <= 1) {
    return c.json({ error: 'Cannot delete the last version' }, 400)
  }

  const fallbackVersion = world.current_version_id === targetVersion.id
    ? db
        .select({ id: worldVersions.id, body: worldVersions.body })
        .from(worldVersions)
        .where(and(eq(worldVersions.world_id, id), ne(worldVersions.id, targetVersion.id)))
        .orderBy(desc(worldVersions.created_at), desc(worldVersions.id))
        .limit(1)
        .get()
    : null

  db.transaction(tx => {
    if (fallbackVersion) {
      tx.update(worlds)
        .set({ body: fallbackVersion.body, current_version_id: fallbackVersion.id, updated_at: Date.now() })
        .where(eq(worlds.id, id))
        .run()
    }
    tx.delete(worldVersions)
      .where(and(eq(worldVersions.world_id, id), eq(worldVersions.id, targetVersionId)))
      .run()
  })

  return c.json({ ok: true })
})

worldRoutes.get('/:id', authMiddleware, (c) => {
  const world = findUserWorld(getUserId(c), paramInt(c, 'id'))
  if (!world) return c.json({ error: 'Not found' }, 404)
  const currentVersion = world.current_version_id != null
    ? db
        .select({ name: worldVersions.name })
        .from(worldVersions)
        .where(and(eq(worldVersions.world_id, world.id), eq(worldVersions.id, world.current_version_id)))
        .get()
    : null
  return c.json({
    id: world.id,
    name: world.name,
    is_example: Boolean(world.is_example),
    body: world.body,
    current_version_id: world.current_version_id,
    current_version_name: currentVersion?.name ?? null,
    updated_at: world.updated_at,
  })
})

worldRoutes.patch('/:id', authMiddleware, async (c) => {
  const id = paramInt(c, 'id')
  const world = findUserWorld(getUserId(c), id)
  if (!world) return c.json({ error: 'Not found' }, 404)

  const body = await c.req.json()
  let nextName = world.name
  let nextBody = world.body

  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) return c.json({ error: 'Name required' }, 400)
    nextName = name
  }
  if (body.body !== undefined) nextBody = typeof body.body === 'string' ? body.body : ''

  // The version name applies to the checked-out version. An empty string clears it.
  const currentVersion = world.current_version_id != null
    ? db
        .select({ id: worldVersions.id, name: worldVersions.name })
        .from(worldVersions)
        .where(and(eq(worldVersions.world_id, id), eq(worldVersions.id, world.current_version_id)))
        .get()
    : null
  const versionNameProvided = body.version_name !== undefined
  const nextVersionName = versionNameProvided
    ? (typeof body.version_name === 'string' && body.version_name.trim().length > 0 ? body.version_name.trim() : null)
    : (currentVersion?.name ?? null)

  const nameChanged = nextName !== world.name
  const bodyChanged = nextBody !== world.body
  const versionNameChanged = versionNameProvided && !!currentVersion && nextVersionName !== currentVersion.name

  if (!nameChanged && !bodyChanged && !versionNameChanged) {
    return c.json({ ok: true, changed: false })
  }

  const now = Date.now()
  db.transaction(tx => {
    tx.update(worlds)
      .set({ name: nextName, body: nextBody, updated_at: now })
      .where(eq(worlds.id, id))
      .run()
    if (bodyChanged || versionNameChanged) {
      // Edit the checked-out version in place; new versions come only from
      // POST /:id/versions, and switching moves worlds.current_version_id.
      if (currentVersion) {
        tx.update(worldVersions)
          .set({ body: nextBody, name: nextVersionName })
          .where(eq(worldVersions.id, currentVersion.id))
          .run()
      } else {
        const inserted = tx.insert(worldVersions).values({
          world_id: id,
          body: nextBody,
          name: nextVersionName,
          version_number: nextVersionNumber(id),
          created_at: now,
        }).returning({ id: worldVersions.id }).get()
        tx.update(worlds)
          .set({ current_version_id: inserted.id })
          .where(eq(worlds.id, id))
          .run()
      }
    }
  })

  return c.json({ ok: true, changed: true })
})

worldRoutes.delete('/:id', authMiddleware, (c) => {
  const id = paramInt(c, 'id')
  const world = findUserWorld(getUserId(c), id)
  if (!world) return c.json({ error: 'Not found' }, 404)
  db.delete(worlds).where(eq(worlds.id, id)).run()
  return c.json({ ok: true })
})

worldRoutes.route('/:id/additions', additionRoutes)
worldRoutes.route('/:id/prompts', promptRoutes)
worldRoutes.route('/:id/clusters', clusterRoutes)
worldRoutes.route('/:id/generate', generateRoutes)
worldRoutes.route('/:id/pieces', pieceRoutes)
worldRoutes.route('/:id/similar', similarRoutes)
worldRoutes.route('/:id/rework', reworkRoutes)
worldRoutes.route('/:id/ideas', ideasRoutes)
worldRoutes.route('/:id/taste', tasteRoutes)
worldRoutes.route('/:id/chat', chatRoutes)

export default worldRoutes
