import { useSyncExternalStore } from 'react'

export const READING_SPEED_OPTIONS = [
  { id: 'slow', label: 'slow', unitsPerSecond: 30 },
  { id: 'normal', label: 'normal', unitsPerSecond: 50 },
  { id: 'fast', label: 'fast', unitsPerSecond: 70 },
] as const

export type ReadingSpeedId = (typeof READING_SPEED_OPTIONS)[number]['id']

const STORAGE_KEY = 'piece:reading-speed'
const DEFAULT_READING_SPEED_ID: ReadingSpeedId = 'normal'
const listeners = new Set<() => void>()

function isReadingSpeedId(value: string | null): value is ReadingSpeedId {
  return READING_SPEED_OPTIONS.some(option => option.id === value)
}

function getReadingSpeedIdSnapshot(): ReadingSpeedId {
  if (typeof window === 'undefined') return DEFAULT_READING_SPEED_ID

  const stored = window.localStorage.getItem(STORAGE_KEY)
  return isReadingSpeedId(stored) ? stored : DEFAULT_READING_SPEED_ID
}

function subscribeToReadingSpeed(callback: () => void) {
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

export function setReadingSpeedId(id: ReadingSpeedId) {
  if (typeof window === 'undefined') return

  window.localStorage.setItem(STORAGE_KEY, id)
  listeners.forEach(listener => listener())
}

export function useReadingSpeedId() {
  return useSyncExternalStore(
    subscribeToReadingSpeed,
    getReadingSpeedIdSnapshot,
    () => DEFAULT_READING_SPEED_ID,
  )
}

export function useReadingSpeedUnitsPerSecond() {
  const readingSpeedId = useReadingSpeedId()
  return READING_SPEED_OPTIONS.find(option => option.id === readingSpeedId)?.unitsPerSecond ?? 40
}
