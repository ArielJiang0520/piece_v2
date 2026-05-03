import { useCallback, useRef } from 'react'

export function useScrollReturn<T>(
  storageKey: string | null | undefined,
  parseState: (value: unknown) => T | null,
) {
  const activeKeyRef = useRef<string | null>(null)
  const stateRef = useRef<T | null>(null)
  const scheduledRef = useRef(false)
  const key = storageKey ?? null

  if (activeKeyRef.current !== key) {
    activeKeyRef.current = key
    stateRef.current = readScrollReturnState(key, parseState)
    scheduledRef.current = false
  }

  const clear = useCallback(() => {
    if (!key) return

    try {
      sessionStorage.removeItem(key)
    } catch { }
    stateRef.current = null
  }, [key])

  const save = useCallback((state: T) => {
    if (!key) return

    try {
      sessionStorage.setItem(key, JSON.stringify(state))
    } catch { }
  }, [key])

  return { stateRef, scheduledRef, clear, save }
}

function readScrollReturnState<T>(
  key: string | null,
  parseState: (value: unknown) => T | null,
) {
  if (!key) return null

  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    return parseState(JSON.parse(raw))
  } catch {
    return null
  }
}
