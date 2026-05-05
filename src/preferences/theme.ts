import { useSyncExternalStore } from 'react'

export const THEME_OPTIONS = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
] as const

export type ThemeId = (typeof THEME_OPTIONS)[number]['id']

const STORAGE_KEY = 'piece:theme'
const DEFAULT_THEME_ID: ThemeId = 'light'
const listeners = new Set<() => void>()

function isThemeId(value: string | null): value is ThemeId {
  return THEME_OPTIONS.some(option => option.id === value)
}

function applyThemeId(id: ThemeId) {
  if (typeof document === 'undefined') return

  document.documentElement.classList.toggle('dark', id === 'dark')
}

function getThemeIdSnapshot(): ThemeId {
  if (typeof window === 'undefined') return DEFAULT_THEME_ID

  const stored = window.localStorage.getItem(STORAGE_KEY)
  return isThemeId(stored) ? stored : DEFAULT_THEME_ID
}

function subscribeToTheme(callback: () => void) {
  listeners.add(callback)

  function handleStorage(event: StorageEvent) {
    if (event.key === STORAGE_KEY || event.key === null) {
      applyThemeId(getThemeIdSnapshot())
      callback()
    }
  }

  if (typeof window !== 'undefined') window.addEventListener('storage', handleStorage)

  return () => {
    listeners.delete(callback)
    if (typeof window !== 'undefined') window.removeEventListener('storage', handleStorage)
  }
}

export function initializeTheme() {
  applyThemeId(getThemeIdSnapshot())
}

export function setThemeId(id: ThemeId) {
  if (typeof window === 'undefined') return

  window.localStorage.setItem(STORAGE_KEY, id)
  applyThemeId(id)
  listeners.forEach(listener => listener())
}

export function useThemeId() {
  return useSyncExternalStore(
    subscribeToTheme,
    getThemeIdSnapshot,
    () => DEFAULT_THEME_ID,
  )
}
