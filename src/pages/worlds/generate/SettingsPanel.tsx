import { MODELS } from '../../../config'

interface SettingsPanelProps {
  open: boolean
  disabled: boolean
  model: string
  onModelChange: (model: string) => void
  temperature: number
  onTemperatureChange: (temperature: number) => void
  useThinking: boolean
  onUseThinkingChange: (value: boolean) => void
}

export default function SettingsPanel({
  open,
  disabled,
  model,
  onModelChange,
  temperature,
  onTemperatureChange,
  useThinking,
  onUseThinkingChange,
}: SettingsPanelProps) {
  const wrapperClass = [
    'overflow-hidden border-t border-paper-3 transition-[margin,max-height,opacity,padding] duration-200 ease-out',
    open ? 'mt-4 max-h-80 pt-4 opacity-100' : 'max-h-0 pt-0 opacity-0',
  ].join(' ')
  const inputDisabled = disabled || !open

  return (
    <div className={wrapperClass} aria-hidden={!open}>
      <div className="flex flex-col gap-4">
        <label className="block">
          <select
            className="w-full rounded-sm border border-paper-3 bg-paper-2 px-3 py-2 text-ink focus:outline-none focus:border-rose disabled:opacity-50"
            value={model}
            onChange={e => onModelChange(e.target.value)}
            disabled={inputDisabled}
          >
            {MODELS.map(m => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </label>

        <div className="rounded-sm border border-paper-3 bg-paper-2 px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="temperature" className="text-xs font-medium text-ink-3">
              Temp
            </label>
            <span className="min-w-8 text-right text-sm tabular-nums text-ink">
              {temperature.toFixed(1)}
            </span>
          </div>
          <input
            id="temperature"
            className="mt-2 w-full accent-rose disabled:opacity-50"
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={temperature}
            onChange={e => onTemperatureChange(Number(e.target.value))}
            disabled={inputDisabled}
            aria-label="Model temperature"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={useThinking}
            aria-label="Thinking"
            disabled={inputDisabled}
            onClick={() => onUseThinkingChange(!useThinking)}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors focus:outline-none focus:border-rose disabled:opacity-50 ${useThinking
              ? 'border-rose bg-rose'
              : 'border-paper-3 bg-paper-2'
              }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${useThinking ? 'translate-x-4' : 'translate-x-0.5'
                }`}
            />
          </button>
          <span className="text-xs font-medium text-ink-3">Thinking</span>
        </div>
      </div>
    </div>
  )
}
