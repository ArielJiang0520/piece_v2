import { Hono, type Context } from 'hono'
import { normalizeTags } from '../../../src/tags'
import type { DraftCollection, DraftScene, WorldDraft } from '../../../src/worldDraft'
import { type Variables, authMiddleware } from '../../middleware'
import { findUserWorld, getUserId, paramInt } from '../../route-helpers'
import { editDraft, findDraftScene, storyCount, readDraft } from '../../world-draft'
import { moveTo } from '../../scene-lists'

// The author's creator center for one world, author only throughout. Every route here works on the world's
// draft (server/world-draft.ts) and autosaves into it: collections (name, description, tags,
// premise) and scenes (a description for readers, an instruction for the model), their order, and
// creating, moving and deleting them. None of it reaches readers until the world's Publish.
// Collections and scenes are named by their draft key.
const creatorCenterRoutes = new Hono<{ Variables: Variables }>()

function draftKey(c: Context) {
  return c.req.param('key') ?? ''
}

function text(value: unknown) {
  return typeof value === 'string' ? value : ''
}

// The creator center's list of a collection's or "No collection"'s scenes.
function sceneItems(group: DraftScene[]) {
  return group.map(scene => ({ id: scene.key, description: scene.description, instruction_written: scene.instruction.trim().length > 0 }))
}

function collectionItem(collection: DraftCollection) {
  return {
    id: collection.key,
    name: collection.name,
    description: collection.description,
    premise: collection.premise,
    tags: collection.tags,
    scenes: sceneItems(collection.scenes),
  }
}

// null (the "No collection" group) or one of the draft's collections; undefined when it's neither.
function targetGroup(draft: WorldDraft, raw: unknown): DraftScene[] | undefined {
  if (raw === null || raw === undefined) return draft.uncollected
  return draft.collections.find(collection => collection.key === raw)?.scenes
}

creatorCenterRoutes.get('/collections', authMiddleware, (c) => {
  const world = findUserWorld(getUserId(c), paramInt(c, 'id'))
  if (!world) return c.json({ error: 'Not found' }, 404)
  const draft = readDraft(world)
  return c.json({ collections: draft.collections.map(collectionItem), uncollected: sceneItems(draft.uncollected) })
})

// A new collection, at the end of the world's list: sent by its editor on the first save, so a
// collection exists only once something has been written in it.
creatorCenterRoutes.post('/collections', authMiddleware, async (c) => {
  const world = findUserWorld(getUserId(c), paramInt(c, 'id'))
  if (!world) return c.json({ error: 'Not found' }, 404)
  const payload = await c.req.json()
  const key = editDraft(world.id, draft => {
    const key = crypto.randomUUID()
    draft.collections.push({
      key,
      row_id: null,
      name: text(payload.name),
      description: text(payload.description),
      premise: text(payload.premise),
      tags: normalizeTags(payload.tags),
      scenes: [],
    })
    return key
  })
  return c.json({ id: key })
})

creatorCenterRoutes.get('/collections/:key', authMiddleware, (c) => {
  const world = findUserWorld(getUserId(c), paramInt(c, 'id'))
  if (!world) return c.json({ error: 'Not found' }, 404)
  const collection = readDraft(world).collections.find(entry => entry.key === draftKey(c))
  if (!collection) return c.json({ error: 'Not found' }, 404)
  return c.json({ ...collectionItem(collection), story_count: storyCount(collection.scenes) })
})

creatorCenterRoutes.patch('/collections/:key', authMiddleware, async (c) => {
  const world = findUserWorld(getUserId(c), paramInt(c, 'id'))
  if (!world) return c.json({ error: 'Not found' }, 404)
  const payload = await c.req.json()
  const found = editDraft(world.id, draft => {
    const collection = draft.collections.find(entry => entry.key === draftKey(c))
    if (!collection) return undefined
    if (payload.name !== undefined) collection.name = text(payload.name)
    if (payload.description !== undefined) collection.description = text(payload.description)
    if (payload.premise !== undefined) collection.premise = text(payload.premise)
    if (payload.tags !== undefined) collection.tags = normalizeTags(payload.tags)
    return true
  })
  if (!found) return c.json({ error: 'Not found' }, 404)
  return c.json({ ok: true })
})

// ?scenes=move puts its scenes at the end of "No collection", in their order; ?scenes=delete
// deletes them (and, once published, every reader's stories of them).
creatorCenterRoutes.delete('/collections/:key', authMiddleware, (c) => {
  const world = findUserWorld(getUserId(c), paramInt(c, 'id'))
  if (!world) return c.json({ error: 'Not found' }, 404)
  const mode = c.req.query('scenes')
  if (mode !== 'move' && mode !== 'delete') return c.json({ error: 'Choose what happens to its scenes' }, 400)
  const found = editDraft(world.id, draft => {
    const collection = draft.collections.find(entry => entry.key === draftKey(c))
    if (!collection) return undefined
    if (mode === 'move') draft.uncollected.push(...collection.scenes)
    draft.collections = draft.collections.filter(entry => entry !== collection)
    return true
  })
  if (!found) return c.json({ error: 'Not found' }, 404)
  return c.json({ ok: true })
})

