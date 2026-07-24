import { createPreference } from './createPreference'
import { EMPTY_PROMPT_SESSION, parsePromptSession, type PromptSession } from './promptSession'

// Persisted so the Ideas screen feels like a browser tab: the writer can wander off to read a
// piece and come back mid-session, with the board, the marks and the trail intact.
//
// Scoped to a world AND to the version checked out when the session started. A world version owns
// everything below it, and the setting the candidates were spun out of is the version's — so a
// session carried across a version switch would be built on a world that is no longer on screen.
export interface WorldIdeasState {
  worldId: number | null
  worldVersionId: number | null
  session: PromptSession
}

export const EMPTY_WORLD_IDEAS_STATE: WorldIdeasState = {
  worldId: null,
  worldVersionId: null,
  session: EMPTY_PROMPT_SESSION,
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
        worldVersionId: typeof parsed?.worldVersionId === 'number' ? parsed.worldVersionId : null,
        session: parsePromptSession(parsed?.session),
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
