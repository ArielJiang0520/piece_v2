import { useCallback, useSyncExternalStore } from 'react'

const listeners = new Set<() => void>()

function sampleWorldTipKey(userId: number) {
  return `piece:user:${userId}:sample-world-tip-dismissed`
}

function read(userId: number | null | undefined) {
  if (typeof window === 'undefined' || userId == null) return false
  return window.localStorage.getItem(sampleWorldTipKey(userId)) === 'true'
}

function notify() {
  listeners.forEach(listener => listener())
}

export const dismissSampleWorldTip = (userId: number | null | undefined) => {
  if (typeof window === 'undefined' || userId == null) return
  window.localStorage.setItem(sampleWorldTipKey(userId), 'true')
  notify()
}

export function useSampleWorldTipDismissed(userId: number | null | undefined) {
  const subscribe = useCallback((callback: () => void) => {
    listeners.add(callback)

    function handleStorage(event: StorageEvent) {
      if (userId != null && event.key !== sampleWorldTipKey(userId) && event.key !== null) return
      callback()
    }

    if (typeof window !== 'undefined') window.addEventListener('storage', handleStorage)

    return () => {
      listeners.delete(callback)
      if (typeof window !== 'undefined') window.removeEventListener('storage', handleStorage)
    }
  }, [userId])
  const getSnapshot = useCallback(() => read(userId), [userId])

  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
