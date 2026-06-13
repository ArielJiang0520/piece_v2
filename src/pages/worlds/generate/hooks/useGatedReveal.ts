import { useEffect, useRef, useState } from 'react'
import { sliceByUnits } from '@/utils/textUnits'

// Fixed, intentionally non-user-configurable reveal speed (non-whitespace
// characters per second) while a finger is held on the screen.
const REVEAL_UNITS_PER_SECOND = 20

interface UseGatedRevealOptions {
  buffer: string
  backendComplete: boolean
  active: boolean
}

/**
 * Walks through `buffer` at a fixed speed, but only while `active` is true
 * (finger down). Releasing freezes the reveal instantly. The reveal is
 * considered complete once the backend has finished and every buffered
 * character has been revealed.
 */
export function useGatedReveal({ buffer, backendComplete, active }: UseGatedRevealOptions) {
  const [revealedChars, setRevealedChars] = useState(0)
  const bufferRef = useRef(buffer)
  bufferRef.current = buffer

  // Restart the reveal whenever a new generation begins (buffer resets/shrinks).
  const previousBufferRef = useRef(buffer)
  if (!buffer.startsWith(previousBufferRef.current)) {
    setRevealedChars(0)
  }
  previousBufferRef.current = buffer

  useEffect(() => {
    if (!active) return

    let frame = 0
    let lastTime = performance.now()
    let unitCredit = 0

    function step(now: number) {
      const elapsed = Math.max(0, now - lastTime)
      lastTime = now
      unitCredit += (REVEAL_UNITS_PER_SECOND * elapsed) / 1000

      const wholeUnits = Math.floor(unitCredit)
      if (wholeUnits > 0) {
        unitCredit -= wholeUnits
        setRevealedChars(current => {
          const remaining = bufferRef.current.slice(current)
          if (!remaining) return current
          const { visible } = sliceByUnits(remaining, wholeUnits)
          return current + visible.length
        })
      }

      frame = requestAnimationFrame(step)
    }

    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [active])

  const clampedRevealed = Math.min(revealedChars, buffer.length)
  const revealedText = buffer.slice(0, clampedRevealed)
  const revealComplete = backendComplete && clampedRevealed >= buffer.length && buffer.length > 0

  return { revealedText, revealComplete }
}
