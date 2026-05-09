import { createPreference } from './createPreference'

export interface ModelOption {
  id: string
  label: string
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
    attributes: { speed: 1, quality: 3, cost: 3 },
    reasoning: { effort: 'none' },
    preferredProviders: ['parasail/fp8'],
  },
  {
    id: 'deepseek/deepseek-v4-flash',
    label: 'DeepSeek V4 Flash',
    attributes: { speed: 3, quality: 1, cost: 1 },
    reasoning: { effort: 'none' },
    preferredProviders: ['parasail/fp8'],
  },
  {
    id: 'z-ai/glm-5',
    label: 'GLM 5',
    attributes: { speed: 3, quality: 2, cost: 2 },
    reasoning: { effort: 'none' },
    preferredProviders: ['friendli'],
  },
  {
    id: 'z-ai/glm-5.1',
    label: 'GLM 5.1',
    attributes: { speed: 1, quality: 3, cost: 3 },
    reasoning: { effort: 'none' },
    preferredProviders: ['friendli'],
  }
]

export const DEFAULT_MODEL_ID = 'deepseek/deepseek-v4-pro'

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
