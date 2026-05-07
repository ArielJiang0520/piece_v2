import { useEffect, useId, useState } from 'react'
import { Check, ChevronDown, Trophy } from 'lucide-react'
import { MODELS, type ModelOption } from '../../../config'

interface SettingsPanelProps {
  open: boolean
  disabled: boolean
  model: string
  onModelChange: (model: string) => void
}

type AttributeKind = 'quality' | 'cost'

export default function SettingsPanel({
  open,
  disabled,
  model,
  onModelChange,
}: SettingsPanelProps) {
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const modelButtonId = useId()
  const modelListboxId = `${modelButtonId}-listbox`
  const selectedModel = MODELS.find(option => option.id === model) ?? MODELS[0]
  const wrapperClass = [
    'overflow-hidden border-t bg-paper/95 transition-[margin,max-height,opacity,padding] duration-200 ease-out',
    open
      ? 'mt-4 max-h-[34rem] border-rose-line pt-4 opacity-100'
      : 'mt-0 max-h-0 border-transparent pt-0 opacity-0',
  ].join(' ')
  const inputDisabled = disabled || !open

  useEffect(() => {
    if (!open || disabled) setModelMenuOpen(false)
  }, [disabled, open])

  function chooseModel(id: string) {
    onModelChange(id)
    setModelMenuOpen(false)
  }

  return (
    <div className={wrapperClass} aria-hidden={!open}>
      <div className="flex flex-col gap-3">
        <div>
          <span className="t-eyebrow eyebrow-rule mb-2 inline-flex">AI Engine</span>
          <button
            id={modelButtonId}
            type="button"
            className="flex w-full items-center gap-3 rounded-sm border border-rose-line bg-paper px-3 py-2.5 text-left shadow-(--shadow-feather) transition-colors hover:border-rose focus:border-rose focus:outline-none disabled:opacity-50"
            aria-haspopup="listbox"
            aria-expanded={modelMenuOpen}
            aria-controls={modelListboxId}
            onClick={() => setModelMenuOpen(current => !current)}
            disabled={inputDisabled}
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
              className="mt-2 overflow-hidden rounded-sm border border-rose-line bg-paper p-1 shadow-(--shadow-feather)"
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
                    disabled={inputDisabled}
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
      <ModelAttribute label="QUALITY" value={model.attributes.quality} kind="quality" textClass={textClass} symbolClass={symbolClass} />
      <ModelAttribute label="COST" value={model.attributes.cost} kind="cost" textClass={textClass} symbolClass={symbolClass} />
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
    <span className="inline-flex min-w-0 items-center gap-1.5" aria-label={`${label.toLowerCase()} ${value}`}>
      <span className={`text-[10px] uppercase leading-none ${textClass}`}>
        {label}
      </span>
      <span className={`inline-flex min-w-6 items-center gap-px text-[11px] leading-none ${symbolClass}`} aria-hidden="true">
        {Array.from({ length: value }, (_, index) => (
          <AttributeSymbol key={index} kind={kind} />
        ))}
      </span>
    </span>
  )
}

function AttributeSymbol({ kind }: { kind: AttributeKind }) {
  if (kind === 'quality') return <Trophy className="size-3 fill-current" aria-hidden="true" />
  return <span className="font-serif-zh text-xs italic">$</span>
}
