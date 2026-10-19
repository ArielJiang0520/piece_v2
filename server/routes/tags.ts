import { Hono } from 'hono'
import { sql } from 'drizzle-orm'
import { isLanguageId } from '../../src/preferences/language'
import { normalizeTag } from '../../src/tags'
import { db } from '../db'
import { type Variables, authMiddleware } from '../middleware'
import { pagination } from '../route-helpers'

const tagRoutes = new Hono<{ Variables: Variables }>()

// Without ?q: the tags on the most published worlds in ?language= (the feed's filter row, so it
// offers only tags the reader's feed can show). With ?q: tags that
// contain it, most used first across worlds and collections (autocomplete while tagging), so typing
// lands on the spelling everyone else already uses.
tagRoutes.get('/', authMiddleware, (c) => {
  const { limit } = pagination(c)
  const q = normalizeTag(c.req.query('q') ?? '')

  if (!q) {
    const language = c.req.query('language')
    if (!isLanguageId(language)) return c.json({ error: 'Invalid language' }, 400)
    const rows = db.all<{ name: string; count: number }>(sql`
      SELECT t.name, count(*) AS count
      FROM tags t
      JOIN world_tags wt ON wt.tag_id = t.id
      JOIN worlds w ON w.id = wt.world_id AND w.published = 1 AND w.language = ${language}
      GROUP BY t.id
      ORDER BY count DESC, t.name
      LIMIT ${limit}
    `)
    return c.json(rows)
  }

  const pattern = `%${q.replace(/[\\%_]/g, char => `\\${char}`)}%`
  const rows = db.all<{ name: string; count: number }>(sql`
    SELECT t.name,
      (SELECT count(*) FROM world_tags wt WHERE wt.tag_id = t.id)
        + (SELECT count(*) FROM collection_tags ct WHERE ct.tag_id = t.id) AS count
    FROM tags t
    WHERE t.name LIKE ${pattern} ESCAPE '\\'
    ORDER BY (t.name = ${q}) DESC, count DESC, t.name
    LIMIT ${limit}
  `)
  return c.json(rows)
})

export default tagRoutes
