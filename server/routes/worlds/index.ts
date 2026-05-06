import { Hono } from 'hono'
import { eq, and, desc, inArray, sql } from 'drizzle-orm'
import { db, pieces, promptClusters, registers, worlds } from '../../db'
import { type Variables, authMiddleware } from '../../middleware'
import { findUserWorld, getUserId, paramInt } from '../../route-helpers'
import promptRoutes from './prompts'
import generateRoutes from './generate'
import clusterRoutes from './clusters'
import pieceRoutes from './pieces'

const worldRoutes = new Hono<{ Variables: Variables }>()

function originText(value: unknown) {
  if (typeof value !== 'string') return 'original'
  return value.trim() || 'original'
}

function registerIdValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : parseInt(String(value), 10)
  return Number.isFinite(n) ? n : null
}

function booleanInt(value: unknown) {
  return value === true || value === 1 || value === '1' ? 1 : 0
}

worldRoutes.get('/', authMiddleware, (c) => {
  const userId = getUserId(c)
  const worldRows = db
    .select({
      id: worlds.id,
      name: worlds.name,
      origin: worlds.origin,
      is_example: worlds.is_example,
      summary: worlds.summary,
      updated_at: worlds.updated_at,
      register_id: worlds.register_id,
      register_title: registers.title,
    })
    .from(worlds)
    .leftJoin(registers, eq(worlds.register_id, registers.id))
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
      const pieceStat = piecesByWorld.get(world.id)
      const clusterStat = clustersByWorld.get(world.id)
      return {
        ...world,
        is_example: Boolean(world.is_example),
        latest_piece_at: pieceStat?.latest_piece_at ?? null,
        prompt_cluster_count: Number(clusterStat?.prompt_cluster_count ?? 0),
        piece_count: Number(pieceStat?.piece_count ?? 0),
      }
    })
    .sort((a, b) => (b.latest_piece_at ?? b.updated_at) - (a.latest_piece_at ?? a.updated_at))

  return c.json(rows)
})

worldRoutes.post('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const body = await c.req.json()
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return c.json({ error: 'Name required' }, 400)
  const now = Date.now()
  const result = db.insert(worlds).values({
    user_id: userId,
    name,
    origin: originText(body.origin),
    is_example: booleanInt(body.is_example),
    summary: typeof body.summary === 'string' ? body.summary : '',
    body: typeof body.body === 'string' ? body.body : '',
    register_id: registerIdValue(body.register_id),
    created_at: now,
    updated_at: now,
  }).returning().get()
  return c.json({
    id: result.id,
    name: result.name,
    origin: result.origin,
    is_example: Boolean(result.is_example),
    summary: result.summary,
    body: result.body,
    register_id: result.register_id,
  })
})

worldRoutes.get('/:id', authMiddleware, (c) => {
  const world = findUserWorld(getUserId(c), paramInt(c, 'id'))
  if (!world) return c.json({ error: 'Not found' }, 404)
  return c.json({
    id: world.id,
    name: world.name,
    origin: world.origin,
    is_example: Boolean(world.is_example),
    summary: world.summary,
    body: world.body,
    register_id: world.register_id,
    updated_at: world.updated_at,
  })
})

worldRoutes.patch('/:id', authMiddleware, async (c) => {
  const id = paramInt(c, 'id')
  const world = findUserWorld(getUserId(c), id)
  if (!world) return c.json({ error: 'Not found' }, 404)

  const body = await c.req.json()
  const updates: Record<string, any> = { updated_at: Date.now() }
  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) return c.json({ error: 'Name required' }, 400)
    updates.name = name
  }
  if (body.origin !== undefined) updates.origin = originText(body.origin)
  if (body.is_example !== undefined) updates.is_example = booleanInt(body.is_example)
  if (body.summary !== undefined) updates.summary = body.summary
  if (body.body !== undefined) updates.body = body.body
  if (body.register_id !== undefined) updates.register_id = registerIdValue(body.register_id)

  db.update(worlds).set(updates).where(eq(worlds.id, id)).run()
  return c.json({ ok: true })
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
