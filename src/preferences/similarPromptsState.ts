import { createPreference } from './createPreference'
import { EMPTY_PROMPT_SESSION, parsePromptSession, type PromptSession } from './promptSession'

// Persisted so the "More like this" tab feels like a browser tab: the writer can wander off to
// read a piece and come back mid-session, with the board, the marks and the trail intact.
//
// Scoped to the source prompt AND to the world version checked out when the session started —
// same reason as the Ideas screen: the world setting behind the candidates belongs to a version.
export interface SimilarPromptsState {
  promptId: number | null
  worldVersionId: number | null
  session: PromptSession
}

export const EMPTY_SIMILAR_STATE: SimilarPromptsState = {
  promptId: null,
  worldVersionId: null,
  session: EMPTY_PROMPT_SESSION,
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
        session: parsePromptSession(parsed?.session),
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
