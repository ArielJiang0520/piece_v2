import { Hono } from 'hono'
import { eq, and, desc, inArray, sql } from 'drizzle-orm'
import { db, pieces, promptClusters, worldVersions, worlds } from '../../db'
import { type Variables, authMiddleware } from '../../middleware'
import { findUserWorld, findUserWorldId, getUserId, paramInt } from '../../route-helpers'
import promptRoutes from './prompts'
import generateRoutes from './generate'
import clusterRoutes from './clusters'
import pieceRoutes from './pieces'

const worldRoutes = new Hono<{ Variables: Variables }>()

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

  const pieceStats = db
    .select({
      world_id: pieces.world_id,
      piece_count: sql<number>`count(*)`,
      latest_piece_at: sql<number | null>`max(${pieces.created_at})`,
    })
    .from(pieces)
    .where(and(eq(pieces.user_id, userId), inArray(pieces.world_id, worldIds)))
    .groupBy(pieces.world_id)
    .all()
  const clusterStats = db
    .select({
      world_id: promptClusters.world_id,
      prompt_cluster_count: sql<number>`count(*)`,
    })
    .from(promptClusters)
    .where(and(eq(promptClusters.user_id, userId), inArray(promptClusters.world_id, worldIds)))
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

    tx.insert(worldVersions).values({
      world_id: world.id,
      name: world.name,
      body: world.body,
      created_at: now,
    }).run()

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
      created_at: worldVersions.created_at,
    })
    .from(worldVersions)
    .where(eq(worldVersions.world_id, id))
    .orderBy(desc(worldVersions.created_at))
    .all()

  return c.json(rows)
})

worldRoutes.get('/:id/versions/:versionId', authMiddleware, (c) => {
  const id = paramInt(c, 'id')
  const world = findUserWorldId(getUserId(c), id)
  if (!world) return c.json({ error: 'Not found' }, 404)

  const version = db
    .select({
      id: worldVersions.id,
      name: worldVersions.name,
      body: worldVersions.body,
      created_at: worldVersions.created_at,
    })
    .from(worldVersions)
    .where(and(eq(worldVersions.world_id, id), eq(worldVersions.id, paramInt(c, 'versionId'))))
    .get()

  if (!version) return c.json({ error: 'Not found' }, 404)
  return c.json(version)
})

worldRoutes.get('/:id', authMiddleware, (c) => {
  const world = findUserWorld(getUserId(c), paramInt(c, 'id'))
  if (!world) return c.json({ error: 'Not found' }, 404)
  return c.json({
    id: world.id,
    name: world.name,
    is_example: Boolean(world.is_example),
    body: world.body,
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

  if (nextName === world.name && nextBody === world.body) {
    return c.json({ ok: true, changed: false })
  }

  const now = Date.now()
  db.transaction(tx => {
    tx.update(worlds)
      .set({ name: nextName, body: nextBody, updated_at: now })
      .where(eq(worlds.id, id))
      .run()
    tx.insert(worldVersions).values({
      world_id: id,
      name: nextName,
      body: nextBody,
      created_at: now,
    }).run()
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

worldRoutes.route('/:id/prompts', promptRoutes)
worldRoutes.route('/:id/clusters', clusterRoutes)
worldRoutes.route('/:id/generate', generateRoutes)
worldRoutes.route('/:id/pieces', pieceRoutes)

export default worldRoutes
