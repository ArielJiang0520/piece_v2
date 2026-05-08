import { useEffect, useId, useState } from 'react'
import { Check, ChevronDown, Gauge, Trophy } from 'lucide-react'
import { MODELS, type ModelOption } from '@/preferences/generationModel'
import { READING_FONT_OPTIONS, type ReadingFont } from '@/preferences/readingFont'
import { READING_FONT_SIZE_OPTIONS, type ReadingFontSize } from '@/preferences/readingFontSize'
import {
  MAX_READING_SPEED_UNITS_PER_SECOND,
  MIN_READING_SPEED_UNITS_PER_SECOND,
  READING_SPEED_STEP,
} from '@/preferences/readingSpeed'

interface SettingsPanelProps {
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
}

type AttributeKind = 'quality' | 'speed'

export default function SettingsPanel({
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
}: SettingsPanelProps) {
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const modelButtonId = useId()
  const modelListboxId = `${modelButtonId}-listbox`
  const selectedModel = MODELS.find(option => option.id === model) ?? MODELS[0]
  const modelDisabled = disabled || !open
  const readingDisabled = !open

  useEffect(() => {
    if (!open || disabled) setModelMenuOpen(false)
  }, [disabled, open])

  function chooseModel(id: string) {
    onModelChange(id)
    setModelMenuOpen(false)
  }

  if (!open) return null

  return (
    <div className="flex flex-col gap-5">
      <div className="relative">
        <span className="t-eyebrow  mb-2 inline-flex">AI Engine</span>
        <button
          id={modelButtonId}
          type="button"
          className="flex w-full items-center gap-3 rounded-sm border border-rose-line bg-paper px-3 py-2.5 text-left shadow-(--shadow-feather) transition-colors hover:border-rose focus:border-rose focus:outline-none disabled:opacity-50"
          aria-haspopup="listbox"
          aria-expanded={modelMenuOpen}
          aria-controls={modelListboxId}
          onClick={() => setModelMenuOpen(current => !current)}
          disabled={modelDisabled}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate font-serif-zh text-sm italic text-ink">
              {selectedModel.label}
            </span>
            <ModelAttributes model={selectedModel} />
          </span>
          <ChevronDown
            className={`size-4 shrink-0 text-ink-3 transition-transform ${modelMenuOpen ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>

        {modelMenuOpen && (
          <div
            id={modelListboxId}
            className="absolute left-0 right-0 top-full z-20 mt-2 max-h-72 overflow-y-auto rounded-sm border border-rose-line bg-paper p-1 shadow-[0_14px_38px_rgba(26,18,16,0.18)]"
            role="listbox"
            aria-labelledby={modelButtonId}
          >
            {MODELS.map(option => {
              const selected = option.id === model

              return (
                <button
                  key={option.id}
                  type="button"
                  className={`flex w-full items-start gap-3 rounded-xs px-2.5 py-2 text-left transition-colors disabled:opacity-50 ${selected ? 'bg-ink text-paper' : 'text-ink hover:bg-rose-pale/55'
                    }`}
                  role="option"
                  aria-selected={selected}
                  onClick={() => chooseModel(option.id)}
                  disabled={modelDisabled}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-serif-zh text-sm italic">
                      {option.label}
                    </span>
                    <ModelAttributes model={option} selected={selected} />
                  </span>
                  <Check
                    className={`mt-0.5 size-4 shrink-0 ${selected ? 'opacity-100' : 'opacity-0'}`}
                    aria-hidden="true"
                  />
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div>
        <label htmlFor="reading-speed" className="t-eyebrow  mb-2 inline-flex">
          Reading Speed
        </label>
        <div className="rounded-sm border border-rose-line px-3 py-2.5">
          <div className="flex justify-end">
            <span className="min-w-8 text-right font-serif-zh text-sm italic tabular-nums text-ink">
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
            onChange={event => onReadingSpeedChange(Number(event.target.value))}
            disabled={readingDisabled}
            aria-label="Reading speed"
          />
        </div>
      </div>

      <div>
        <span className="t-eyebrow  mb-2 inline-flex">Reading Font</span>
        <div className="grid grid-cols-2 overflow-hidden rounded-sm border border-rose-line p-0.5">
          {READING_FONT_OPTIONS.map(option => {
            const selected = option.id === readingFont

            return (
              <button
                key={option.id}
                type="button"
                className={`min-w-0 rounded-xs px-1.5 py-1.5 text-center font-serif-zh text-xs italic transition-colors disabled:opacity-50 ${selected ? 'bg-ink text-paper' : 'text-ink-3 hover:text-ink'
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
        <span className="t-eyebrow  mb-2 inline-flex">Text Size</span>
        <div className="grid grid-cols-5 overflow-hidden rounded-sm border border-rose-line p-0.5">
          {READING_FONT_SIZE_OPTIONS.map(option => {
            const selected = option.id === readingFontSize

            return (
              <button
                key={option.id}
                type="button"
                className={`min-w-0 rounded-xs px-1.5 py-1.5 text-center text-xs transition-colors disabled:opacity-50 ${selected ? 'bg-ink text-paper' : 'text-ink-3 hover:text-ink'
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
    </div>
  )
}

function ModelAttributes({
  model,
  selected = false,
}: {
  model: ModelOption
  selected?: boolean
}) {
  const textClass = selected ? 'text-paper/75' : 'text-ink-3'
  const symbolClass = selected ? 'text-paper' : 'text-rose'

  return (
    <span className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      <ModelAttribute
        label="QUALITY"
        value={model.attributes.quality}
        kind="quality"
        textClass={textClass}
        symbolClass={symbolClass}
      />
      <ModelAttribute
        label="SPEED"
        value={model.attributes.speed}
        kind="speed"
        textClass={textClass}
        symbolClass={symbolClass}
      />
    </span>
  )
}

function ModelAttribute({
  label,
  value,
  kind,
  textClass,
  symbolClass,
}: {
  label: string
  value: 1 | 2 | 3
  kind: AttributeKind
  textClass: string
  symbolClass: string
}) {
  return (
    <span
      className="inline-flex min-w-0 items-center gap-1.5"
      aria-label={`${label.toLowerCase()} ${value}`}
    >
      <span className={`text-[10px] uppercase leading-none ${textClass}`}>
        {label}
      </span>
      <span
        className={`inline-flex min-w-6 items-center gap-px text-[11px] leading-none ${symbolClass}`}
        aria-hidden="true"
      >
        {Array.from({ length: value }, (_, index) => (
          <AttributeSymbol key={index} kind={kind} />
        ))}
      </span>
    </span>
  )
}

function AttributeSymbol({ kind }: { kind: AttributeKind }) {
  if (kind === 'quality') return <Trophy className="size-3 fill-current" aria-hidden="true" />
  return <Gauge className="size-3" aria-hidden="true" />
}
