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
}

export const MODELS: ModelOption[] = [
  {
    id: 'deepseek/deepseek-v4-flash',
    label: 'DeepSeek V4 Flash',
    attributes: { speed: 3, quality: 2, cost: 1 },
    reasoning: { effort: 'none' },
  },
  {
    id: 'deepseek/deepseek-v4-pro',
    label: 'DeepSeek V4 Pro',
    attributes: { speed: 1, quality: 3, cost: 3 },
    reasoning: { effort: 'none' },
  },
  {
    id: 'z-ai/glm-5',
    label: 'GLM 5',
    attributes: { speed: 2, quality: 2, cost: 2 },
    reasoning: { effort: 'none' },
  },
  {
    id: 'z-ai/glm-5.1',
    label: 'GLM 5.1',
    attributes: { speed: 2, quality: 3, cost: 2 },
    reasoning: { effort: 'none' },
  },
  {
    id: 'deepseek/deepseek-v3.2',
    label: 'DeepSeek V3.2',
    attributes: { speed: 2, quality: 1, cost: 1 },
    reasoning: { effort: 'none' },
  },
]

export const DEFAULT_MODEL_ID = 'z-ai/glm-5'

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
