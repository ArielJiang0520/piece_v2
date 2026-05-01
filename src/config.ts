export interface ModelOption {
  id: string
  label: string
}

export const MODELS: ModelOption[] = [
  { id: 'deepseek/deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
  { id: 'z-ai/glm-5', label: 'GLM 5' },
]

export const DEFAULT_MODEL_ID = MODELS[0]!.id
