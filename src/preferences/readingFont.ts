import { useSyncExternalStore } from 'react'

export type ReadingFont = 'serif' | 'mono'

const STORAGE_KEY = 'piece:reading-font'
const DEFAULT_READING_FONT: ReadingFont = 'serif'
const listeners = new Set<() => void>()

function isReadingFont(value: string | null): value is ReadingFont {
  return value === 'serif' || value === 'mono'
}

function getReadingFontSnapshot() {
  if (typeof window === 'undefined') return DEFAULT_READING_FONT

  const stored = window.localStorage.getItem(STORAGE_KEY)
  return isReadingFont(stored) ? stored : DEFAULT_READING_FONT
}

function subscribeToReadingFont(callback: () => void) {
  listeners.add(callback)

  function handleStorage(event: StorageEvent) {
    if (event.key === STORAGE_KEY || event.key === null) callback()
  }

  if (typeof window !== 'undefined') window.addEventListener('storage', handleStorage)

  return () => {
    listeners.delete(callback)
    if (typeof window !== 'undefined') window.removeEventListener('storage', handleStorage)
  }
}

export function setReadingFont(font: ReadingFont) {
  if (typeof window === 'undefined') return

  window.localStorage.setItem(STORAGE_KEY, font)
  listeners.forEach(listener => listener())
}

export function useReadingFont() {
  return useSyncExternalStore(
    subscribeToReadingFont,
    getReadingFontSnapshot,
    () => DEFAULT_READING_FONT,
  )
}
