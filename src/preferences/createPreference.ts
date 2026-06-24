import { useSyncExternalStore } from 'react'

export interface PreferenceConfig<T> {
  key: string
  defaultValue: T
  parse: (raw: string | null) => T
  serialize?: (value: T) => string
  onChange?: (value: T) => void
}

export interface Preference<T> {
  get: () => T
  set: (value: T) => void
  use: () => T
}

export function createPreference<T>(config: PreferenceConfig<T>): Preference<T> {
  const { key, defaultValue, parse, serialize = String, onChange } = config
  const listeners = new Set<() => void>()

  // Cache the parsed value keyed by the raw string so `read` returns a STABLE reference
  // while storage is unchanged. useSyncExternalStore loops forever if getSnapshot hands
  // back a fresh object every render, which object-valued preferences otherwise would.
  let cachedRaw: string | null = null
  let cachedValue: T = defaultValue
  let hasCache = false

  function read(): T {
    if (typeof window === 'undefined') return defaultValue
    const raw = window.localStorage.getItem(key)
    if (hasCache && raw === cachedRaw) return cachedValue
    cachedRaw = raw
    cachedValue = parse(raw)
    hasCache = true
    return cachedValue
  }

  function notify() {
    listeners.forEach(listener => listener())
  }

  function subscribe(callback: () => void) {
    listeners.add(callback)

    function handleStorage(event: StorageEvent) {
      if (event.key !== key && event.key !== null) return
      onChange?.(read())
      callback()
    }

    if (typeof window !== 'undefined') window.addEventListener('storage', handleStorage)

    return () => {
      listeners.delete(callback)
      if (typeof window !== 'undefined') window.removeEventListener('storage', handleStorage)
    }
  }

  function set(value: T) {
    if (typeof window === 'undefined') return

    const normalized = parse(serialize(value))
    window.localStorage.setItem(key, serialize(normalized))
    onChange?.(normalized)
    notify()
  }

  function use() {
    return useSyncExternalStore(subscribe, read, () => defaultValue)
  }

  return { get: read, set, use }
}
