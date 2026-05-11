import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { GenerationPhase } from '@/hooks/useGeneration'
import { useUiText, type UiText } from '@/i18n'
import { useLanguageId, type LanguageId } from '@/preferences/language'
import ModelSelector from './ModelSelector'
import ReadingSpeedButton from './ReadingSpeedButton'
import { entityLabel } from '@/config'

interface GenerateControlsProps {
  phase: GenerationPhase
  streaming: boolean
  disabled: boolean
  hasExistingPieces: boolean
  model: string
  readingSpeed: number
  onModelChange: (model: string) => void
  onReadingSpeedChange: (readingSpeed: number) => void
  onGenerate: () => void
  onStop: () => void
  stickyTopOffset?: number
}

const floatingActionDockClass =
  'fixed inset-x-0 bottom-7 z-40 flex items-center justify-center gap-3 pointer-events-none'

const floatingActionButtonClass =
  'pointer-events-auto grid h-14 w-14 shrink-0 place-items-center rounded-full border border-rose-line bg-paper text-ink shadow-(--shadow-feather) transition-all hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-ink-4/20'

const CTA_DOCK_HYSTERESIS_PX = 32

export default function GenerateControls({
  phase,
  streaming,
  disabled,
  hasExistingPieces,
  model,
  readingSpeed,
  onModelChange,
  onReadingSpeedChange,
  onGenerate,
  onStop,
  stickyTopOffset = 48,
}: GenerateControlsProps) {
  const language = useLanguageId()
  const t = useUiText()
  const ctaAnchorRef = useRef<HTMLDivElement>(null)
  const [ctaDocked, setCtaDocked] = useState(false)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const handleModelMenuOpenChange = useCallback((open: boolean) => {
    setModelMenuOpen(open)
  }, [])

  useEffect(() => {
    let frame = 0

    function measureDockedState() {
      frame = 0
      const anchorTop = ctaAnchorRef.current?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY
      setCtaDocked(current => (
        current
          ? anchorTop <= stickyTopOffset + CTA_DOCK_HYSTERESIS_PX
          : anchorTop <= stickyTopOffset
      ))
    }

    function queueMeasure() {
      if (frame) return
      frame = window.requestAnimationFrame(measureDockedState)
    }

    measureDockedState()
    window.addEventListener('scroll', queueMeasure, { passive: true })
    window.addEventListener('resize', queueMeasure)

    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', queueMeasure)
      window.removeEventListener('resize', queueMeasure)
    }
  }, [stickyTopOffset])

  return (
    <>
      {streaming && (
        <div className={floatingActionDockClass}>
          <ReadingSpeedButton
            className={floatingActionButtonClass}
            readingSpeed={readingSpeed}
            onReadingSpeedChange={onReadingSpeedChange}
          />

          <button
            type="button"
            className={floatingActionButtonClass}
            onClick={onStop}
            aria-label={t.stopGeneration}
            title={t.stopGeneration}
          >
            <X className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>
      )}

      <div ref={ctaAnchorRef} aria-hidden="true" />
      <div
        className={`sticky z-10 bg-paper transition-[margin,padding] duration-200 ease-out ${ctaDocked ? 'mt-0 py-0' : 'mt-2 py-3'}`}
        style={{ top: stickyTopOffset }}
      >
        <div
          className={`relative left-1/2 flex -translate-x-1/2 items-center justify-center bg-paper transition-[width,max-width] duration-200 ease-out ${ctaDocked
            ? 'w-screen max-w-none'
            : 'w-[78%] max-w-md'
            }`}
        >
          <div
            className="flex w-full min-w-0 items-center justify-center"
          >
            <button
              type="button"
              className={`inline-flex min-w-0 items-center justify-center font-serif-zh text-[15px] italic leading-none opacity-100 transition-[background-color,border-color,border-radius,box-shadow,color,height,padding,width] duration-200 ease-out focus:outline-none disabled:pointer-events-none disabled:opacity-50 ${ctaDocked ? 'h-12 w-full rounded-none border-b border-rose-line bg-paper px-4 text-rose-deep shadow-none hover:bg-rose-tint' : 'h-10 w-full rounded-full bg-rose px-5 text-white shadow-(--shadow-cta) hover:bg-rose-deep sm:px-6'}`}
              onClick={onGenerate}
              disabled={disabled}
            >
              <span className="min-w-0 truncate">{generateButtonLabel(phase, hasExistingPieces, t, language)}</span>
            </button>
          </div>
        </div>
      </div>

      <div className={`relative flex items-center justify-center ${modelMenuOpen ? 'z-50' : 'z-0'}`}>
        <div className="flex w-[78%] max-w-md min-w-0 flex-col items-center">
          <ModelSelector
            model={model}
            onModelChange={onModelChange}
            disabled={streaming}
            closeMenu={false}
            onMenuOpenChange={handleModelMenuOpenChange}
          />
        </div>
      </div>
    </>
  )
}

function generateButtonLabel(
  phase: GenerationPhase,
  hasExistingPieces: boolean,
  t: UiText,
  language: LanguageId,
) {
  if (phase === 'waiting_provider') return t.waiting
  if (phase === 'thinking') return t.thinking
  if (phase === 'writing') return t.writing
  const piece = entityLabel('piece', {}, language)
  if (!hasExistingPieces) return t.firstPiece(piece)
  return t.anotherPiece(piece)
}
