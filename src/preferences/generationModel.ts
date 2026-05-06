import { useSyncExternalStore } from 'react'
import { DEFAULT_MODEL_ID, MODELS } from '../config'

const STORAGE_KEY = 'piece:generation-model'
const listeners = new Set<() => void>()

function isModelId(value: string | null): value is string {
  return MODELS.some(model => model.id === value)
}

function getGenerationModelSnapshot() {
  if (typeof window === 'undefined') return DEFAULT_MODEL_ID

  const stored = window.localStorage.getItem(STORAGE_KEY)
  return isModelId(stored) ? stored : DEFAULT_MODEL_ID
}

function subscribeToGenerationModel(callback: () => void) {
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

export function setGenerationModel(model: string) {
  if (typeof window === 'undefined') return

  window.localStorage.setItem(STORAGE_KEY, isModelId(model) ? model : DEFAULT_MODEL_ID)
  listeners.forEach(listener => listener())
}

export function useGenerationModel() {
  return useSyncExternalStore(
    subscribeToGenerationModel,
    getGenerationModelSnapshot,
    () => DEFAULT_MODEL_ID,
  )
}
