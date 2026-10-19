// A world's pairings: who is with whom. A fixed list, not freeform like tags, and the feed's main
// filter. A world can have several. Shared by client and server; the ids are what is stored.
export const PAIRINGS = ['mm', 'ff', 'mf', 'other'] as const
export type Pairing = typeof PAIRINGS[number]

export function isPairing(value: unknown): value is Pairing {
  return PAIRINGS.includes(value as Pairing)
}

// Known ids only, duplicates dropped, in the list's order whatever order they came in.
export function normalizePairings(values: unknown): Pairing[] {
  if (!Array.isArray(values)) return []
  return PAIRINGS.filter(pairing => values.includes(pairing))
}
