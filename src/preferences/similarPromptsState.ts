import { createPreference } from './createPreference'
import { EMPTY_PROMPT_WORKSHOP, parsePromptWorkshop, type PromptWorkshop } from './promptWorkshop'

// Persisted so the "More like this" tab feels like a browser tab: the writer can wander off to
// read a piece and come back mid-workshop, with the draft and the trail of revisions intact.
//
// Scoped to the source prompt AND to the world version checked out when the workshop started —
// same reason additions are: the world setting behind the draft belongs to a version.
export interface SimilarPromptsState {
  promptId: number | null
  worldVersionId: number | null
  workshop: PromptWorkshop
}

export const EMPTY_SIMILAR_STATE: SimilarPromptsState = {
  promptId: null,
  worldVersionId: null,
  workshop: EMPTY_PROMPT_WORKSHOP,
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
        worldVersionId: typeof parsed?.worldVersionId === 'number' ? parsed.worldVersionId : null,
        workshop: parsePromptWorkshop(parsed?.workshop),
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
