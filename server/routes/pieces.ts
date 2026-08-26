import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import { db, prompts, pieces, worlds } from '../db'
import { type Variables, authMiddleware } from '../middleware'
import { getUserId, isValidModelId, paramInt } from '../route-helpers'
import { parseStructure, serializeStructure } from '../../src/pages/worlds/shared/pieceStructure'
import { tasteApplies } from '../taste-profile'
import { parseAdditionIds } from '../world-additions'

const pieceRoutes = new Hono<{ Variables: Variables }>()

const PIECE_SELECT = {
  id: pieces.id,
  user_id: pieces.user_id,
  world_id: pieces.world_id,
  prompt_id: pieces.prompt_id,
  prompt: prompts.text,
  body: pieces.body,
  structure: pieces.structure,
  model: pieces.model,
  provider: pieces.provider,
  used_taste: pieces.used_taste,
  addition_ids: pieces.addition_ids,
  created_at: pieces.created_at,
  updated_at: pieces.updated_at,
} as const

// The stamp is written once, when the piece is first saved, and never rewritten — PATCH below
// leaves it alone. Resuming a piece continues it with the world text it was born with.
function pieceResponse(piece: { used_taste: number; addition_ids: string | null; structure: string | null; body: string }) {
  return {
    ...piece,
    used_taste: !!piece.used_taste,
    addition_ids: parseAdditionIds(piece.addition_ids),
    structure: parseStructure(piece.structure, piece.body),
  }
}

pieceRoutes.get('/:id', authMiddleware, (c) => {
  const userId = getUserId(c)
  const id = paramInt(c, 'id')
  const piece = db
    .select(PIECE_SELECT)
    .from(pieces)
    .innerJoin(prompts, eq(pieces.prompt_id, prompts.id))
    .where(and(eq(pieces.id, id), eq(pieces.user_id, userId)))
    .get()
  if (!piece) return c.json({ error: 'Not found' }, 404)
  return c.json(pieceResponse(piece))
})

// Overwrite a piece in place — used when a saved piece is resumed, continued, and
// re-saved. Same piece (created_at preserved), just a longer body.
pieceRoutes.patch('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = paramInt(c, 'id')

  const body = await c.req.json()
  const pieceBody = typeof body.body === 'string' ? body.body : ''
  if (!pieceBody.trim()) return c.json({ error: 'Piece body required' }, 400)

  // Action history is validated against the new body; a mismatch (or absent payload) clears
  // any prior structure so the stored decomposition never disagrees with the text.
  const structure = parseStructure(body.structure, pieceBody)

  const updates: { body: string; structure: string | null; updated_at: number; model?: string; provider?: string | null; used_taste?: number } = {
    body: pieceBody,
    structure: structure ? serializeStructure(structure) : null,
    updated_at: Date.now(),
  }
  if (body.model !== undefined) {
    if (!isValidModelId(body.model)) return c.json({ error: 'Invalid model' }, 400)
    updates.model = body.model
  }
  if (body.provider !== undefined) {
    const providerRaw = typeof body.provider === 'string' ? body.provider.trim() : ''
    updates.provider = providerRaw ? providerRaw : null
  }
  // Resuming with taste applied marks the piece as taste-shaped, but never clears it: a piece
  // that was already shaped by taste stays flagged even if the reader later toggles it off.
  const owned = db
    .select({ world_id: pieces.world_id })
    .from(pieces)
    .where(and(eq(pieces.id, id), eq(pieces.user_id, userId)))
    .get()
  if (owned && body.useTaste === true && tasteApplies(userId, owned.world_id)) {
    updates.used_taste = 1
  }

  const updated = db
    .update(pieces)
    .set(updates)
    .where(and(eq(pieces.id, id), eq(pieces.user_id, userId)))
    .returning({ id: pieces.id })
    .get()
  if (!updated) return c.json({ error: 'Not found' }, 404)

  // Continuing a piece is activity on its world. worlds.updated_at is the clock the world list and
  // the drawer's recent list order by, so it moves here too.
  if (owned) {
    db.update(worlds)
      .set({ updated_at: updates.updated_at })
      .where(and(eq(worlds.id, owned.world_id), eq(worlds.user_id, userId)))
      .run()
  }

  const piece = db
    .select(PIECE_SELECT)
    .from(pieces)
    .innerJoin(prompts, eq(pieces.prompt_id, prompts.id))
    .where(and(eq(pieces.id, id), eq(pieces.user_id, userId)))
    .get()
  if (!piece) return c.json({ error: 'Not found' }, 404)
  return c.json(pieceResponse(piece))
})

export default pieceRoutes
