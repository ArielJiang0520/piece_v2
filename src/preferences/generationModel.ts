import { createPreference } from './createPreference'

export interface ModelOption {
  id: string
  label: string
  recommended: boolean
  attributes: {
    speed: 1 | 2 | 3
    quality: 1 | 2 | 3
    cost: 1 | 2 | 3
  }
  reasoning: {
    effort: 'low' | 'high' | 'none'
  }
  preferredProviders: string[]
}

export const MODELS: ModelOption[] = [
  {
    id: 'deepseek/deepseek-v4-pro',
    label: 'DeepSeek V4 Pro',
    recommended: true,
    attributes: { speed: 1, quality: 3, cost: 3 },
    reasoning: { effort: 'none' },
    preferredProviders: [],
  },
  {
    id: 'deepseek/deepseek-v4-flash',
    label: 'DeepSeek V4 Flash',
    recommended: false,
    attributes: { speed: 3, quality: 1, cost: 1 },
    reasoning: { effort: 'none' },
    preferredProviders: [],
  },
  {
    id: 'z-ai/glm-5.2',
    label: 'GLM 5.2',
    recommended: false,
    attributes: { speed: 1, quality: 3, cost: 3 },
    reasoning: { effort: 'none' },
    preferredProviders: [],
  },
  {
    id: 'minimax/minimax-m3',
    label: 'Minimax M3',
    recommended: false,
    attributes: { speed: 1, quality: 3, cost: 3 },
    reasoning: { effort: 'none' },
    preferredProviders: [],
  },
  {
    id: 'xiaomi/mimo-v2.5-pro',
    label: 'Xiaomi Mimo V2.5 Pro',
    recommended: false,
    attributes: { speed: 1, quality: 3, cost: 3 },
    reasoning: { effort: 'none' },
    preferredProviders: [],
  },
]

export const DEFAULT_MODEL_ID = 'deepseek/deepseek-v4-pro'

// The three prompt-working flows — the workshop (Ideas / More like this) and Rework — are not a
// model choice. They write one short prompt, not a story: which model does it is a fixture of the
// feature, so it is pinned here and never shown.
export const PROMPT_WORKSHOP_MODEL_ID = 'z-ai/glm-5.2'

// Talking about a world is its own job too, and its own pin — a chat model is chosen for how it
// converses, which has nothing to do with what writes prompts or reads likes. Never shown.
export const CHAT_MODEL_ID = 'z-ai/glm-5.2'

// Distilling a taste profile is its own job with its own demands, so it holds its own pin rather
// than riding along with the workshop's — the two happen to name the same model today, and either
// can be re-pointed without touching the other. Also never shown or chosen.
export const TASTE_MODEL_ID = 'z-ai/glm-5.2'

export const BLACKLISTED_PROVIDERS: string[] = ['alibaba', 'together']

function isModelId(value: unknown): value is string {
  return typeof value === 'string' && MODELS.some(model => model.id === value)
}

const generationModelPreference = createPreference<string>({
  key: 'piece:generation-model',
  defaultValue: DEFAULT_MODEL_ID,
  parse: raw => (isModelId(raw) ? raw : DEFAULT_MODEL_ID),
})

export const setGenerationModel = generationModelPreference.set
export const useGenerationModel = generationModelPreference.use
