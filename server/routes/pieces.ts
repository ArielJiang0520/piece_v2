import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import { db, prompts, pieces } from '../db'
import { type Variables, authMiddleware } from '../middleware'
import { getUserId, isValidModelId, paramInt } from '../route-helpers'
import { parseStructure, serializeStructure } from '../../src/pages/worlds/shared/pieceStructure'

const pieceRoutes = new Hono<{ Variables: Variables }>()

pieceRoutes.get('/:id', authMiddleware, (c) => {
  const userId = getUserId(c)
  const id = paramInt(c, 'id')
  const piece = db
    .select({
      id: pieces.id,
      user_id: pieces.user_id,
      world_id: pieces.world_id,
      prompt_id: pieces.prompt_id,
      prompt: prompts.text,
      body: pieces.body,
      structure: pieces.structure,
      model: pieces.model,
      provider: pieces.provider,
      created_at: pieces.created_at,
    })
    .from(pieces)
    .innerJoin(prompts, eq(pieces.prompt_id, prompts.id))
    .where(and(eq(pieces.id, id), eq(pieces.user_id, userId)))
    .get()
  if (!piece) return c.json({ error: 'Not found' }, 404)
  return c.json({ ...piece, structure: parseStructure(piece.structure, piece.body) })
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

  const updates: { body: string; structure: string | null; updated_at: number; model?: string; provider?: string | null } = {
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

  const updated = db
    .update(pieces)
    .set(updates)
    .where(and(eq(pieces.id, id), eq(pieces.user_id, userId)))
    .returning({ id: pieces.id })
    .get()
  if (!updated) return c.json({ error: 'Not found' }, 404)

  const piece = db
    .select({
      id: pieces.id,
      user_id: pieces.user_id,
      world_id: pieces.world_id,
      prompt_id: pieces.prompt_id,
      prompt: prompts.text,
      body: pieces.body,
      structure: pieces.structure,
      model: pieces.model,
      provider: pieces.provider,
      created_at: pieces.created_at,
    })
    .from(pieces)
    .innerJoin(prompts, eq(pieces.prompt_id, prompts.id))
    .where(and(eq(pieces.id, id), eq(pieces.user_id, userId)))
    .get()
  if (!piece) return c.json({ error: 'Not found' }, 404)
  return c.json({ ...piece, structure: parseStructure(piece.structure, piece.body) })
})

export default pieceRoutes
