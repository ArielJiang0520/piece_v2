import { createPreference } from './createPreference'

// Which additions are switched on right now. A sticky mode the reader sits in, not a property of
// any prompt: turn one on and it stays on until it's turned off, across prompts and sessions.
//
// Scoped to a world AND to the version checked out when they were switched on. Additions are
// owned by a version, so a set carried across a version switch would name additions that aren't
// on the shelf any more — the whole set falls away with the version, the same way the workshop
// draft in similarPromptsState does.
export interface ActiveAdditionsState {
  worldId: number | null
  worldVersionId: number | null
  ids: number[]
}

export const EMPTY_ACTIVE_ADDITIONS: ActiveAdditionsState = {
  worldId: null,
  worldVersionId: null,
  ids: [],
}

const activeAdditionsPreference = createPreference<ActiveAdditionsState>({
  key: 'piece:active-additions',
  defaultValue: EMPTY_ACTIVE_ADDITIONS,
  parse: raw => {
    if (!raw) return EMPTY_ACTIVE_ADDITIONS
    try {
      const parsed = JSON.parse(raw)
      return {
        worldId: typeof parsed?.worldId === 'number' ? parsed.worldId : null,
        worldVersionId: typeof parsed?.worldVersionId === 'number' ? parsed.worldVersionId : null,
        ids: Array.isArray(parsed?.ids)
          ? [...new Set((parsed.ids as unknown[]).filter((id): id is number => typeof id === 'number' && Number.isInteger(id) && id >= 1))]
          : [],
      }
    } catch {
      return EMPTY_ACTIVE_ADDITIONS
    }
  },
  serialize: value => JSON.stringify(value),
})

export const getActiveAdditionsState = activeAdditionsPreference.get
export const setActiveAdditionsState = activeAdditionsPreference.set
export const useActiveAdditionsState = activeAdditionsPreference.use

// The stored set only counts for the world and version it was recorded against; anywhere else it
// reads as nothing on. Callers pass what's on screen and get back the ids they can actually send.
export function activeAdditionIdsFor(
  state: ActiveAdditionsState,
  worldId: number | null,
  worldVersionId: number | null,
): number[] {
  if (worldId == null || worldVersionId == null) return []
  if (state.worldId !== worldId || state.worldVersionId !== worldVersionId) return []
  return state.ids
}

export function setActiveAdditionIds(worldId: number, worldVersionId: number, ids: number[]) {
  setActiveAdditionsState({ worldId, worldVersionId, ids: [...new Set(ids)] })
}
