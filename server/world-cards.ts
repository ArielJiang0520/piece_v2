import { sql, type SQL } from 'drizzle-orm'
import { db } from './db'
import { pairingsByWorld } from './pairings'
import { tagsByWorld } from './tags'

interface WorldCardRow {
  id: number
  name: string
  blurb: string
  author: string
  published: number
  cover_url: string | null
  has_draft_changes: number
  updated_at: number
  scene_count: number
  words: number
  readers: number
  bookmarked: number
  is_author: number
}

// Every list of worlds (feed, library) returns the same card. scene_count is the author's
// scenes, what readers can play; words and readers are the popularity signal, summed over every generation run.
export function worldCards(userId: number, where: SQL, orderBy: SQL, limit?: number, offset = 0) {
  const rows = db.all<WorldCardRow>(sql`
    SELECT
      w.id, w.name, w.blurb, w.published, w.cover_url, w.updated_at,
      u.username AS author,
      (w.published = 1 AND w.draft != w.published_draft) AS has_draft_changes,
      (SELECT count(*) FROM scenes p WHERE p.world_id = w.id AND p.user_id = w.user_id) AS scene_count,
      coalesce((SELECT sum(g.words) FROM generations g WHERE g.world_id = w.id), 0) AS words,
      (SELECT count(DISTINCT g.user_id) FROM generations g WHERE g.world_id = w.id) AS readers,
      EXISTS (SELECT 1 FROM bookmarks b WHERE b.world_id = w.id AND b.user_id = ${userId}) AS bookmarked,
      (w.user_id = ${userId}) AS is_author
    FROM worlds w
    JOIN users u ON u.id = w.user_id
    WHERE ${where}
    ORDER BY ${orderBy}
    ${limit === undefined ? sql`` : sql`LIMIT ${limit} OFFSET ${offset}`}
  `)
  const tags = tagsByWorld(rows.map(row => row.id))
  const pairings = pairingsByWorld(rows.map(row => row.id))
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    blurb: row.blurb,
    author: row.author,
    published: Boolean(row.published),
    cover_url: row.cover_url,
    has_draft_changes: Boolean(row.has_draft_changes),
    updated_at: row.updated_at,
    scene_count: Number(row.scene_count),
    words: Number(row.words),
    readers: Number(row.readers),
    bookmarked: Boolean(row.bookmarked),
    is_author: Boolean(row.is_author),
    pairings: pairings.get(row.id) ?? [],
    tags: tags.get(row.id) ?? [],
  }))
}
