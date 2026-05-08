import { useEffect, useId, useState } from 'react'
import { Settings, X } from 'lucide-react'
import type { GenerationPhase } from '@/hooks/useGeneration'
import type { ReadingFont } from '@/preferences/readingFont'
import type { ReadingFontSize } from '@/preferences/readingFontSize'
import SettingsPanel from './SettingsPanel'
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
  'flex size-15 shrink-0 items-center justify-center rounded-full bg-paper/85 text-ink-3 shadow-(--shadow-feather) transition-all duration-200 hover:-translate-y-px hover:text-ink focus:outline-none focus:ring-4 focus:ring-rose/20 disabled:pointer-events-none disabled:opacity-50'
const activeIconButtonClass = 'text-ink ring-1 ring-ink-4/30'
const floatingStopButtonClass =
  'fixed bottom-7 left-1/2 z-40 grid h-14 w-14 -translate-x-1/2 place-items-center rounded-full bg-paper text-ink shadow-(--shadow-feather) transition-all hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-ink-4/20'

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
  const settingsTitleBaseId = useId()
  const mobileSettingsTitleId = `${settingsTitleBaseId}-mobile`
  const desktopSettingsTitleId = `${settingsTitleBaseId}-desktop`
  const [settingsRendered, setSettingsRendered] = useState(settingsOpen)
  const [settingsEntered, setSettingsEntered] = useState(settingsOpen)
  const settingsVisible = settingsOpen && settingsEntered

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

      <div className={`sticky top-16 mt-2 bg-paper/0 py-3 ${settingsRendered ? 'z-50' : 'z-10'}`}>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="min-h-11 min-w-0 flex-1 rounded-full bg-rose px-5 py-2.5 font-serif-zh text-[15px] italic leading-none text-white shadow-(--shadow-cta) transition-all duration-200 hover:-translate-y-0.5 hover:bg-rose-deep hover:shadow-(--shadow-cta-hover) focus:outline-none focus:ring-4 focus:ring-rose/25 disabled:pointer-events-none disabled:opacity-50"
            onClick={onGenerate}
            disabled={disabled}
          >
            {generateButtonLabel(phase, hasExistingPieces)}
          </button>
          <button
            type="button"
            className={`${iconButtonClass} ${settingsOpen ? activeIconButtonClass : ''}`}
            onClick={onToggleSettings}
            aria-label={settingsOpen ? 'Close settings' : 'Open settings'}
            title={settingsOpen ? 'Close settings' : 'Open settings'}
            aria-expanded={settingsOpen}
          >
            <Settings className="size-5" aria-hidden="true" />
          </button>
        </div>

        {settingsRendered && (
          <>
            <div
              className={`fixed inset-0 z-30 bg-ink/30 transition-opacity duration-220 ease-out dark:bg-black/40 sm:bg-transparent sm:dark:bg-transparent ${settingsVisible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
              onClick={onCloseSettings}
              aria-hidden="true"
            />

            <div
              className={`fixed inset-x-4 bottom-4 z-40 max-h-[calc(85dvh-1rem)] overflow-y-auto rounded-lg border border-rose-line bg-paper px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 shadow-(--shadow-menu) transition-[opacity,transform] duration-220 ease-out sm:hidden ${settingsVisible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby={mobileSettingsTitleId}
              aria-hidden={!settingsOpen}
            >
              <SettingsHeader titleId={mobileSettingsTitleId} onClose={onCloseSettings} />
              <SettingsPanel
                open={settingsRendered}
                disabled={streaming}
                model={model}
                onModelChange={onModelChange}
                readingSpeed={readingSpeed}
                onReadingSpeedChange={onReadingSpeedChange}
                readingFont={readingFont}
                onReadingFontChange={onReadingFontChange}
                readingFontSize={readingFontSize}
                onReadingFontSizeChange={onReadingFontSizeChange}
              />
            </div>

            <div
              className={`absolute right-0 top-full z-40 mt-2 hidden w-[min(24rem,calc(100vw-2rem))] origin-top-right rounded-lg border border-rose-line bg-paper/95 p-4 shadow-(--shadow-menu) transition-[opacity,transform] duration-220 ease-out sm:block ${settingsVisible ? 'translate-y-0 scale-100 opacity-100' : 'pointer-events-none -translate-y-1 scale-[0.98] opacity-0'}`}
              role="dialog"
              aria-modal="false"
              aria-labelledby={desktopSettingsTitleId}
              aria-hidden={!settingsOpen}
            >
              <SettingsHeader titleId={desktopSettingsTitleId} onClose={onCloseSettings} />
              <SettingsPanel
                open={settingsRendered}
                disabled={streaming}
                model={model}
                onModelChange={onModelChange}
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

function SettingsHeader({
  titleId,
  onClose,
}: {
  titleId: string
  onClose: () => void
}) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <h2 id={titleId} className="min-w-0 flex-1 font-serif-zh text-xl italic leading-tight text-ink">
        Settings
      </h2>
      <button
        type="button"
        className="grid h-9 w-9 place-items-center rounded-full text-ink-3 transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30"
        aria-label="Close settings"
        title="Close settings"
        onClick={onClose}
      >
        <X aria-hidden="true" className="h-5 w-5" />
      </button>
    </div>
  )
}
