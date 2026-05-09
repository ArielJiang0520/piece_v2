import { useCallback, useEffect, useId, useState } from 'react'
import { X } from 'lucide-react'
import type { GenerationPhase } from '@/hooks/useGeneration'
import type { ReadingFont } from '@/preferences/readingFont'
import type { ReadingFontSize } from '@/preferences/readingFontSize'
import SettingsPanel from './SettingsPanel'
import ModelSelector from './ModelSelector'
import { entityLabel } from '@/config'

interface GenerateControlsProps {
  phase: GenerationPhase
  streaming: boolean
  settingsOpen: boolean
  disabled: boolean
  hasExistingPieces: boolean
  model: string
  onModelChange: (model: string) => void
  readingSpeed: number
  onReadingSpeedChange: (readingSpeed: number) => void
  readingFont: ReadingFont
  onReadingFontChange: (readingFont: ReadingFont) => void
  readingFontSize: ReadingFontSize
  onReadingFontSizeChange: (readingFontSize: ReadingFontSize) => void
  onGenerate: () => void
  onToggleSettings: () => void
  onCloseSettings: () => void
  onStop: () => void
}

const iconButtonClass =
  'inline-flex h-13 shrink-0 items-center justify-center rounded-full border border-rose-line bg-paper px-4 font-serif-zh text-[15px] italic leading-none text-rose-deep transition-colors hover:border-rose/40 hover:bg-rose-pale focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30 disabled:pointer-events-none disabled:opacity-50'
const activeIconButtonClass = 'border-rose/40 bg-rose-pale text-rose-deep'
const floatingSettingsButtonClass = 'fixed bottom-7 right-5 z-50 sm:right-7'
const floatingStopButtonClass =
  'fixed bottom-7 left-1/2 z-40 grid h-14 w-14 -translate-x-1/2 place-items-center rounded-full border border-rose-line bg-paper text-ink shadow-(--shadow-feather) transition-all hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-ink-4/20'

export default function GenerateControls({
  phase,
  streaming,
  settingsOpen,
  disabled,
  hasExistingPieces,
  model,
  onModelChange,
  readingSpeed,
  onReadingSpeedChange,
  readingFont,
  onReadingFontChange,
  readingFontSize,
  onReadingFontSizeChange,
  onGenerate,
  onToggleSettings,
  onCloseSettings,
  onStop,
}: GenerateControlsProps) {
  const settingsPanelId = useId()
  const [settingsRendered, setSettingsRendered] = useState(settingsOpen)
  const [settingsEntered, setSettingsEntered] = useState(settingsOpen)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const settingsVisible = settingsOpen && settingsEntered
  const handleModelMenuOpenChange = useCallback((open: boolean) => {
    setModelMenuOpen(open)
  }, [])

  useEffect(() => {
    if (!settingsOpen) return

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onCloseSettings()
    }

    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onCloseSettings, settingsOpen])

  useEffect(() => {
    if (settingsOpen) {
      setSettingsRendered(true)
      const frame = window.requestAnimationFrame(() => setSettingsEntered(true))
      return () => window.cancelAnimationFrame(frame)
    }

    setSettingsEntered(false)
    const timeout = window.setTimeout(() => setSettingsRendered(false), 220)
    return () => window.clearTimeout(timeout)
  }, [settingsOpen])

  return (
    <>
      {streaming && (
        <button
          type="button"
          className={floatingStopButtonClass}
          onClick={onStop}
          aria-label="Stop generation"
          title="Stop generation"
        >
          <X className="h-6 w-6" aria-hidden="true" />
        </button>
      )}

      <div className={`sticky top-16 mt-2 bg-paper/0 py-3 ${modelMenuOpen ? 'z-50' : 'z-10'}`}>
        <div className="flex items-center">
          <div className="flex min-w-0 flex-1 items-center rounded-full border border-rose-line bg-paper/70 p-0.5 shadow-(--shadow-feather) transition-all duration-200 focus-within:ring-4 focus-within:ring-rose/15">
            <button
              type="button"
              className="inline-flex h-10 min-w-0 flex-1 items-center justify-center rounded-full bg-rose px-5 font-serif-zh text-[15px] italic leading-none text-white shadow-(--shadow-cta) transition-all duration-200 hover:-translate-y-px hover:bg-rose-deep hover:shadow-(--shadow-cta-hover) focus:outline-none disabled:pointer-events-none disabled:opacity-50 sm:px-6"
              onClick={onGenerate}
              disabled={disabled}
            >
              <span className="min-w-0 truncate">{generateButtonLabel(phase, hasExistingPieces)}</span>
            </button>

            <ModelSelector
              model={model}
              onModelChange={onModelChange}
              disabled={streaming}
              closeMenu={settingsOpen}
              onMenuOpenChange={handleModelMenuOpenChange}
            />
          </div>
        </div>
      </div>

      <div className={floatingSettingsButtonClass}>
        <button
          type="button"
          className={`relative z-50 ${iconButtonClass} ${settingsOpen ? activeIconButtonClass : ''}`}
          onClick={onToggleSettings}
          aria-label={settingsOpen ? 'Close reading settings' : 'Open reading settings'}
          title={settingsOpen ? 'Close reading settings' : 'Open reading settings'}
          aria-expanded={settingsOpen}
          aria-controls={settingsPanelId}
        >
          <span aria-hidden="true" className="font-serif-zh text-[15px] italic leading-none">
            Aa
          </span>
        </button>

        {settingsRendered && (
          <>
            <div
              className={`fixed inset-0 z-40 bg-transparent transition-opacity duration-220 ${settingsVisible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
              onClick={onCloseSettings}
              aria-hidden="true"
            />

            <div
              id={settingsPanelId}
              className={`absolute bottom-full right-0 z-50 mb-2 w-[min(19rem,calc(100vw-2rem))] origin-bottom-right rounded-md border border-rose-line bg-paper/95 p-3 shadow-(--shadow-menu) transition-[opacity,transform] duration-220 ease-out ${settingsVisible ? 'translate-y-0 scale-100 opacity-100' : 'pointer-events-none translate-y-1 scale-[0.98] opacity-0'}`}
              role="dialog"
              aria-modal="false"
              aria-label="Reading settings"
              aria-hidden={!settingsOpen}
            >
              <span
                aria-hidden="true"
                className="absolute -bottom-1.75 right-4 h-3.5 w-3.5 rotate-45 border-b border-r border-rose-line bg-paper"
              />
              <SettingsPanel
                open={settingsRendered}
                readingSpeed={readingSpeed}
                onReadingSpeedChange={onReadingSpeedChange}
                readingFont={readingFont}
                onReadingFontChange={onReadingFontChange}
                readingFontSize={readingFontSize}
                onReadingFontSizeChange={onReadingFontSizeChange}
              />
            </div>
          </>
        )}
      </div>
    </>
  )
}

function generateButtonLabel(phase: GenerationPhase, hasExistingPieces: boolean) {
  if (phase === 'waiting_provider') return 'Waiting...'
  if (phase === 'thinking') return 'Thinking...'
  if (phase === 'writing') return 'Writing...'
  if (!hasExistingPieces) return `Write first ${entityLabel('piece')}`
  return `Write another ${entityLabel('piece')}`
}
