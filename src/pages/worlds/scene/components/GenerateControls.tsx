import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, Sparkles } from 'lucide-react'
import { useUiText, type UiText } from '@/i18n'
import ModelSelector from './ModelSelector'

interface GenerateControlsProps {
  disabled: boolean
  hasExistingStories: boolean
  model: string
  onModelChange: (model: string) => void
  onGenerate: () => void
  // When present, the pinned/docked CTA (shown once the button sticks to the top while a
  // story is scrolled into view) becomes "Resume" and continues the current story instead
  // of starting another. The resting big CTA is unaffected.
  onResume?: () => void
  stickyTopOffset?: number
}

const CTA_DOCK_HYSTERESIS_PX = 32

export default function GenerateControls({
  disabled,
  hasExistingStories,
  model,
  onModelChange,
  onGenerate,
  onResume,
  stickyTopOffset = 48,
}: GenerateControlsProps) {
  const t = useUiText()
  const ctaAnchorRef = useRef<HTMLDivElement>(null)
  const [ctaDocked, setCtaDocked] = useState(false)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const handleModelMenuOpenChange = useCallback((open: boolean) => {
    setModelMenuOpen(open)
  }, [])

  // Once docked, offer to continue the story being read rather than start another.
  const dockedResume = ctaDocked && !!onResume
  const ctaAction = dockedResume ? onResume : onGenerate
  const ctaLabel = dockedResume ? t.resume : hasExistingStories ? t.generateAgain : t.generate

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
      <div ref={ctaAnchorRef} aria-hidden="true" />
      <div
        className={`sticky z-10 bg-paper ${ctaDocked ? 'py-0' : 'pt-3 pb-2'}`}
        style={{ top: stickyTopOffset }}
      >
        <div
          className={`relative left-1/2 flex -translate-x-1/2 items-center justify-center ${ctaDocked
            ? 'w-screen max-w-none border-b border-line bg-surface px-4 py-2'
            : 'w-full'
            }`}
        >
          <button
            type="button"
            className={`btn btn-primary btn-block min-w-0 max-w-md ${ctaDocked ? '' : 'btn-lg shadow-(--shadow-float)'}`}
            onClick={ctaAction}
            disabled={disabled && !dockedResume}
          >
            {dockedResume ? <ArrowRight aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
            <span className="min-w-0 truncate">{ctaLabel}</span>
          </button>
        </div>
      </div>

      <div className={`relative flex items-center justify-center ${modelMenuOpen ? 'z-50' : 'z-0'}`}>
        <div className="mb-3 flex w-full min-w-0 flex-row items-center justify-center">
          <ModelSelector
            model={model}
            onModelChange={onModelChange}
            onMenuOpenChange={handleModelMenuOpenChange}
          />
        </div>
      </div>
    </>
  )
}

