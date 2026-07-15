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
]

// ─── Model roles ────────────────────────────────────────────────────────────
// Three independent jobs, each pinned to its own model so they can be tuned
// separately. Keep them all here — this file is the single source of truth.
//
//   1. Piece generation — the story stream. User-selectable from MODELS above;
//      DEFAULT_MODEL_ID is the fallback when the user hasn't chosen.
//   2. Similar prompts / ideas — one-shot muse candidates, independent of the
//      user's story-model choice.
//   3. Taste distillation — cheap offline pass that turns liked passages into
//      sensibility statements.

export const DEFAULT_MODEL_ID = 'deepseek/deepseek-v4-pro'

export const SIMILAR_MODEL_ID = 'deepseek/deepseek-v4-pro'

export const TASTE_MODEL_ID = 'deepseek/deepseek-v4-pro'

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