// Reorder: the collection goes to this index in the world's list.
creatorCenterRoutes.post('/collections/:key/move', authMiddleware, async (c) => {
  const world = findUserWorld(getUserId(c), paramInt(c, 'id'))
  if (!world) return c.json({ error: 'Not found' }, 404)
  const payload = await c.req.json()
  const found = editDraft(world.id, draft => {
    const collection = draft.collections.find(entry => entry.key === draftKey(c))
    if (!collection) return undefined
    draft.collections = moveTo(draft.collections, collection, Number(payload.index))
    return true
  })
  if (!found) return c.json({ error: 'Not found' }, 404)
  return c.json({ ok: true })
})

creatorCenterRoutes.get('/scenes/:key', authMiddleware, (c) => {
  const world = findUserWorld(getUserId(c), paramInt(c, 'id'))
  if (!world) return c.json({ error: 'Not found' }, 404)
  const found = findDraftScene(readDraft(world), draftKey(c))
  if (!found) return c.json({ error: 'Not found' }, 404)
  return c.json({
    id: found.scene.key,
    description: found.scene.description,
    instruction: found.scene.instruction,
    collection_id: found.collection?.key ?? null,
    story_count: storyCount([found.scene]),
  })
})

// A new scene, at the end of its collection (or of No collection): sent by its editor on the first
// save, so a scene exists only once something has been written in it.
creatorCenterRoutes.post('/scenes', authMiddleware, async (c) => {
  const world = findUserWorld(getUserId(c), paramInt(c, 'id'))
  if (!world) return c.json({ error: 'Not found' }, 404)
  const payload = await c.req.json()
  const key = editDraft(world.id, draft => {
    const group = targetGroup(draft, payload.collectionId)
    if (!group) return undefined
    const key = crypto.randomUUID()
    group.push({ key, row_id: null, description: text(payload.description), instruction: text(payload.instruction) })
    return key
  })
  if (!key) return c.json({ error: 'Collection not found' }, 404)
  return c.json({ id: key })
})

creatorCenterRoutes.patch('/scenes/:key', authMiddleware, async (c) => {
  const world = findUserWorld(getUserId(c), paramInt(c, 'id'))
  if (!world) return c.json({ error: 'Not found' }, 404)
  const payload = await c.req.json()
  const found = editDraft(world.id, draft => {
    const found = findDraftScene(draft, draftKey(c))
    if (!found) return undefined
    if (payload.description !== undefined) found.scene.description = text(payload.description)
    if (payload.instruction !== undefined) found.scene.instruction = text(payload.instruction)
    return true
  })
  if (!found) return c.json({ error: 'Not found' }, 404)
  return c.json({ ok: true })
})

// Move to another collection (or "No collection", collectionId null), at index or else at its
// end; within the same collection it's a reorder. Never makes anyone's stories outdated.
creatorCenterRoutes.post('/scenes/:key/move', authMiddleware, async (c) => {
  const world = findUserWorld(getUserId(c), paramInt(c, 'id'))
  if (!world) return c.json({ error: 'Not found' }, 404)
  const payload = await c.req.json()
  const result = editDraft(world.id, draft => {
    const found = findDraftScene(draft, draftKey(c))
    if (!found) return 'not-found' as const
    const target = targetGroup(draft, payload.collectionId)
    if (!target) return 'no-collection' as const
    found.group.splice(found.index, 1)
    const index = payload.index === undefined ? target.length : Number(payload.index)
    const reordered = moveTo(target, found.scene, index)
    target.splice(0, target.length, ...reordered)
    return 'ok' as const
  })
  if (result === 'not-found' || result === undefined) return c.json({ error: 'Not found' }, 404)
  if (result === 'no-collection') return c.json({ error: 'Collection not found' }, 404)
  return c.json({ ok: true })
})

// Deleted from the draft; readers lose it, and their stories of it, on the next publish.
creatorCenterRoutes.delete('/scenes/:key', authMiddleware, (c) => {
  const world = findUserWorld(getUserId(c), paramInt(c, 'id'))
  if (!world) return c.json({ error: 'Not found' }, 404)
  const found = editDraft(world.id, draft => {
    const found = findDraftScene(draft, draftKey(c))
    if (!found) return undefined
    found.group.splice(found.index, 1)
    return true
  })
  if (!found) return c.json({ error: 'Not found' }, 404)
  return c.json({ ok: true })
})

export default creatorCenterRoutes
