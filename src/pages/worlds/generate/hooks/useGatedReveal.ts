import { useCallback, useEffect, useRef, useState } from 'react'
import { sliceByUnits } from '@/utils/textUnits'

// Default reveal speed (non-whitespace text units per second).
const DEFAULT_REVEAL_UNITS_PER_SECOND = 20

interface UseGatedRevealOptions {
  buffer: string
  backendComplete: boolean
  active: boolean
  unitsPerSecond?: number
  // Bump to jump the reveal to `baselineRevealed` chars (e.g. an expansion seeds
  // the buffer with an already-read prefix that should appear instantly).
  revealEpoch?: number
  baselineRevealed?: number
}

/**
 * Walks through `buffer` at `unitsPerSecond`, but only while `active` is true.
 * Pausing freezes the reveal instantly. The reveal is considered complete once
 * the backend has finished and every buffered character has been revealed.
 * Speed changes apply live without restarting the reveal.
 */
export function useGatedReveal({
  buffer,
  backendComplete,
  active,
  unitsPerSecond = DEFAULT_REVEAL_UNITS_PER_SECOND,
  revealEpoch = 0,
  baselineRevealed = 0,
}: UseGatedRevealOptions) {
  const [revealedChars, setRevealedChars] = useState(0)
  const bufferRef = useRef(buffer)
  bufferRef.current = buffer
  const speedRef = useRef(unitsPerSecond)
  speedRef.current = unitsPerSecond

  // An expansion bumps the epoch: treat the seeded prefix as already revealed so
  // only the new continuation paces in. Otherwise restart the reveal whenever a
  // new generation begins (buffer resets/shrinks).
  const previousBufferRef = useRef(buffer)
  const previousEpochRef = useRef(revealEpoch)
  if (revealEpoch !== previousEpochRef.current) {
    previousEpochRef.current = revealEpoch
    setRevealedChars(baselineRevealed)
  } else if (!buffer.startsWith(previousBufferRef.current)) {
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
      unitCredit += (speedRef.current * elapsed) / 1000

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

  // Drop the pacing and show everything buffered so far. Only meaningful once the backend
  // has finished — otherwise it would just catch up to a stream still arriving — so the
  // caller gates the control on `backendComplete`.
  const skipToEnd = useCallback(() => {
    setRevealedChars(bufferRef.current.length)
  }, [])

  const clampedRevealed = Math.min(revealedChars, buffer.length)
  const revealedText = buffer.slice(0, clampedRevealed)
  const revealComplete = backendComplete && clampedRevealed >= buffer.length && buffer.length > 0

  return { revealedText, revealComplete, skipToEnd }
}
