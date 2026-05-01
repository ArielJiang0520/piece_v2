export interface ModelOption {
  id: string
  label: string
  reasoning: {
    effort: 'low' | 'high'
  }
}

export const MODELS: ModelOption[] = [
  { id: 'deepseek/deepseek-v4-flash', label: 'DeepSeek V4 Flash', reasoning: { effort: 'high' } },
  { id: 'deepseek/deepseek-v4-pro', label: 'DeepSeek V4 Pro', reasoning: { effort: 'high' } },
  { id: 'z-ai/glm-5', label: 'GLM 5', reasoning: { effort: 'low' } },
  { id: 'z-ai/glm-5.1', label: 'GLM 5.1', reasoning: { effort: 'low' } },
]

export const DEFAULT_MODEL_ID = MODELS[0]!.id
export const PROMPT_SUGGESTION_MODEL_ID = DEFAULT_MODEL_ID
