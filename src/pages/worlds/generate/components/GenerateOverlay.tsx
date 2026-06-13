import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import type { GenerationPhase } from '@/hooks/useGeneration'
import { useUiText } from '@/i18n'
import type { ReadingFont } from '@/preferences/readingFont'
import type { ReadingFontSize } from '@/preferences/readingFontSize'
import OutputPanel from './OutputPanel'
import { useGatedReveal } from '../hooks/useGatedReveal'

interface GenerateOverlayProps {
  output: string
  phase: GenerationPhase
  displayComplete: boolean
  provider: string
  error: string
  pieceMetaLabel: string | null
  pieceModelLabel: string | null
  pieceFooterStatsLabel: string | null
  pieceNumber: number | null
  readingFont: ReadingFont
  readingFontSize: ReadingFontSize
  onRevealComplete: () => void
  onExit: (committed: boolean) => void
}

export default function GenerateOverlay({
  output,
  phase,
  displayComplete,
  provider,
  error,
  pieceMetaLabel,
  pieceModelLabel,
  pieceFooterStatsLabel,
  pieceNumber,
  readingFont,
  readingFontSize,
  onRevealComplete,
  onExit,
}: GenerateOverlayProps) {
  const t = useUiText()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(false)
  // Once the reader finishes, saving navigates + resets the live buffer to ''.
  // Freeze the finished text so the overlay keeps showing it until they exit.
  const [frozenText, setFrozenText] = useState<string | null>(null)
  const revealCompleteFiredRef = useRef(false)

  const { revealedText, revealComplete } = useGatedReveal({
    buffer: output,
    backendComplete: displayComplete,
    // active: active && !error && frozenText === null,
    // Inverted control: holding the screen pauses; releasing auto-streams.
    active: !active && !error && frozenText === null,
  })
  const revealedTextRef = useRef('')
  revealedTextRef.current = revealedText

  useEffect(() => {
    if (revealComplete && !revealCompleteFiredRef.current) {
      revealCompleteFiredRef.current = true
      setFrozenText(revealedTextRef.current)
      setActive(false)
      onRevealComplete()
    }
  }, [revealComplete, onRevealComplete])

  const finished = frozenText !== null
  const displayText = frozenText ?? revealedText

  // Follow the newest text while it auto-streams. Skip when the finger is down
  // (holding pauses / the user is scrolling) and once the piece is finished.
  useEffect(() => {
    if (active || finished) return
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [displayText, active, finished])

  // Mouse/pen drive reveal via pointer events; touch is handled separately so
  // that scrolling (which cancels pointer events) still counts as "finger down".
  const handlePointerDown = useCallback((event: PointerEvent) => {
    if (event.pointerType === 'touch') return
    setActive(true)
  }, [])
  const handlePointerStop = useCallback((event: PointerEvent) => {
    if (event.pointerType === 'touch') return
    setActive(false)
  }, [])

  return createPortal(
    <div
      className="fixed inset-0 z-60 select-none bg-paper [-webkit-touch-callout:none]"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label={t.close}
        className="absolute right-3 top-3 z-10 inline-flex h-10 w-10 items-center justify-center text-ink-3 transition-opacity active:text-ink active:opacity-70"
        onClick={() => onExit(revealCompleteFiredRef.current)}
      >
        <X aria-hidden="true" className="h-5 w-5" />
      </button>

      <div
        ref={scrollRef}
        className="h-full overflow-y-auto overscroll-contain px-4 pt-14"
        onTouchStart={() => setActive(true)}
        onTouchEnd={() => setActive(false)}
        onTouchCancel={() => setActive(false)}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerStop}
        onPointerLeave={handlePointerStop}
        onPointerCancel={handlePointerStop}
      >
        {error ? (
          <p className="mx-auto mt-[30vh] max-w-md rounded-md border border-rose/40 bg-rose-pale px-3 py-2 text-center text-sm text-rose-deep">
            {error}
          </p>
        ) : (
          <OutputPanel
            output={displayText}
            phase={phase}
            streaming={!finished}
            displayComplete={finished}
            provider={provider}
            pieceMetaLabel={pieceMetaLabel}
            pieceModelLabel={pieceModelLabel}
            pieceFooterStatsLabel={pieceFooterStatsLabel}
            pieceNumber={pieceNumber}
            readingFont={readingFont}
            readingFontSize={readingFontSize}
            onScrollToTop={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
          />
        )}
      </div>
    </div>,
    document.body,
  )
}
