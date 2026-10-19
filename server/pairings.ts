import { eq, inArray } from 'drizzle-orm'
import { normalizePairings, PAIRINGS, type Pairing } from '../src/pairings'
import { db, worldPairings } from './db'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Db = typeof db | Tx

// Replace a world's pairings with these. Input is raw; unknown ids are dropped.
export function setWorldPairings(tx: Db, worldId: number, raw: unknown) {
  const pairings = normalizePairings(raw)
  tx.delete(worldPairings).where(eq(worldPairings.world_id, worldId)).run()
  if (pairings.length > 0) tx.insert(worldPairings).values(pairings.map(pairing => ({ world_id: worldId, pairing }))).run()
}

// Each world's pairings, in the list's order.
export function pairingsByWorld(worldIds: number[]) {
  const map = new Map<number, Pairing[]>()
  if (worldIds.length === 0) return map
  const rows = db
    .select({ world_id: worldPairings.world_id, pairing: worldPairings.pairing })
    .from(worldPairings)
    .where(inArray(worldPairings.world_id, worldIds))
    .all()
  for (const row of rows) map.set(row.world_id, [...(map.get(row.world_id) ?? []), row.pairing as Pairing])
  for (const [id, pairings] of map) map.set(id, PAIRINGS.filter(pairing => pairings.includes(pairing)))
  return map
}
