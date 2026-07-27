import { Hono } from 'hono'
import { and, desc, eq } from 'drizzle-orm'
import { db, pieces, tasteLikes } from '../../db'
import { type Variables, authMiddleware } from '../../middleware'
import { currentWorldVersionId, findUserWorldId, getUserId, paramInt } from '../../route-helpers'
import { distillTasteProfile, getProfileForWorld, maybeDistillAfterLike, versionLikes } from '../../taste-profile'

// Per-world taste routes, mounted under /:id/taste. The world id comes from the parent path;
// every handler scopes by (userId, worldId) so one world's likes/profile never touch another.
const tasteRoutes = new Hono<{ Variables: Variables }>()

// A like is stored as the reader sent it — the passage, its surrounding window, and their own
// words about it, none of them shortened. The one size limit is at the model call itself
// (llm-budget.ts), where it belongs.

// Record a liked paragraph in this world. The piece is soft-validated for ownership — a bad
// or foreign id is dropped (piece_id → null) rather than 400, mirroring pieces.ts, so a like
// never fails over a stale reference. After saving, a background distill may fire.
tasteRoutes.post('/likes', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const worldId = paramInt(c, 'id')
  if (!findUserWorldId(userId, worldId)) return c.json({ error: 'Not found' }, 404)

  const body = await c.req.json().catch(() => ({}))

  const snippet = typeof body.snippet === 'string' ? body.snippet.trim() : ''
  if (!snippet) return c.json({ error: 'Snippet required' }, 400)

  // The surrounding paragraphs, kept for the distiller. Fall back to the snippet alone when
  // the client didn't send a window (or sent one narrower than the paragraph itself).
  const contextRaw = typeof body.context === 'string' ? body.context.trim() : ''
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

  // The reader's optional free-form "why" — a raw feeling or half-sentence, or nothing at all.
  const reasons = typeof body.reasons === 'string' ? body.reasons.trim() : ''

  const like = db.insert(tasteLikes).values({
    user_id: userId,
    world_id: worldId,
    piece_id: pieceId,
    snippet,
    context,
    reasons: reasons || null,
    // Stamped with the version checked out when the like was recorded, the same way prompts are.
    world_version_id: currentWorldVersionId(userId, worldId),
    created_at: Date.now(),
  }).returning({ id: tasteLikes.id }).get()

  maybeDistillAfterLike(userId, worldId)

  return c.json({ id: like.id })
})

// This world VERSION's likes, newest first (the "evidence" list on the taste page). Scoped the
// same way the profile above it is, so the list always shows the likes that actually fed the
// profile being displayed — a version with no likes shows none, under a blank profile. An
// optional ?pieceId= narrows to one piece so the reader can see which paragraphs are liked.
tasteRoutes.get('/likes', authMiddleware, (c) => {
  const userId = getUserId(c)
  const worldId = paramInt(c, 'id')
  if (!findUserWorldId(userId, worldId)) return c.json({ error: 'Not found' }, 404)
  const pieceIdParam = c.req.query('pieceId')

  const versionId = currentWorldVersionId(userId, worldId)
  if (versionId == null) return c.json([])

  const conditions = [versionLikes(userId, worldId, versionId)]
  if (pieceIdParam !== undefined && Number.isInteger(Number(pieceIdParam))) {
    conditions.push(eq(tasteLikes.piece_id, Number(pieceIdParam)))
  }

  const rows = db
    .select({
      id: tasteLikes.id,
      world_id: tasteLikes.world_id,
      piece_id: tasteLikes.piece_id,
      snippet: tasteLikes.snippet,
      context: tasteLikes.context,
      reasons: tasteLikes.reasons,
      created_at: tasteLikes.created_at,
    })
    .from(tasteLikes)
    .where(and(...conditions))
    .orderBy(desc(tasteLikes.created_at))
    .all()

  return c.json(rows)
})

// Edit a like's free-form "why" in place. Only the reasons text is editable — the snippet is
// the actual liked passage and stays fixed. An empty string clears it back to null.
tasteRoutes.patch('/likes/:likeId', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const worldId = paramInt(c, 'id')
  if (!findUserWorldId(userId, worldId)) return c.json({ error: 'Not found' }, 404)
  const likeId = paramInt(c, 'likeId')

  const body = await c.req.json().catch(() => ({}))
  const reasons = typeof body.reasons === 'string' ? body.reasons.trim() : ''

  db.update(tasteLikes)
    .set({ reasons: reasons || null })
    .where(and(eq(tasteLikes.id, likeId), eq(tasteLikes.user_id, userId), eq(tasteLikes.world_id, worldId)))
    .run()
  return c.json({ ok: true })
})

tasteRoutes.delete('/likes/:likeId', authMiddleware, (c) => {
  const userId = getUserId(c)
  const worldId = paramInt(c, 'id')
  if (!findUserWorldId(userId, worldId)) return c.json({ error: 'Not found' }, 404)
  const likeId = paramInt(c, 'likeId')
  db.delete(tasteLikes)
    .where(and(eq(tasteLikes.id, likeId), eq(tasteLikes.user_id, userId), eq(tasteLikes.world_id, worldId)))
    .run()
  return c.json({ ok: true })
})

tasteRoutes.get('/profile', authMiddleware, (c) => {
  const userId = getUserId(c)
  const worldId = paramInt(c, 'id')
  if (!findUserWorldId(userId, worldId)) return c.json({ error: 'Not found' }, 404)
  return c.json(getProfileForWorld(userId, worldId))
})

// Manual re-distill (fire-and-forget): a distill can take a while — it queues behind any live
// story generation on the single OpenRouter slot, then runs — so we DON'T hold the HTTP request
// open for it. Holding it open is exactly what made a slow-but-successful rebuild look like a
// client "error" (socket hang up) even though the server finished and persisted it. Instead we
// kick it off in the background and let the client poll the profile (its `updatedAt` advances
// on completion). Deduped per world inside distillTasteProfile.
tasteRoutes.post('/profile/refresh', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const worldId = paramInt(c, 'id')
  if (!findUserWorldId(userId, worldId)) return c.json({ error: 'Not found' }, 404)
  // Which model distills the profile is pinned server-side (TASTE_MODEL_ID) — not the reader's
  // to pick, and never sent by the client.
  void distillTasteProfile(userId, worldId).catch(err =>
    console.warn(`[taste distill] manual refresh failed: ${err instanceof Error ? err.message : 'unknown error'}`))
  return c.json({ started: true }, 202)
})

export default tasteRoutes
