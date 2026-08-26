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

// Talking — about a world, or about a prompt being worked out — is its own job with its own
// model, chosen for how it converses rather than for what it writes. Where it starts, not where
// it stays: the reader picks from the same MODELS list, and one choice covers all three threads.
export const DEFAULT_CHAT_MODEL_ID = 'z-ai/glm-5.2'

// Distilling a taste profile is its own job with its own demands, so it holds its own pin rather
// than riding along with the chat's — the two happen to name the same model today, and either
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

// One key for every chat thread: which model you talk to is a habit, not a per-conversation
// decision, and switching it on the world chat switches it on the prompt chats too.
const chatModelPreference = createPreference<string>({
  key: 'piece:chat-model',
  defaultValue: DEFAULT_CHAT_MODEL_ID,
  parse: raw => (isModelId(raw) ? raw : DEFAULT_CHAT_MODEL_ID),
})

export const setChatModel = chatModelPreference.set
export const useChatModel = chatModelPreference.use
