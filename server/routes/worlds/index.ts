import { Hono } from 'hono'
import { and, desc, eq, sql, type SQL } from 'drizzle-orm'
import { normalizePairings } from '../../../src/pairings'
import { isLanguageId } from '../../../src/preferences/language'
import { normalizeTags } from '../../../src/tags'
import { EMPTY_WORLD_DRAFT, parseWorldDraft, serializeWorldDraft } from '../../../src/worldDraft'
import { parseWorldBody, serializeWorldBody, EMPTY_WORLD_BODY } from '../../../src/worldBody'
import { bookmarks, db, worldChanges, worldPhotos, worlds } from '../../db'
import { type Variables, authMiddleware } from '../../middleware'
import { findUserWorld, findVisibleWorld, getUserId, pagination, paramInt } from '../../route-helpers'
import { editDraft, publishBlocker, publishDraft, readDraft } from '../../world-draft'
import { worldCards } from '../../world-cards'
import sceneRoutes from './scenes'
import generateRoutes from './generate'
import storyRoutes from './stories'
import creatorCenterRoutes from './creator-center'

const worldRoutes = new Hono<{ Variables: Variables }>()

// A world's album in the author's order. Live, not drafted: the author sees what readers see.
function worldAlbum(worldId: number) {
  return db
    .select({ id: worldPhotos.id, url: worldPhotos.url })
    .from(worldPhotos)
    .where(eq(worldPhotos.world_id, worldId))
    .orderBy(worldPhotos.position, worldPhotos.id)
    .all()
}

// The public feed: published worlds only. ?q= matches name and blurb; ?pairings=mm,ff keeps worlds
// with any of them; ?tags=a,b requires every tag; ?sort=popular (words generated) or new (last reader-visible change). ?language= (the
// reader's UI language) keeps only worlds detected as written in it.
worldRoutes.get('/feed', authMiddleware, (c) => {
  const userId = getUserId(c)
  const { page, limit, offset } = pagination(c)
  const q = (c.req.query('q') ?? '').trim()
  const tagNames = normalizeTags((c.req.query('tags') ?? '').split(','))
  const pairings = normalizePairings((c.req.query('pairings') ?? '').split(','))
  const language = c.req.query('language')
  if (!isLanguageId(language)) return c.json({ error: 'Invalid language' }, 400)
  const conditions: SQL[] = [sql`w.published = 1`, sql`w.language = ${language}`]
  if (q) {
    const pattern = `%${q.replace(/[\\%_]/g, char => `\\${char}`)}%`
    conditions.push(sql`(w.name LIKE ${pattern} ESCAPE '\\' OR w.blurb LIKE ${pattern} ESCAPE '\\')`)
  }
  if (pairings.length > 0) {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM world_pairings wp
      WHERE wp.world_id = w.id AND wp.pairing IN (${sql.join(pairings.map(pairing => sql`${pairing}`), sql`, `)})
    )`)
  }
  for (const name of tagNames) {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM world_tags wt JOIN tags t ON t.id = wt.tag_id
      WHERE wt.world_id = w.id AND t.name = ${name}
    )`)
  }
  const orderBy = c.req.query('sort') === 'new'
    ? sql`w.updated_at DESC, w.id DESC`
    : sql`words DESC, w.updated_at DESC, w.id DESC`

  const rows = worldCards(userId, sql.join(conditions, sql` AND `), orderBy, limit + 1, offset)
  return c.json({ worlds: rows.slice(0, limit), page, limit, hasMore: rows.length > limit })
})

// The creator center's home: every world the user wrote, in any state, most recently published first,
// each as the author's draft has it (its name, blurb, tags and pairings).
worldRoutes.get('/mine', authMiddleware, (c) => {
  const userId = getUserId(c)
  const drafts = new Map(
    db.select({ id: worlds.id, draft: worlds.draft }).from(worlds).where(eq(worlds.user_id, userId)).all()
      .map(row => [row.id, readDraft(row)]),
  )
  const cards = worldCards(userId, sql`w.user_id = ${userId}`, sql`w.updated_at DESC, w.id DESC`).map(card => {
    const draft = drafts.get(card.id)
    return draft ? { ...card, name: draft.name, blurb: draft.blurb, tags: draft.tags, pairings: draft.pairings } : card
  })
  return c.json({ worlds: cards })
})

// New world opens the creator center on a fresh world straight away, so it may start nameless; a name is
// required to publish. Its language is the author's UI language when they create it (?language is
// sent by the client), and never changes after.
worldRoutes.post('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const payload = await c.req.json()
  if (!isLanguageId(payload.language)) return c.json({ error: 'Invalid language' }, 400)
  const now = Date.now()

  // Everything starts in the draft; nothing is public until the first publish.
  const world = db.insert(worlds).values({
    user_id: userId,
    name: '',
    blurb: '',
    language: payload.language,
    body: serializeWorldBody(EMPTY_WORLD_BODY),
    draft: serializeWorldDraft(parseWorldDraft({
      ...EMPTY_WORLD_DRAFT,
      name: payload.name,
      blurb: payload.blurb,
      tags: payload.tags,
      pairings: payload.pairings,
      body: payload.body,
    })),
    published: 0,
    created_at: now,
    updated_at: now,
  }).returning({ id: worlds.id }).get()

  return c.json({ id: world.id })
})

