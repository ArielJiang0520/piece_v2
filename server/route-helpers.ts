import { and, eq, or } from 'drizzle-orm'
import type { Context } from 'hono'
import { MODELS, type ModelOption } from '../src/preferences/generationModel'
import { db, scenes, worlds } from './db'

export function getUserId(c: Context): number {
  return c.get('userId') as number
}

export function paramInt(c: Context, name: string): number {
  return parseInt(c.req.param(name) ?? '', 10)
}

export function pagination(c: Context, fallbackLimit = 20) {
  const page = Math.max(1, parseInt(c.req.query('page') || '1') || 1)
  const limit = Math.min(50, Math.max(1, parseInt(c.req.query('limit') || String(fallbackLimit)) || fallbackLimit))
  return { page, limit, offset: (page - 1) * limit }
}

export function findUserWorld(userId: number, worldId: number) {
  return db
    .select()
    .from(worlds)
    .where(and(eq(worlds.id, worldId), eq(worlds.user_id, userId)))
    .get()
}

// A world this user may read and play: anyone's published world, or their own in any state.
export function findVisibleWorld(userId: number, worldId: number) {
  return db
    .select()
    .from(worlds)
    .where(and(eq(worlds.id, worldId), or(eq(worlds.published, 1), eq(worlds.user_id, userId))))
    .get()
}

// One of the author's scenes on a world this user can see — every scene row is the author's.
export function findWorldScene(userId: number, worldId: number, sceneId: number) {
  const world = findVisibleWorld(userId, worldId)
  if (!world) return null
  const scene = db
    .select()
    .from(scenes)
    .where(and(eq(scenes.id, sceneId), eq(scenes.world_id, worldId)))
    .get()
  if (!scene) return null
  return { world, scene }
}

const MODELS_BY_ID = new Map<string, ModelOption>(MODELS.map(model => [model.id, model]))

export function getModelById(id: unknown): ModelOption | undefined {
  return typeof id === 'string' ? MODELS_BY_ID.get(id) : undefined
}

export function isValidModelId(id: unknown): id is string {
  return typeof id === 'string' && MODELS_BY_ID.has(id)
}
