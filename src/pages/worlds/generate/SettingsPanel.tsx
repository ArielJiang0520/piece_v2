import { Rabbit, Turtle } from 'lucide-react'
import { READING_FONT_OPTIONS, type ReadingFont } from '@/preferences/readingFont'
import { READING_FONT_SIZE_OPTIONS, type ReadingFontSize } from '@/preferences/readingFontSize'
import {
  MAX_READING_SPEED_UNITS_PER_SECOND,
  MIN_READING_SPEED_UNITS_PER_SECOND,
  READING_SPEED_STEP,
} from '@/preferences/readingSpeed'

interface SettingsPanelProps {
  open: boolean
  readingSpeed: number
  onReadingSpeedChange: (readingSpeed: number) => void
  readingFont: ReadingFont
  onReadingFontChange: (readingFont: ReadingFont) => void
  readingFontSize: ReadingFontSize
  onReadingFontSizeChange: (readingFontSize: ReadingFontSize) => void
}

export default function SettingsPanel({
  open,
  readingSpeed,
  onReadingSpeedChange,
  readingFont,
  onReadingFontChange,
  readingFontSize,
  onReadingFontSizeChange,
}: SettingsPanelProps) {
  const readingDisabled = !open

  if (!open) return null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="t-eyebrow shrink-0">Reading display</span>
        <span aria-hidden="true" className="h-px flex-1 bg-rose-line/70" />
      </div>

      <div>
        <span className="t-eyebrow mb-1.5 inline-flex">Size</span>
        <div className="grid h-10 grid-cols-5 overflow-hidden rounded-md border border-rose-line bg-paper/50 p-0.5">
          {READING_FONT_SIZE_OPTIONS.map(option => {
            const selected = option.id === readingFontSize

            return (
              <button
                key={option.id}
                type="button"
                className={`min-w-0 rounded-sm px-1 text-center text-xs transition-colors disabled:opacity-50 ${selected ? 'bg-paper text-ink shadow-[0_0_14px_rgba(54,44,38,0.14)]' : 'text-ink-3 hover:text-ink'
                  }`}
                aria-pressed={selected}
                aria-label={`${option.label} font size`}
                onClick={() => onReadingFontSizeChange(option.id)}
                disabled={readingDisabled}
              >
                <span
                  aria-hidden="true"
                  className={`inline-flex h-7 items-center justify-center font-serif-zh italic leading-none ${option.iconClass}`}
                >
                  A
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <span className="t-eyebrow mb-1.5 inline-flex">Font</span>
        <div className="grid h-10 grid-cols-2 overflow-hidden rounded-md border border-rose-line bg-paper/50 p-0.5">
          {READING_FONT_OPTIONS.map(option => {
            const selected = option.id === readingFont
            const fontPreviewClass = option.id === 'mono'
              ? 'font-mono not-italic'
              : 'font-serif-zh italic'

            return (
              <button
                key={option.id}
                type="button"
                className={`min-w-0 rounded-sm px-3 text-center text-sm transition-colors disabled:opacity-50 ${fontPreviewClass} ${selected ? 'bg-rose text-white shadow-(--shadow-cta)' : 'text-ink-3 hover:text-ink'
                  }`}
                aria-pressed={selected}
                onClick={() => onReadingFontChange(option.id)}
                disabled={readingDisabled}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <label htmlFor="reading-speed" className="t-eyebrow mb-1.5 inline-flex">
          Speed
        </label>
        <div className="flex h-10 items-center gap-3 rounded-md border border-rose-line bg-paper/50 px-3">
          <Turtle aria-hidden="true" className="size-4 shrink-0 text-ink-3" />
          <input
            id="reading-speed"
            className="min-w-0 flex-1 accent-rose disabled:opacity-50"
            type="range"
            min={MIN_READING_SPEED_UNITS_PER_SECOND}
            max={MAX_READING_SPEED_UNITS_PER_SECOND}
            step={READING_SPEED_STEP}
            value={readingSpeed}
            onChange={event => onReadingSpeedChange(Number(event.target.value))}
            disabled={readingDisabled}
            aria-label="Reading speed"
          />
          <Rabbit aria-hidden="true" className="size-4 shrink-0 text-ink-3" />
        </div>
      </div>
    </div>
  )
}
