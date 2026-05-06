import { MODELS } from '../../../config'

interface SettingsPanelProps {
  open: boolean
  disabled: boolean
  model: string
  onModelChange: (model: string) => void
}

export default function SettingsPanel({
  open,
  disabled,
  model,
  onModelChange,
}: SettingsPanelProps) {
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

      </div>
    </div>
  )
}
