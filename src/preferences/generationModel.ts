import { DEFAULT_MODEL_ID, MODELS } from '../config'
import { createPreference } from './createPreference'

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
