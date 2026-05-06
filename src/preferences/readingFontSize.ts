import { useSyncExternalStore } from 'react'

export const READING_FONT_SIZE_OPTIONS = [
  { id: 'small', label: 'Small' },
  { id: 'medium', label: 'Medium' },
  { id: 'large', label: 'Large' },
] as const

export type ReadingFontSize = (typeof READING_FONT_SIZE_OPTIONS)[number]['id']

const STORAGE_KEY = 'piece:reading-font-size'
const DEFAULT_READING_FONT_SIZE: ReadingFontSize = 'medium'
const listeners = new Set<() => void>()

function isReadingFontSize(value: string | null): value is ReadingFontSize {
  return READING_FONT_SIZE_OPTIONS.some(option => option.id === value)
}

function getReadingFontSizeSnapshot() {
  if (typeof window === 'undefined') return DEFAULT_READING_FONT_SIZE

  const stored = window.localStorage.getItem(STORAGE_KEY)
  return isReadingFontSize(stored) ? stored : DEFAULT_READING_FONT_SIZE
}

function subscribeToReadingFontSize(callback: () => void) {
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

export function setReadingFontSize(fontSize: ReadingFontSize) {
  if (typeof window === 'undefined') return

  window.localStorage.setItem(STORAGE_KEY, fontSize)
  listeners.forEach(listener => listener())
}

export function useReadingFontSize() {
  return useSyncExternalStore(
    subscribeToReadingFontSize,
    getReadingFontSizeSnapshot,
    () => DEFAULT_READING_FONT_SIZE,
  )
}
