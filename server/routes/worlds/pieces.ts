import { Hono } from 'hono'
import { eq, and, desc, sql } from 'drizzle-orm'
import { db, worlds, prompts, pieces } from '../../db'
import { type Variables, authMiddleware } from '../../middleware'
import { MODELS } from '../../../src/config'
import { clusterPromptById, recomputePromptCluster } from '../../prompt-clustering'
import { normalizePromptInput, promptTextMatchesNormalized } from '../../prompt-text'

const pieceRoutes = new Hono<{ Variables: Variables }>()
const modelIds = new Set(MODELS.map(model => model.id))

pieceRoutes.post('/', authMiddleware, async (c: any) => {
  const userId = c.get('userId') as number
  const worldId = parseInt(c.req.param('id'))
  const world = db
    .select({ id: worlds.id })
    .from(worlds)
    .where(and(eq(worlds.id, worldId), eq(worlds.user_id, userId)))
    .get()
  if (!world) return c.json({ error: 'Not found' }, 404)

  const body = await c.req.json()
  const promptText = normalizePromptInput(body.prompt)
  if (!promptText) return c.json({ error: 'Prompt required' }, 400)

  const pieceBody = typeof body.body === 'string' ? body.body : ''
  if (!pieceBody.trim()) return c.json({ error: 'Piece body required' }, 400)

  const model = typeof body.model === 'string' && modelIds.has(body.model) ? body.model : null
  if (!model) return c.json({ error: 'Invalid model' }, 400)

  let existingPromptId: number | undefined
  let existingPromptClusterId: number | null = null

  if (body.promptId !== undefined && body.promptId !== null) {
    const id = Number(body.promptId)
    if (!Number.isInteger(id) || id < 1) return c.json({ error: 'Invalid prompt id' }, 400)
    const existing = db
      .select({ id: prompts.id, text: prompts.text, cluster_id: prompts.cluster_id })
      .from(prompts)
      .where(and(eq(prompts.id, id), eq(prompts.world_id, worldId), eq(prompts.user_id, userId)))
      .get()
    if (existing && existing.text.trim() === promptText) {
      existingPromptId = existing.id
      existingPromptClusterId = existing.cluster_id
    }
  }

  if (existingPromptId === undefined) {
    const matching = db
      .select({ id: prompts.id, cluster_id: prompts.cluster_id })
      .from(prompts)
      .where(and(promptTextMatchesNormalized(prompts.text, promptText), eq(prompts.world_id, worldId), eq(prompts.user_id, userId)))
      .orderBy(desc(prompts.updated_at), desc(prompts.id))
      .get()
    if (matching) {
      existingPromptId = matching.id
      existingPromptClusterId = matching.cluster_id
    }
  }

  const now = Date.now()
  const isNewPrompt = existingPromptId === undefined

  const promptRow = isNewPrompt
    ? db.insert(prompts).values({
      user_id: userId,
      world_id: worldId,
      text: promptText,
      piece_count: 1,
      created_at: now,
      updated_at: now,
    }).returning({ id: prompts.id }).get()
    : { id: existingPromptId! }

  const piece = db.insert(pieces).values({
    user_id: userId,
    world_id: worldId,
    prompt_id: promptRow.id,
    body: pieceBody,
    model,
    created_at: now,
  }).returning({ id: pieces.id }).get()

  if (isNewPrompt) {
    await clusterPromptById(promptRow.id)
  } else {
    db.update(prompts)
      .set({
        updated_at: now,
        piece_count: sql`${prompts.piece_count} + 1`,
      })
      .where(and(eq(prompts.id, promptRow.id), eq(prompts.world_id, worldId), eq(prompts.user_id, userId)))
      .run()
    if (existingPromptClusterId === null) {
      await clusterPromptById(promptRow.id)
    } else {
      recomputePromptCluster(existingPromptClusterId)
    }
  }

  return c.json({ promptId: promptRow.id, pieceId: piece.id, isNewPrompt })
})

export default pieceRoutes
