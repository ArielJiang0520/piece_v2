import { useEffect } from 'react'
import { X } from 'lucide-react'
import type { ReadingFont } from '@/preferences/readingFont'
import type { ReadingFontSize } from '@/preferences/readingFontSize'
import SettingsPanel from './SettingsPanel'

interface GenerateSettingsDialogProps {
  open: boolean
  disabled: boolean
  model: string
  onModelChange: (model: string) => void
  readingSpeed: number
  onReadingSpeedChange: (readingSpeed: number) => void
  readingFont: ReadingFont
  onReadingFontChange: (readingFont: ReadingFont) => void
  readingFontSize: ReadingFontSize
  onReadingFontSizeChange: (readingFontSize: ReadingFontSize) => void
  onClose: () => void
}

export default function GenerateSettingsDialog({
  open,
  disabled,
  model,
  onModelChange,
  readingSpeed,
  onReadingSpeedChange,
  readingFont,
  onReadingFontChange,
  readingFontSize,
  onReadingFontSizeChange,
  onClose,
}: GenerateSettingsDialogProps) {
  useEffect(() => {
    if (!open) return

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose, open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/35 px-4 py-8"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="generate-settings-title"
        className="max-h-[calc(100dvh-4rem)] w-full max-w-sm overflow-y-auto rounded-lg border border-paper-3 bg-paper px-5 py-5 shadow-[0_24px_70px_rgba(26,18,16,0.22)]"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <h2 id="generate-settings-title" className="font-serif-zh text-xl leading-tight text-ink">
            Settings
          </h2>
          <button
            type="button"
            className="ml-auto grid h-9 w-9 place-items-center rounded-full text-ink-3 transition-colors hover:bg-paper-2 hover:text-ink focus:outline-none focus:ring-2 focus:ring-rose/30"
            onClick={onClose}
            aria-label="Close settings"
            title="Close settings"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5">
          <SettingsPanel
            open={open}
            disabled={disabled}
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
      </div>
    </div>
  )
}
