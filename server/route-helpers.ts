import { and, eq } from 'drizzle-orm'
import type { Context } from 'hono'
import { MODELS, type ModelOption } from '../src/preferences/generationModel'
import { db, worlds } from './db'

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

export function findUserWorldId(userId: number, worldId: number) {
  return db
    .select({ id: worlds.id })
    .from(worlds)
    .where(and(eq(worlds.id, worldId), eq(worlds.user_id, userId)))
    .get()
}

// The world's checked-out version (HEAD). Null only for a missing world or a bug-state world
// with no versions — never a state the version-scoped features design around.
export function currentWorldVersionId(userId: number, worldId: number): number | null {
  return db
    .select({ id: worlds.current_version_id })
    .from(worlds)
    .where(and(eq(worlds.id, worldId), eq(worlds.user_id, userId)))
    .get()?.id ?? null
}

const MODELS_BY_ID = new Map<string, ModelOption>(MODELS.map(model => [model.id, model]))

export function getModelById(id: unknown): ModelOption | undefined {
  return typeof id === 'string' ? MODELS_BY_ID.get(id) : undefined
}

export function isValidModelId(id: unknown): id is string {
  return typeof id === 'string' && MODELS_BY_ID.has(id)
}
