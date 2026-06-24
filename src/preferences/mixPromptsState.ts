import { createPreference } from './createPreference'

// Persisted so the Mix Prompts screen feels like a browser tab: the user can wander off
// to read a piece and come back to their selection and generated candidates. Scoped to a
// single world — `worldId` lets the screen ignore another world's leftover state.
export interface MixPromptsState {
  worldId: number | null
  selectedPromptIds: number[]
  candidates: string[]
}

export const EMPTY_MIX_STATE: MixPromptsState = {
  worldId: null,
  selectedPromptIds: [],
  candidates: [],
}

function numberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === 'number' && Number.isInteger(item))
    : []
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

const mixPromptsPreference = createPreference<MixPromptsState>({
  key: 'piece:mix-prompts',
  defaultValue: EMPTY_MIX_STATE,
  parse: raw => {
    if (!raw) return EMPTY_MIX_STATE
    try {
      const parsed = JSON.parse(raw)
      return {
        worldId: typeof parsed?.worldId === 'number' ? parsed.worldId : null,
        selectedPromptIds: numberArray(parsed?.selectedPromptIds),
        candidates: stringArray(parsed?.candidates),
      }
    } catch {
      return EMPTY_MIX_STATE
    }
  },
  serialize: value => JSON.stringify(value),
})

export const getMixPromptsState = mixPromptsPreference.get
export const setMixPromptsState = mixPromptsPreference.set
export const useMixPromptsState = mixPromptsPreference.use
