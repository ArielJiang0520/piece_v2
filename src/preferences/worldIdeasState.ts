import { createPreference } from './createPreference'

// Persisted so the Spark Ideas screen feels like a browser tab: the user can wander off to read a
// piece and come back to their candidates and hint. Scoped to a single world — `worldId` lets the
// screen ignore another world's leftover state.
export interface WorldIdeasState {
  worldId: number | null
  hint: string
  candidates: string[]
}

export const EMPTY_WORLD_IDEAS_STATE: WorldIdeasState = {
  worldId: null,
  hint: '',
  candidates: [],
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

const worldIdeasPreference = createPreference<WorldIdeasState>({
  key: 'piece:world-ideas',
  defaultValue: EMPTY_WORLD_IDEAS_STATE,
  parse: raw => {
    if (!raw) return EMPTY_WORLD_IDEAS_STATE
    try {
      const parsed = JSON.parse(raw)
      return {
        worldId: typeof parsed?.worldId === 'number' ? parsed.worldId : null,
        hint: typeof parsed?.hint === 'string' ? parsed.hint : '',
        candidates: stringArray(parsed?.candidates),
      }
    } catch {
      return EMPTY_WORLD_IDEAS_STATE
    }
  },
  serialize: value => JSON.stringify(value),
})

export const getWorldIdeasState = worldIdeasPreference.get
export const setWorldIdeasState = worldIdeasPreference.set
export const useWorldIdeasState = worldIdeasPreference.use
