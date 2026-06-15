import { useCallback, useEffect, useRef, useState } from 'react'
import { useUiText, type UiText } from '@/i18n'
import { useLanguageId, type LanguageId } from '@/preferences/language'
import ModelSelector from './ModelSelector'
import { entityLabel } from '@/config'

interface GenerateControlsProps {
  disabled: boolean
  hasExistingPieces: boolean
  model: string
  onModelChange: (model: string) => void
  onGenerate: () => void
  stickyTopOffset?: number
}

const CTA_DOCK_HYSTERESIS_PX = 32

export default function GenerateControls({
  disabled,
  hasExistingPieces,
  model,
  onModelChange,
  onGenerate,
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
              <span className="min-w-0 truncate">{generateButtonLabel(hasExistingPieces, t, language)}</span>
            </button>
          </div>
        </div>
      </div>

      <div className={`relative flex items-center justify-center ${modelMenuOpen ? 'z-50' : 'z-0'}`}>
        <div className="flex w-[78%] max-w-md min-w-0 flex-col items-center">
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

function generateButtonLabel(
  hasExistingPieces: boolean,
  t: UiText,
  language: LanguageId,
) {
  const piece = entityLabel('piece', {}, language)
  if (!hasExistingPieces) return t.firstPiece(piece)
  return t.anotherPiece(piece)
}
