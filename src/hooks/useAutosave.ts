import { useCallback, useEffect, useRef, useState } from 'react'

// idle: nothing changed since the screen loaded, so nothing has been saved by it.
export type AutosaveStatus = 'idle' | 'saved' | 'saving' | 'error'

// How long typing has to pause before the change is sent.
const AUTOSAVE_DELAY_MS = 800

// Saves `value` whenever it changes, once typing pauses. The first non-null value is what was
// loaded, so it counts as saved. Saves run one at a time, in order; a failed one is retried while
// the screen is open, and a change still waiting when the screen unmounts is sent on the way out.
// `flush` sends any waiting change now and resolves once everything is saved — call it before
// acting on the saved state (e.g. Publish).
export function useAutosave<T>(value: T | null, save: (value: T) => Promise<unknown>) {
  const [status, setStatus] = useState<AutosaveStatus>('idle')
  const savedRef = useRef<string | null>(null)
  const pendingRef = useRef<T | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chainRef = useRef<Promise<unknown>>(Promise.resolve())
  const mountedRef = useRef(true)
  const saveRef = useRef(save)
  saveRef.current = save

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const next = pendingRef.current
    if (next === null) return chainRef.current
    pendingRef.current = null
    const json = JSON.stringify(next)
    const run = chainRef.current.then(() => saveRef.current(next))
    chainRef.current = run.then(
      () => {
        savedRef.current = json
        if (pendingRef.current === null) setStatus('saved')
      },
      () => {
        setStatus('error')
        // Try again while the screen is open, unless a newer change is already on its way.
        if (!mountedRef.current || pendingRef.current !== null) return
        pendingRef.current = next
        if (!timerRef.current) timerRef.current = setTimeout(() => void flush().catch(() => { }), AUTOSAVE_DELAY_MS)
      },
    )
    return run
  }, [])

  useEffect(() => {
    if (value === null) return
    const json = JSON.stringify(value)
    if (savedRef.current === null) {
      savedRef.current = json
      return
    }
    if (json === savedRef.current && pendingRef.current === null) return
    pendingRef.current = value
    setStatus('saving')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => void flush().catch(() => { }), AUTOSAVE_DELAY_MS)
  }, [value, flush])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      void flush().catch(() => { })
    }
  }, [flush])

  return { status, flush }
}
