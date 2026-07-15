import { Hono } from 'hono'
import { and, desc, eq } from 'drizzle-orm'
import { db, pieces, tasteLikes } from '../db'
import { type Variables, authMiddleware } from '../middleware'
import { findUserWorldId, getUserId, paramInt } from '../route-helpers'
import { distillTasteProfile, getProfileForUser, maybeDistillAfterLike, updateStatement } from '../taste-profile'

const tasteRoutes = new Hono<{ Variables: Variables }>()

const MAX_SNIPPET_CHARS = 4000
const MAX_CONTEXT_CHARS = 8000
const MAX_REASONS_CHARS = 600

// Record a liked paragraph. The world/piece are soft-validated for ownership — a bad or
// foreign id is dropped (piece_id → null) rather than 400, mirroring pieces.ts, so a like
// never fails over a stale reference. After saving, a background distill may fire.
tasteRoutes.post('/likes', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const body = await c.req.json().catch(() => ({}))

  const worldId = Number(body.worldId)
  if (!Number.isInteger(worldId) || !findUserWorldId(userId, worldId)) {
    return c.json({ error: 'Valid worldId required' }, 400)
  }

  const snippet = typeof body.snippet === 'string' ? body.snippet.trim().slice(0, MAX_SNIPPET_CHARS) : ''
  if (!snippet) return c.json({ error: 'Snippet required' }, 400)

  // The surrounding paragraphs, kept for the distiller. Fall back to the snippet alone when
  // the client didn't send a window (or sent one narrower than the paragraph itself).
  const contextRaw = typeof body.context === 'string' ? body.context.trim().slice(0, MAX_CONTEXT_CHARS) : ''
  const context = contextRaw.length >= snippet.length ? contextRaw : snippet

  let pieceId: number | null = null
  if (body.pieceId !== undefined && body.pieceId !== null) {
    const candidate = Number(body.pieceId)
    if (Number.isInteger(candidate) && candidate >= 1) {
      const owned = db
        .select({ id: pieces.id })
        .from(pieces)
        .where(and(eq(pieces.id, candidate), eq(pieces.world_id, worldId), eq(pieces.user_id, userId)))
        .get()
      if (owned) pieceId = owned.id
    }
  }

  // The reader's single free-form "why" — the quick-pick chips and any typed note are
  // already folded into one string on the client. Just text; no structured tags here.
  const reasons = typeof body.reasons === 'string' ? body.reasons.trim().slice(0, MAX_REASONS_CHARS) : ''

  const like = db.insert(tasteLikes).values({
    user_id: userId,
    world_id: worldId,
    piece_id: pieceId,
    snippet,
    context,
    reasons: reasons || null,
    created_at: Date.now(),
  }).returning({ id: tasteLikes.id }).get()

  maybeDistillAfterLike(userId)

  return c.json({ id: like.id })
})

// All of the user's likes, newest first (the "evidence" list on the profile screen). An
// optional ?pieceId= filters to one piece so the reader can see which paragraphs are liked.
tasteRoutes.get('/likes', authMiddleware, (c) => {
  const userId = getUserId(c)
  const pieceIdParam = c.req.query('pieceId')

  const base = db
    .select({
      id: tasteLikes.id,
      world_id: tasteLikes.world_id,
      piece_id: tasteLikes.piece_id,
      snippet: tasteLikes.snippet,
      reasons: tasteLikes.reasons,
      created_at: tasteLikes.created_at,
    })
    .from(tasteLikes)

  const rows = pieceIdParam !== undefined && Number.isInteger(Number(pieceIdParam))
    ? base.where(and(eq(tasteLikes.user_id, userId), eq(tasteLikes.piece_id, Number(pieceIdParam)))).orderBy(desc(tasteLikes.created_at)).all()
    : base.where(eq(tasteLikes.user_id, userId)).orderBy(desc(tasteLikes.created_at)).all()

  return c.json(rows)
})

tasteRoutes.delete('/likes/:id', authMiddleware, (c) => {
  const userId = getUserId(c)
  const id = paramInt(c, 'id')
  db.delete(tasteLikes).where(and(eq(tasteLikes.id, id), eq(tasteLikes.user_id, userId))).run()
  return c.json({ ok: true })
})

tasteRoutes.get('/profile', authMiddleware, (c) => {
  return c.json(getProfileForUser(getUserId(c)))
})

// Toggle a single distilled statement on/off, or delete it — the reader's veto over the
// auto-generalized profile.
tasteRoutes.patch('/profile/statements/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const statementId = c.req.param('id')
  if (!statementId) return c.json({ error: 'Not found' }, 404)
  const body = await c.req.json().catch(() => ({}))
  const change: { enabled?: boolean; deleted?: boolean } = {}
  if (typeof body.enabled === 'boolean') change.enabled = body.enabled
  if (body.deleted === true) change.deleted = true

  const statements = updateStatement(userId, statementId, change)
  if (statements === null) return c.json({ error: 'Not found' }, 404)
  return c.json({ statements })
})

// Manual re-distill (awaited): rebuild the profile from all current likes now.
tasteRoutes.post('/profile/refresh', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const statements = await distillTasteProfile(userId)
  if (statements === null) return c.json({ error: 'Could not refresh profile' }, 502)
  return c.json({ statements })
})

export default tasteRoutes
