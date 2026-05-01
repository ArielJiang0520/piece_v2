import { eq, and, desc, sql } from 'drizzle-orm'
import { db, worlds, pieces } from '../../db'

export function handleListPieces(c: any) {
  const userId = c.get('userId') as number
  const worldId = parseInt(c.req.param('id'))
  const world = db.select().from(worlds).where(and(eq(worlds.id, worldId), eq(worlds.user_id, userId))).get()
  if (!world) return c.json({ error: 'Not found' }, 404)

  const rows = db
    .select({
      id: pieces.id,
      prompt: pieces.prompt,
      preview: sql<string>`substr(${pieces.body}, 1, 200)`,
      created_at: pieces.created_at,
    })
    .from(pieces)
    .where(and(eq(pieces.world_id, worldId), eq(pieces.user_id, userId)))
    .orderBy(desc(pieces.created_at))
    .all()
  return c.json(rows)
}
