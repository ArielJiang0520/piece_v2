import { Hono } from 'hono'
import type { Context, Next } from 'hono'
import { and, asc, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm'
import { db, modelUsage, promptClusters, prompts, users, worlds } from '../db'
import { type Variables, authMiddleware } from '../middleware'
import { getUserId, paramInt } from '../route-helpers'

const adminRoutes = new Hono<{ Variables: Variables }>()

function adminUsernames() {
  const raw = process.env.ADMIN_USERNAME ?? process.env.ADMIN_USERNAMES ?? process.env.admin_username ?? ''
  return new Set(raw.split(',').map(name => name.trim()).filter(Boolean))
}

async function requireAdmin(c: Context, next: Next) {
  const allowed = adminUsernames()
  if (allowed.size === 0) return c.json({ error: 'Admin access is not configured' }, 403)

  const user = db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, getUserId(c)))
    .get()

  if (!user || !allowed.has(user.username)) return c.json({ error: 'Forbidden' }, 403)
  await next()
}

function padMonthPart(value: number) {
  return String(value).padStart(2, '0')
}

function monthWindow(value: string | undefined) {
  const match = typeof value === 'string' ? /^(\d{4})-(\d{2})$/.exec(value) : null
  const now = new Date()
  let year = now.getFullYear()
  let monthIndex = now.getMonth()

  if (match) {
    const parsedYear = Number(match[1])
    const parsedMonth = Number(match[2])
    if (Number.isInteger(parsedYear) && parsedMonth >= 1 && parsedMonth <= 12) {
      year = parsedYear
      monthIndex = parsedMonth - 1
    }
  }

  const start = new Date(year, monthIndex, 1)
  const end = new Date(year, monthIndex + 1, 1)

  return {
    month: `${year}-${padMonthPart(monthIndex + 1)}`,
    start_at: start.getTime(),
    end_at: end.getTime(),
  }
}

adminRoutes.use('*', authMiddleware, requireAdmin)

adminRoutes.get('/users', (c) => {
  const rows = db
    .select({
      id: users.id,
      username: users.username,
      created_at: users.created_at,
    })
    .from(users)
    .orderBy(asc(users.id))
    .all()

  return c.json(rows)
})

adminRoutes.get('/users/:userId/worlds', (c) => {
  const targetUserId = paramInt(c, 'userId')
  if (!Number.isInteger(targetUserId) || targetUserId < 1) {
    return c.json({ error: 'Invalid user id' }, 400)
  }

  const targetUser = db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(eq(users.id, targetUserId))
    .get()
  if (!targetUser) return c.json({ error: 'User not found' }, 404)

  const worldRows = db
    .select({
      id: worlds.id,
      name: worlds.name,
      body: worlds.body,
      is_example: worlds.is_example,
      created_at: worlds.created_at,
      updated_at: worlds.updated_at,
    })
    .from(worlds)
    .where(eq(worlds.user_id, targetUserId))
    .orderBy(desc(worlds.updated_at), desc(worlds.id))
    .all()

  const worldIds = worldRows.map(world => world.id)
  if (worldIds.length === 0) {
    return c.json({ user: targetUser, worlds: [] })
  }

  const clusterRows = db
    .select({
      id: promptClusters.id,
      world_id: promptClusters.world_id,
      prompt_count: promptClusters.prompt_count,
      piece_count: promptClusters.piece_count,
      latest_prompt_id: promptClusters.latest_prompt_id,
      created_at: promptClusters.created_at,
      updated_at: promptClusters.updated_at,
    })
    .from(promptClusters)
    .where(and(eq(promptClusters.user_id, targetUserId), inArray(promptClusters.world_id, worldIds)))
    .orderBy(desc(promptClusters.updated_at), desc(promptClusters.id))
    .all()

  const promptRows = db
    .select({
      id: prompts.id,
      world_id: prompts.world_id,
      cluster_id: prompts.cluster_id,
      text: prompts.text,
      piece_count: prompts.piece_count,
      is_favorite: prompts.is_favorite,
      created_at: prompts.created_at,
      updated_at: prompts.updated_at,
    })
    .from(prompts)
    .where(and(eq(prompts.user_id, targetUserId), inArray(prompts.world_id, worldIds)))
    .orderBy(asc(prompts.created_at), asc(prompts.id))
    .all()

  const promptsByCluster = new Map<number, typeof promptRows>()
  const unclusteredPromptsByWorld = new Map<number, typeof promptRows>()
  for (const prompt of promptRows) {
    if (prompt.cluster_id === null) {
      const worldPrompts = unclusteredPromptsByWorld.get(prompt.world_id) ?? []
      worldPrompts.push(prompt)
      unclusteredPromptsByWorld.set(prompt.world_id, worldPrompts)
      continue
    }

    const clusterPrompts = promptsByCluster.get(prompt.cluster_id) ?? []
    clusterPrompts.push(prompt)
    promptsByCluster.set(prompt.cluster_id, clusterPrompts)
  }

  const clustersByWorld = new Map<number, Array<{
    id: number | null
    prompt_count: number
    piece_count: number
    latest_prompt_id: number | null
    created_at: number
    updated_at: number
    title: string
    prompts: Array<{
      id: number
      text: string
      is_favorite: boolean
      created_at: number
      updated_at: number
    }>
  }>>()

  for (const cluster of clusterRows) {
    const clusterPrompts = promptsByCluster.get(cluster.id) ?? []
    const title = clusterPrompts[clusterPrompts.length - 1]?.text ?? 'Untitled cluster'
    const worldClusters = clustersByWorld.get(cluster.world_id) ?? []
    worldClusters.push({
      id: cluster.id,
      prompt_count: cluster.prompt_count,
      piece_count: cluster.piece_count,
      latest_prompt_id: clusterPrompts[clusterPrompts.length - 1]?.id ?? cluster.latest_prompt_id,
      created_at: cluster.created_at,
      updated_at: cluster.updated_at,
      title,
      prompts: clusterPrompts.map(prompt => ({
        id: prompt.id,
        text: prompt.text,
        piece_count: prompt.piece_count,
        is_favorite: Boolean(prompt.is_favorite),
        created_at: prompt.created_at,
        updated_at: prompt.updated_at,
      })),
    })
    clustersByWorld.set(cluster.world_id, worldClusters)
  }

  for (const [worldId, worldPrompts] of unclusteredPromptsByWorld) {
    const worldClusters = clustersByWorld.get(worldId) ?? []
    worldClusters.push({
      id: null,
      prompt_count: worldPrompts.length,
      piece_count: worldPrompts.reduce((total, prompt) => total + prompt.piece_count, 0),
      latest_prompt_id: worldPrompts[worldPrompts.length - 1]?.id ?? null,
      created_at: worldPrompts[0]?.created_at ?? 0,
      updated_at: worldPrompts[worldPrompts.length - 1]?.updated_at ?? 0,
      title: 'Unclustered prompts',
      prompts: worldPrompts.map(prompt => ({
        id: prompt.id,
        text: prompt.text,
        piece_count: prompt.piece_count,
        is_favorite: Boolean(prompt.is_favorite),
        created_at: prompt.created_at,
        updated_at: prompt.updated_at,
      })),
    })
    clustersByWorld.set(worldId, worldClusters)
  }

  return c.json({
    user: targetUser,
    worlds: worldRows.map(world => ({
      ...world,
      is_example: Boolean(world.is_example),
      clusters: clustersByWorld.get(world.id) ?? [],
    })),
  })
})