// Anyone can read a published world; the author reads their own in any state. Everyone, the
// author included, sees what was last published, without the instructions (those are for the
// model only). The author's working copy is only ever loaded by the editor, from /:id/draft.
worldRoutes.get('/:id', authMiddleware, (c) => {
  const userId = getUserId(c)
  const world = findVisibleWorld(userId, paramInt(c, 'id'))
  if (!world) return c.json({ error: 'Not found' }, 404)
  const [card] = worldCards(userId, sql`w.id = ${world.id}`, sql`w.id`)
  // How many worlds the author has published, for the author row on About.
  const [authorWorlds] = db.all<{ count: number }>(sql`
    SELECT count(*) AS count FROM worlds WHERE user_id = ${world.user_id} AND published = 1
  `)

  return c.json({ ...card, author_world_count: Number(authorWorlds?.count ?? 0), album: worldAlbum(world.id), body: { ...parseWorldBody(world.body), instructions: '' } })
})

// Author only, for the creator center: the world's card with the draft's name, blurb, tags, pairings and
// body (instructions included), and what, if anything, stands in the way of publishing it.
worldRoutes.get('/:id/draft', authMiddleware, (c) => {
  const userId = getUserId(c)
  const world = findUserWorld(userId, paramInt(c, 'id'))
  if (!world) return c.json({ error: 'Not found' }, 404)
  const [card] = worldCards(userId, sql`w.id = ${world.id}`, sql`w.id`)
  const draft = readDraft(world)

  return c.json({
    ...card,
    name: draft.name,
    blurb: draft.blurb,
    tags: draft.tags,
    pairings: draft.pairings,
    album: worldAlbum(world.id),
    body: draft.body,
    publish_blocker: publishBlocker(draft),
  })
})

// Author only, autosaved from the creator center's World tab into the draft: readers see none of it until
// Publish.
worldRoutes.patch('/:id', authMiddleware, async (c) => {
  const world = findUserWorld(getUserId(c), paramInt(c, 'id'))
  if (!world) return c.json({ error: 'Not found' }, 404)
  const payload = await c.req.json()
  editDraft(world.id, draft => {
    if (payload.name !== undefined) draft.name = typeof payload.name === 'string' ? payload.name : ''
    if (payload.blurb !== undefined) draft.blurb = typeof payload.blurb === 'string' ? payload.blurb : ''
    if (payload.tags !== undefined) draft.tags = normalizeTags(payload.tags)
    if (payload.pairings !== undefined) draft.pairings = normalizePairings(payload.pairings)
    if (payload.body !== undefined) draft.body = parseWorldBody(payload.body)
    return true
  })
  return c.json({ ok: true })
})

// Author only. Makes the whole draft — the world, its collections and its scenes — what readers
// see (server/world-draft.ts). It needs a name, every collection named, and every scene finished.
worldRoutes.post('/:id/publish', authMiddleware, (c) => {
  const world = findUserWorld(getUserId(c), paramInt(c, 'id'))
  if (!world) return c.json({ error: 'Not found' }, 404)
  const blocker = publishBlocker(readDraft(world))
  if (blocker === 'name') return c.json({ error: 'Name required' }, 400)
  if (blocker === 'collection_name') return c.json({ error: 'Every collection needs a name' }, 400)
  if (blocker === 'unfinished') return c.json({ error: 'Every scene needs a description and an instruction' }, 400)
  if (world.published && world.draft === world.published_draft) return c.json({ ok: true, changed: false })
  publishDraft(world, Date.now())
  return c.json({ ok: true, changed: true })
})

worldRoutes.delete('/:id', authMiddleware, (c) => {
  const id = paramInt(c, 'id')
  const world = findUserWorld(getUserId(c), id)
  if (!world) return c.json({ error: 'Not found' }, 404)
  db.delete(worlds).where(eq(worlds.id, id)).run()
  return c.json({ ok: true })
})

// Readers bookmark other people's worlds; an author can't bookmark their own.
worldRoutes.put('/:id/bookmark', authMiddleware, (c) => {
  const userId = getUserId(c)
  const world = findVisibleWorld(userId, paramInt(c, 'id'))
  if (!world) return c.json({ error: 'Not found' }, 404)
  if (world.user_id === userId) return c.json({ error: 'You cannot bookmark your own world' }, 400)
  db.insert(bookmarks)
    .values({ user_id: userId, world_id: world.id, created_at: Date.now() })
    .onConflictDoNothing()
    .run()
  return c.json({ ok: true })
})

worldRoutes.delete('/:id/bookmark', authMiddleware, (c) => {
  const userId = getUserId(c)
  db.delete(bookmarks)
    .where(and(eq(bookmarks.user_id, userId), eq(bookmarks.world_id, paramInt(c, 'id'))))
    .run()
  return c.json({ ok: true })
})

worldRoutes.get('/:id/changes', authMiddleware, (c) => {
  const world = findVisibleWorld(getUserId(c), paramInt(c, 'id'))
  if (!world) return c.json({ error: 'Not found' }, 404)
  const { page, limit, offset } = pagination(c, 50)
  const rows = db
    .select({ id: worldChanges.id, kind: worldChanges.kind, label: worldChanges.label, created_at: worldChanges.created_at })
    .from(worldChanges)
    .where(eq(worldChanges.world_id, world.id))
    .orderBy(desc(worldChanges.created_at), desc(worldChanges.id))
    .limit(limit + 1)
    .offset(offset)
    .all()
  return c.json({ changes: rows.slice(0, limit), page, limit, hasMore: rows.length > limit })
})

worldRoutes.route('/:id/scenes', sceneRoutes)
worldRoutes.route('/:id/generate', generateRoutes)
worldRoutes.route('/:id/stories', storyRoutes)
worldRoutes.route('/:id/creator-center', creatorCenterRoutes)

export default worldRoutes
