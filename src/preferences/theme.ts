import { createPreference } from './createPreference'

export const THEME_OPTIONS = [
  { id: 'light', label: 'Light', icon: 'sun' },
  { id: 'dark', label: 'Dark', icon: 'moon' },
] as const

export type ThemeId = (typeof THEME_OPTIONS)[number]['id']

const DEFAULT_THEME_ID: ThemeId = 'dark'

function isThemeId(value: unknown): value is ThemeId {
  return THEME_OPTIONS.some(option => option.id === value)
}

function applyThemeId(id: ThemeId) {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', id === 'dark')
}

const themePreference = createPreference<ThemeId>({
  key: 'piece:theme',
  defaultValue: DEFAULT_THEME_ID,
  parse: raw => (isThemeId(raw) ? raw : DEFAULT_THEME_ID),
  onChange: applyThemeId,
})

export const setThemeId = themePreference.set
export const useThemeId = themePreference.use

export function initializeTheme() {
  applyThemeId(themePreference.get())
}
