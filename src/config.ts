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

export const DEFAULT_MODEL_ID = 'z-ai/glm-5'

export const ENTITY_LABELS = {
  world: 'world',
  prompt: 'scene',
  piece: 'take',
} as const

export type EntityKey = keyof typeof ENTITY_LABELS

export function entityLabel(
  key: EntityKey,
  options: { plural?: boolean; capitalize?: boolean } = {},
) {
  let label: string = ENTITY_LABELS[key]
  if (options.plural) label += 's'
  if (options.capitalize) label = label.charAt(0).toUpperCase() + label.slice(1)
  return label
}