adminRoutes.get('/users/:userId/usage', (c) => {
  const targetUserId = paramInt(c, 'userId')
  if (!Number.isInteger(targetUserId) || targetUserId < 1) {
    return c.json({ error: 'Invalid user id' }, 400)
  }

  const targetUser = db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(eq(users.id, targetUserId))
    .get()
  if (!targetUser) return c.json({ error: 'User not found' }, 404)

  const window = monthWindow(c.req.query('month'))
  const usageFilter = and(
    eq(modelUsage.user_id, targetUserId),
    gte(modelUsage.created_at, window.start_at),
    lt(modelUsage.created_at, window.end_at),
  )

  const total = db
    .select({
      request_count: sql<number>`count(*)`,
      prompt_tokens: sql<number>`coalesce(sum(${modelUsage.prompt_tokens}), 0)`,
      completion_tokens: sql<number>`coalesce(sum(${modelUsage.completion_tokens}), 0)`,
      total_tokens: sql<number>`coalesce(sum(${modelUsage.total_tokens}), 0)`,
      reasoning_tokens: sql<number>`coalesce(sum(${modelUsage.reasoning_tokens}), 0)`,
      cached_tokens: sql<number>`coalesce(sum(${modelUsage.cached_tokens}), 0)`,
      cache_write_tokens: sql<number>`coalesce(sum(${modelUsage.cache_write_tokens}), 0)`,
      cost_microcredits: sql<number>`coalesce(sum(${modelUsage.cost_microcredits}), 0)`,
    })
    .from(modelUsage)
    .where(usageFilter)
    .get()

  const modelName = sql<string>`coalesce(${modelUsage.resolved_model}, ${modelUsage.requested_model})`
  const models = db
    .select({
      model: modelName,
      request_count: sql<number>`count(*)`,
      prompt_tokens: sql<number>`coalesce(sum(${modelUsage.prompt_tokens}), 0)`,
      completion_tokens: sql<number>`coalesce(sum(${modelUsage.completion_tokens}), 0)`,
      total_tokens: sql<number>`coalesce(sum(${modelUsage.total_tokens}), 0)`,
      reasoning_tokens: sql<number>`coalesce(sum(${modelUsage.reasoning_tokens}), 0)`,
      cached_tokens: sql<number>`coalesce(sum(${modelUsage.cached_tokens}), 0)`,
      cache_write_tokens: sql<number>`coalesce(sum(${modelUsage.cache_write_tokens}), 0)`,
      cost_microcredits: sql<number>`coalesce(sum(${modelUsage.cost_microcredits}), 0)`,
    })
    .from(modelUsage)
    .where(usageFilter)
    .groupBy(modelName)
    .orderBy(
      desc(sql<number>`sum(${modelUsage.cost_microcredits})`),
      desc(sql<number>`sum(${modelUsage.total_tokens})`),
    )
    .all()

  return c.json({
    user: targetUser,
    window,
    total: total ?? {
      request_count: 0,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      reasoning_tokens: 0,
      cached_tokens: 0,
      cache_write_tokens: 0,
      cost_microcredits: 0,
    },
    models,
  })
})

export default adminRoutes
