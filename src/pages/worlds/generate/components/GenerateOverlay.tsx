import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Pause, Play } from 'lucide-react'
import type { GenerationPhase } from '@/hooks/useGeneration'
import { useUiText } from '@/i18n'
import type { ReadingFont } from '@/preferences/readingFont'
import type { ReadingFontSize } from '@/preferences/readingFontSize'
import {
  READING_SPEED_BY_ID,
  READING_SPEED_OPTIONS,
  setReadingSpeed,
  useReadingSpeed,
} from '@/preferences/readingSpeed'
import GenerateOutput from './GenerateOutput'
import { useGatedReveal } from '../hooks/useGatedReveal'
import { buildExpandPrefix } from '../paragraphs'

interface GenerateOverlayProps {
  output: string
  phase: GenerationPhase
  displayComplete: boolean
  provider: string
  error: string
  readingFont: ReadingFont
  readingFontSize: ReadingFontSize
  onSave: (text: string) => void
  onExit: () => void
  onExpand: (priorText: string) => void
}

export default function GenerateOverlay({
  output,
  phase,
  displayComplete,
  provider,
  error,
  readingFont,
  readingFontSize,
  onSave,
  onExit,
  onExpand,
}: GenerateOverlayProps) {
  const t = useUiText()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [paused, setPaused] = useState(false)
  // When the reveal catches up to the end, freeze the text so it stays put.
  const [frozenText, setFrozenText] = useState<string | null>(null)
  const [selectedParagraphIndex, setSelectedParagraphIndex] = useState<number | null>(null)
  // Bumped on each expansion so the reveal jumps past the kept prefix instantly.
  const [revealEpoch, setRevealEpoch] = useState(0)
  const [baselineRevealed, setBaselineRevealed] = useState(0)
  const readingSpeed = useReadingSpeed()
  const speedOption = READING_SPEED_BY_ID[readingSpeed]

  const cycleSpeed = () => {
    const index = READING_SPEED_OPTIONS.findIndex(o => o.id === readingSpeed)
    const next = READING_SPEED_OPTIONS[(index + 1) % READING_SPEED_OPTIONS.length]
    setReadingSpeed(next.id)
  }

  const { revealedText, revealComplete } = useGatedReveal({
    buffer: output,
    backendComplete: displayComplete,
    active: !paused && !error && frozenText === null,
    unitsPerSecond: speedOption.unitsPerSecond,
    revealEpoch,
    baselineRevealed,
  })
  const revealedTextRef = useRef('')
  revealedTextRef.current = revealedText

  useEffect(() => {
    if (revealComplete && frozenText === null) {
      setFrozenText(revealedTextRef.current)
    }
  }, [revealComplete, frozenText])

  const finished = frozenText !== null
  const displayText = frozenText ?? revealedText
  // Pause is only meaningful while text is still revealing.
  const canPause = !finished && !error
  // Save is allowed once the reader has stopped the flow (paused) or it ended.
  const canSave = (paused || finished) && !error && displayText.length > 0
  // Paragraphs can be selected (to expand) only while the text is stationary.
  const canSelect = (paused || finished) && !error && displayText.length > 0

  useEffect(() => {
    if (!canSelect) setSelectedParagraphIndex(null)
  }, [canSelect])

  const handleExpand = (paragraphIndex: number) => {
    const priorText = buildExpandPrefix(displayText, paragraphIndex)
    setBaselineRevealed(priorText.length)
    setRevealEpoch(epoch => epoch + 1)
    setFrozenText(null)
    setPaused(false)
    setSelectedParagraphIndex(null)
    onExpand(priorText)
  }

  // Keep the newest line in view while actively revealing. Stop following once
  // paused (so the reader can scroll back freely) or once finished.
  useEffect(() => {
    if (paused || finished) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [displayText, paused, finished])

  return createPortal(
    <div
      className="fixed inset-0 z-60 flex flex-col select-none bg-paper [-webkit-touch-callout:none]"
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-6"
      >
        {error ? (
          <p className="mx-auto mt-[30vh] max-w-md rounded-md border border-rose/40 bg-rose-pale px-3 py-2 text-center text-sm text-rose-deep">
            {error}
          </p>
        ) : (
          <GenerateOutput
            output={displayText}
            phase={phase}
            streaming={!finished}
            provider={provider}
            readingFont={readingFont}
            readingFontSize={readingFontSize}
            selectable={canSelect}
            selectedParagraphIndex={selectedParagraphIndex}
            onSelectParagraph={setSelectedParagraphIndex}
            renderParagraphAction={index => (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => handleExpand(index)}
                  className="inline-flex h-8 items-center justify-center rounded-full bg-rose px-3.5 font-serif-zh text-[13px] italic leading-none text-white transition-opacity active:opacity-80"
                >
                  {t.expand}
                </button>
              </div>
            )}
          />
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-rose-line/70 bg-paper px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className={`flex items-center gap-1 ${canPause ? '' : 'pointer-events-none invisible'}`}>
          <button
            type="button"
            aria-label={paused ? t.resume : t.pause}
            onClick={() => setPaused(p => !p)}
            className="inline-flex h-10 w-10 items-center justify-center text-ink-3 transition-opacity active:text-ink active:opacity-70"
          >
            {paused
              ? <Play aria-hidden="true" className="h-5 w-5 fill-current" />
              : <Pause aria-hidden="true" className="h-5 w-5 fill-current" />}
          </button>
          <button
            type="button"
            aria-label={`${t.speed}: ${speedOption.label}`}
            onClick={cycleSpeed}
            className="inline-flex h-8 min-w-9 items-center justify-center rounded-full px-2 font-serif-zh text-[14px] italic leading-none text-ink-3 transition-colors active:text-ink active:opacity-70"
          >
            {speedOption.label}
          </button>
        </div>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onExit}
            className="font-serif-zh text-[13px] italic leading-none text-ink-3 underline decoration-ink-4/50 underline-offset-4 transition-colors active:text-ink active:opacity-70"
          >
            {t.exitWithoutSaving}
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={() => onSave(displayText)}
            className="inline-flex h-9 items-center justify-center rounded-full bg-rose px-4 font-serif-zh text-[14px] italic leading-none text-white transition-opacity disabled:opacity-30 active:opacity-80"
          >
            {t.saveAndExit}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
