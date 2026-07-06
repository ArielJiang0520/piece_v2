import { createPreference } from './createPreference'

// Persisted so the Similar Prompts screen feels like a browser tab: the user can wander off to
// read a piece and come back to their candidates and hint. Scoped to a single source prompt —
// `promptId` lets the screen ignore another prompt's leftover state.
export interface SimilarPromptsState {
  promptId: number | null
  hint: string
  candidates: string[]
}

export const EMPTY_SIMILAR_STATE: SimilarPromptsState = {
  promptId: null,
  hint: '',
  candidates: [],
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

const similarPromptsPreference = createPreference<SimilarPromptsState>({
  key: 'piece:similar-prompts',
  defaultValue: EMPTY_SIMILAR_STATE,
  parse: raw => {
    if (!raw) return EMPTY_SIMILAR_STATE
    try {
      const parsed = JSON.parse(raw)
      return {
        promptId: typeof parsed?.promptId === 'number' ? parsed.promptId : null,
        hint: typeof parsed?.hint === 'string' ? parsed.hint : '',
        candidates: stringArray(parsed?.candidates),
      }
    } catch {
      return EMPTY_SIMILAR_STATE
    }
  },
  serialize: value => JSON.stringify(value),
})

export const getSimilarPromptsState = similarPromptsPreference.get
export const setSimilarPromptsState = similarPromptsPreference.set
export const useSimilarPromptsState = similarPromptsPreference.use
