import { createPreference } from './createPreference'

export const LANGUAGE_OPTIONS = [
  { id: 'en', label: 'English', shortLabel: 'EN' },
  { id: 'zh', label: '中文', shortLabel: '中' },
] as const

export type LanguageId = (typeof LANGUAGE_OPTIONS)[number]['id']

export const DEFAULT_LANGUAGE_ID: LanguageId = 'en'

function isLanguageId(value: unknown): value is LanguageId {
  return LANGUAGE_OPTIONS.some(option => option.id === value)
}

function applyLanguageId(id: LanguageId) {
  if (typeof document === 'undefined') return
  document.documentElement.lang = id === 'zh' ? 'zh-Hans' : 'en'
}

const languagePreference = createPreference<LanguageId>({
  key: 'piece:language',
  defaultValue: DEFAULT_LANGUAGE_ID,
  parse: raw => (isLanguageId(raw) ? raw : DEFAULT_LANGUAGE_ID),
  onChange: applyLanguageId,
})

export const setLanguageId = languagePreference.set
export const useLanguageId = languagePreference.use

export function initializeLanguage() {
  applyLanguageId(languagePreference.get())
}
