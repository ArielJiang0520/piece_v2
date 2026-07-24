import { Hono } from 'hono'
import { eq, and, desc, sql } from 'drizzle-orm'
import { db, prompts, pieces, promptClusters } from '../../db'
import { type Variables, authMiddleware } from '../../middleware'
import { findUserWorld, getUserId, isValidModelId, paramInt } from '../../route-helpers'
import { createClusterForPrompt, embedPromptForSearch, recomputePromptCluster } from '../../prompt-clustering'
import { normalizePromptInput, promptTextMatchesNormalized } from '../../prompt-text'
import { parseStructure, serializeStructure } from '../../../src/pages/worlds/shared/pieceStructure'
import { tasteApplies } from '../../taste-profile'

const pieceRoutes = new Hono<{ Variables: Variables }>()

pieceRoutes.post('/', authMiddleware, async (c: any) => {
  const userId = getUserId(c)
  const worldId = paramInt(c, 'id')
  const world = findUserWorld(userId, worldId)
  if (!world) return c.json({ error: 'Not found' }, 404)
  // A new prompt is tied to the world version currently checked out.
  const worldVersionId = world.current_version_id

  const body = await c.req.json()
  const promptText = normalizePromptInput(body.prompt)
  if (!promptText) return c.json({ error: 'Prompt required' }, 400)

  const pieceBody = typeof body.body === 'string' ? body.body : ''
  if (!pieceBody.trim()) return c.json({ error: 'Piece body required' }, 400)

  // Optional action history. Validated against the body; a mismatch is dropped (stored as
  // plain text) rather than rejected, so a save never fails over a bad structure payload.
  const structure = parseStructure(body.structure, pieceBody)
  const structureJson = structure ? serializeStructure(structure) : null

  if (!isValidModelId(body.model)) return c.json({ error: 'Invalid model' }, 400)
  const model = body.model
  const providerRaw = typeof body.provider === 'string' ? body.provider.trim() : ''
  const provider = providerRaw ? providerRaw : null

  // Record whether the taste profile actually shaped this generation: the reader had the
  // toggle on AND had a non-empty profile for this world. Toggle-on with an empty profile
  // injects nothing, so it doesn't count.
  const usedTaste = body.useTaste === true && tasteApplies(userId, worldId)

  let existingPromptId: number | undefined
  let existingPromptClusterId: number | null = null
  let versionSourceClusterId: number | null = null

  // Ancestry for a "Similar prompts" offshoot: recorded only when this save creates a brand-new
  // prompt row. Soft-validated — a bad/foreign id is dropped, never a 400.
  let similarToPromptId: number | null = null
  if (body.similarToPromptId !== undefined && body.similarToPromptId !== null) {
    const candidate = Number(body.similarToPromptId)
    if (Number.isInteger(candidate) && candidate >= 1) {
      const parent = db
        .select({ id: prompts.id })
        .from(prompts)
        .where(and(eq(prompts.id, candidate), eq(prompts.world_id, worldId), eq(prompts.user_id, userId)))
        .get()
      if (parent) similarToPromptId = parent.id
    }
  }

  // Whether this prompt was born from an AI candidate — a "More like this" offshoot (which also
  // carries ancestry above) or a world-native "Spark ideas" pick (no parent). Drives the
  // "Generated" tag on the prompt card.
  const isGenerated = similarToPromptId !== null || body.generated === true

  if (body.versionSourcePromptId !== undefined && body.versionSourcePromptId !== null) {
    const sourcePromptId = Number(body.versionSourcePromptId)
    if (!Number.isInteger(sourcePromptId) || sourcePromptId < 1) return c.json({ error: 'Invalid version source prompt id' }, 400)
    const sourcePrompt = db
      .select({ id: prompts.id, text: prompts.text, cluster_id: prompts.cluster_id })
      .from(prompts)
      .where(and(eq(prompts.id, sourcePromptId), eq(prompts.world_id, worldId), eq(prompts.user_id, userId)))
      .get()
    if (!sourcePrompt) return c.json({ error: 'Version source prompt not found' }, 404)
    if (sourcePrompt.cluster_id === null) return c.json({ error: 'Version source prompt has no cluster' }, 400)

    // A prompt only ever gains a version inside its own world version. The UI no longer offers a
    // route to another version's cluster, but a prompt id captured before a version switch (back
    // navigation, a restored return state, a second tab) still can — reject it here, since the
    // containment rule is the server's to keep, not the screen's.
    const sourceCluster = db
      .select({ world_version_id: promptClusters.world_version_id })
      .from(promptClusters)
      .where(and(eq(promptClusters.id, sourcePrompt.cluster_id), eq(promptClusters.world_id, worldId), eq(promptClusters.user_id, userId)))
      .get()
    if (!sourceCluster) return c.json({ error: 'Version source prompt not found' }, 404)
    if (sourceCluster.world_version_id !== worldVersionId) {
      return c.json({ error: 'That prompt belongs to a different version of this world' }, 409)
    }

    versionSourceClusterId = sourcePrompt.cluster_id
    if (sourcePrompt.text.trim() === promptText) {
      existingPromptId = sourcePrompt.id
      existingPromptClusterId = sourcePrompt.cluster_id
    }
  }

  // Reusing an existing prompt row is only ever right within the checked-out version. The same
  // premise written against a different version of the world is a different premise, and gets its
  // own prompt and cluster there — so both lookups below join through the cluster, which is where
  // the version lives.
  const sameVersion = worldVersionId == null
    ? undefined
    : eq(promptClusters.world_version_id, worldVersionId)

  if (existingPromptId === undefined && body.promptId !== undefined && body.promptId !== null) {
    const id = Number(body.promptId)
    if (!Number.isInteger(id) || id < 1) return c.json({ error: 'Invalid prompt id' }, 400)
    const existing = db
      .select({ id: prompts.id, text: prompts.text, cluster_id: prompts.cluster_id })
      .from(prompts)
      .innerJoin(promptClusters, eq(promptClusters.id, prompts.cluster_id))
      .where(and(eq(prompts.id, id), eq(prompts.world_id, worldId), eq(prompts.user_id, userId), sameVersion))
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
      .innerJoin(promptClusters, eq(promptClusters.id, prompts.cluster_id))
      .where(and(
        promptTextMatchesNormalized(prompts.text, promptText),
        eq(prompts.world_id, worldId),
        eq(prompts.user_id, userId),
        sameVersion,
      ))
      .orderBy(desc(prompts.updated_at), desc(prompts.id))
      .get()

    if (matching) {
      existingPromptId = matching.id
      existingPromptClusterId = matching.cluster_id
    }
  }

  const now = Date.now()
  const isNewPrompt = existingPromptId === undefined

  // A new prompt and its cluster are born together, in one transaction and with no network call
  // between them, so a prompt is never left without a cluster — and therefore never without a
  // version. An explicit "new version of this prompt" joins the source cluster instead; that is
  // the only way a cluster ever gains a second prompt.
  const promptRow = isNewPrompt
    ? db.transaction(tx => {
      const row = tx.insert(prompts).values({
        user_id: userId,
        world_id: worldId,
        cluster_id: versionSourceClusterId,
        similar_to_prompt_id: similarToPromptId,
        is_generated: isGenerated ? 1 : 0,
        text: promptText,
        piece_count: 1,
        created_at: now,
        updated_at: now,
      }).returning({ id: prompts.id }).get()
      const cluster_id = versionSourceClusterId
        ?? createClusterForPrompt({ id: row.id, user_id: userId, world_id: worldId, piece_count: 1, created_at: now }, worldVersionId)
      return { id: row.id, cluster_id }
    })
    : { id: existingPromptId!, cluster_id: existingPromptClusterId }

  const piece = db.insert(pieces).values({
    user_id: userId,
    world_id: worldId,
    prompt_id: promptRow.id,
    body: pieceBody,
    structure: structureJson,
    model,
    provider,
    used_taste: usedTaste ? 1 : 0,
    created_at: now,
    updated_at: now,
  }).returning({ id: pieces.id }).get()

  const clusterId = promptRow.cluster_id

  if (isNewPrompt) {
    // A freshly created cluster already carries this prompt's rollups; a joined one needs them
    // re-derived, which also moves its representative to this newest prompt.
    if (versionSourceClusterId !== null) recomputePromptCluster(clusterId)
    // Search-only, and slow: fetch the embedding after the save has been answered. A failure
    // leaves the prompt unfindable by fuzzy search and nothing else.
    void embedPromptForSearch(promptRow.id, promptText).catch(err =>
      console.warn(`[prompt embedding] failed: ${err instanceof Error ? err.message : 'unknown error'}`))
  } else {
    db.update(prompts)
      .set({
        updated_at: now,
        piece_count: sql`${prompts.piece_count} + 1`,
      })
      .where(and(eq(prompts.id, promptRow.id), eq(prompts.world_id, worldId), eq(prompts.user_id, userId)))
      .run()
    recomputePromptCluster(clusterId)
  }

  const savedPrompt = db
    .select({ piece_count: prompts.piece_count })
    .from(prompts)
    .where(and(eq(prompts.id, promptRow.id), eq(prompts.world_id, worldId), eq(prompts.user_id, userId)))
    .get()

  return c.json({
    promptId: promptRow.id,
    pieceId: piece.id,
    pieceCount: savedPrompt?.piece_count ?? (isNewPrompt ? 1 : 0),
    clusterId,
    isNewPrompt,
    usedTaste,
  })
})

export default pieceRoutes
