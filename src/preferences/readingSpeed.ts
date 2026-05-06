import { useSyncExternalStore } from 'react'

const SPEED_STORAGE_KEY = 'piece:reading-speed'
export const DEFAULT_READING_SPEED_UNITS_PER_SECOND = 50
export const MIN_READING_SPEED_UNITS_PER_SECOND = 20
export const MAX_READING_SPEED_UNITS_PER_SECOND = 100
export const READING_SPEED_STEP = 10
const listeners = new Set<() => void>()

function clampReadingSpeed(value: number) {
  const steppedValue = Math.round(value / READING_SPEED_STEP) * READING_SPEED_STEP

  return Math.min(
    MAX_READING_SPEED_UNITS_PER_SECOND,
    Math.max(MIN_READING_SPEED_UNITS_PER_SECOND, steppedValue),
  )
}

function parseReadingSpeed(value: string | null) {
  if (!value) return DEFAULT_READING_SPEED_UNITS_PER_SECOND

  const numericValue = Number(value)
  return Number.isFinite(numericValue)
    ? clampReadingSpeed(numericValue)
    : DEFAULT_READING_SPEED_UNITS_PER_SECOND
}

function getReadingSpeedSnapshot() {
  if (typeof window === 'undefined') return DEFAULT_READING_SPEED_UNITS_PER_SECOND
  return parseReadingSpeed(window.localStorage.getItem(SPEED_STORAGE_KEY))
}

function subscribeToReadingSpeed(callback: () => void) {
  listeners.add(callback)

  function handleStorage(event: StorageEvent) {
    if (event.key === SPEED_STORAGE_KEY || event.key === null) callback()
  }

  if (typeof window !== 'undefined') window.addEventListener('storage', handleStorage)

  return () => {
    listeners.delete(callback)
    if (typeof window !== 'undefined') window.removeEventListener('storage', handleStorage)
  }
}

export function setReadingSpeedUnitsPerSecond(unitsPerSecond: number) {
  if (typeof window === 'undefined') return

  window.localStorage.setItem(SPEED_STORAGE_KEY, String(clampReadingSpeed(unitsPerSecond)))
  listeners.forEach(listener => listener())
}

export function useReadingSpeedUnitsPerSecond() {
  return useSyncExternalStore(
    subscribeToReadingSpeed,
    getReadingSpeedSnapshot,
    () => DEFAULT_READING_SPEED_UNITS_PER_SECOND,
  )
}
