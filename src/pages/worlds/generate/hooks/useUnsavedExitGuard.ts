import { useCallback, useEffect } from 'react'
import { useBlocker } from 'react-router-dom'

// Guards the reading view against losing unsaved work. The reader lives at a pushed
// history entry (the `?reading=` param), so a phone back/swipe is a POP navigation —
// that's what we block, surfacing a confirm. Explicit close/save paths remove the
// param with a REPLACE navigation, which is deliberately not blocked. `beforeunload`
// covers refresh / tab close.
export function useUnsavedExitGuard(active: boolean) {
  const blocker = useBlocker(
    useCallback(({ historyAction }) => active && historyAction === 'POP', [active]),
  )

  // If the content gets saved while a back gesture is parked at the confirm, let it go.
  useEffect(() => {
    if (blocker.state === 'blocked' && !active) blocker.proceed()
  }, [blocker, active])

  useEffect(() => {
    if (!active) return
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [active])

  return {
    confirmOpen: blocker.state === 'blocked',
    confirmLeave: () => {
      if (blocker.state === 'blocked') blocker.proceed()
    },
    confirmStay: () => {
      if (blocker.state === 'blocked') blocker.reset()
    },
  }
}
