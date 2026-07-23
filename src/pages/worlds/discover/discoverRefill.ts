import { apiFetch } from '@/api'
import { appendCards, getDiscoverSession, setError, setFetching } from './discoverSession'

// Candidates are never written to the reader's prompts — only a Like does that. The refill sends
// nothing: the server builds its prompt from the world and the Discover profile alone, and the
// deck (discoverSession) is purely a client-side browse cache. Fetching only ever happens from
// the Discover screen itself — no speculative warming from other screens.

// A hard ceiling on one session's deck: past this the reader is grazing, and every refill costs a
// generation.
const SESSION_BUFFER_CAP = 40
// Refill when this few cards remain ahead of the one being read, so the next batch is usually
// already there by the time the reader swipes into it.
export const LOW_WATER = 2

interface RefillResponse {
  candidates: Array<{ text: string; kind: 'aligned' | 'wildcard' }>
}

// Decks with a batch in flight, so overlapping triggers (cold start + low-water) collapse to one.
const inFlight = new Set<string>()

async function run(worldId: number, versionId: number): Promise<Error | null> {
  const key = `${worldId}:${versionId}`
  if (inFlight.has(key)) return null
  const current = getDiscoverSession(worldId, versionId)
  if (current.cards.length >= SESSION_BUFFER_CAP) return null

  inFlight.add(key)
  setFetching(worldId, versionId, true)
  try {
    const response = (await apiFetch(`/api/worlds/${worldId}/discover/refill`, {
      method: 'POST',
      body: JSON.stringify({}),
    })) as RefillResponse
    appendCards(worldId, versionId, response.candidates.map(candidate => ({
      text: candidate.text,
      kind: candidate.kind,
      shown: false,
      liked: false,
    })))
    return null
  } catch (error) {
    return error instanceof Error ? error : new Error('refill failed')
  } finally {
    inFlight.delete(key)
    setFetching(worldId, versionId, false)
  }
}

// The reader is on the Discover screen and waiting on this batch, so a failure is theirs to see
// and retry.
export async function refillDiscoverDeck(worldId: number, versionId: number, fallbackError: string) {
  setError(worldId, versionId, null)
  const error = await run(worldId, versionId)
  if (error) setError(worldId, versionId, error.message || fallbackError)
}
