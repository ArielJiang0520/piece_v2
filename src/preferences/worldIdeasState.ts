import { createPreference } from './createPreference'
import { EMPTY_PROMPT_WORKSHOP, parsePromptWorkshop, type PromptWorkshop } from './promptWorkshop'

// Persisted so the Ideas screen feels like a browser tab: the writer can wander off to read a
// piece and come back mid-workshop, with the draft and the trail of revisions intact.
//
// Scoped to a world AND to the version checked out when the workshop started. A world version owns
// everything below it, and the setting the draft was written from is the version's — so a workshop
// carried across a version switch would be built on a world that is no longer on screen.
export interface WorldIdeasState {
  worldId: number | null
  worldVersionId: number | null
  workshop: PromptWorkshop
}

export const EMPTY_WORLD_IDEAS_STATE: WorldIdeasState = {
  worldId: null,
  worldVersionId: null,
  workshop: EMPTY_PROMPT_WORKSHOP,
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
        workshop: parsePromptWorkshop(parsed?.workshop),
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
