import type { ReadingFont } from '../../../preferences/readingFont'
import type { ReadingFontSize } from '../../../preferences/readingFontSize'
import { READING_FONT_SIZE_OPTIONS } from '../../../preferences/readingFontSize'
import {
  MAX_READING_SPEED_UNITS_PER_SECOND,
  MIN_READING_SPEED_UNITS_PER_SECOND,
  READING_SPEED_STEP,
} from '../../../preferences/readingSpeed'

interface ReadingSettingsPanelProps {
  open: boolean
  disabled: boolean
  readingSpeed: number
  onReadingSpeedChange: (readingSpeed: number) => void
  readingFont: ReadingFont
  onReadingFontChange: (readingFont: ReadingFont) => void
  readingFontSize: ReadingFontSize
  onReadingFontSizeChange: (readingFontSize: ReadingFontSize) => void
}

const fontOptions: { id: ReadingFont; label: string }[] = [
  { id: 'serif', label: 'Serif' },
  { id: 'mono', label: 'Mono' },
]

export default function ReadingSettingsPanel({
  open,
  disabled,
  readingSpeed,
  onReadingSpeedChange,
  readingFont,
  onReadingFontChange,
  readingFontSize,
  onReadingFontSizeChange,
}: ReadingSettingsPanelProps) {
  const wrapperClass = [
    'overflow-hidden rounded-md border bg-paper transition-[margin,max-height,opacity,padding] duration-200 ease-out',
    open
      ? 'mt-3 max-h-80 border-paper-3 p-3 opacity-100 shadow-[0_12px_28px_rgba(26,18,16,0.12)]'
      : 'mt-0 max-h-0 border-transparent p-0 opacity-0 shadow-none',
  ].join(' ')
  const inputDisabled = disabled || !open

  return (
    <div className={wrapperClass} aria-hidden={!open}>
      <div className="flex flex-col gap-4">
        <div className="rounded-sm border border-paper-3 bg-paper-2 px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="reading-speed" className="text-xs font-medium text-ink-3">
              Speed
            </label>
            <span className="min-w-8 text-right text-sm tabular-nums text-ink">
              {readingSpeed}
            </span>
          </div>
          <input
            id="reading-speed"
            className="mt-2 w-full accent-rose disabled:opacity-50"
            type="range"
            min={MIN_READING_SPEED_UNITS_PER_SECOND}
            max={MAX_READING_SPEED_UNITS_PER_SECOND}
            step={READING_SPEED_STEP}
            value={readingSpeed}
            onChange={e => onReadingSpeedChange(Number(e.target.value))}
            disabled={inputDisabled}
            aria-label="Reading speed"
          />
        </div>

        <div className="grid grid-cols-2 overflow-hidden rounded-sm border border-paper-3 bg-paper-2 p-0.5">
          {fontOptions.map(option => {
            const selected = option.id === readingFont
            return (
              <button
                key={option.id}
                type="button"
                className={`min-w-0 rounded-xs px-1.5 py-1.5 text-center text-xs font-medium transition-colors disabled:opacity-50 ${selected ? 'bg-paper text-ink shadow-sm' : 'text-ink-3 hover:text-ink'
                  }`}
                aria-pressed={selected}
                onClick={() => onReadingFontChange(option.id)}
                disabled={inputDisabled}
              >
                {option.label}
              </button>
            )
          })}
        </div>

        <div className="grid grid-cols-3 overflow-hidden rounded-sm border border-paper-3 bg-paper-2 p-0.5">
          {READING_FONT_SIZE_OPTIONS.map(option => {
            const selected = option.id === readingFontSize
            return (
              <button
                key={option.id}
                type="button"
                className={`min-w-0 rounded-xs px-1.5 py-1.5 text-center text-xs font-medium transition-colors disabled:opacity-50 ${selected ? 'bg-paper text-ink shadow-sm' : 'text-ink-3 hover:text-ink'
                  }`}
                aria-pressed={selected}
                onClick={() => onReadingFontSizeChange(option.id)}
                disabled={inputDisabled}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
