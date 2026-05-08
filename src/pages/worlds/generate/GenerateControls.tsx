import { Settings, X } from 'lucide-react'
import type { GenerationPhase } from '@/hooks/useGeneration'

interface GenerateControlsProps {
  phase: GenerationPhase
  streaming: boolean
  settingsOpen: boolean
  viewingSavedPiece: boolean
  disabled: boolean
  onGenerate: () => void
  onToggleSettings: () => void
  onStop: () => void
}

const iconButtonClass =
  'flex size-11 shrink-0 items-center justify-center rounded-full bg-paper/85 text-ink-3 shadow-(--shadow-feather) transition-all duration-200 hover:-translate-y-px hover:text-ink focus:outline-none focus:ring-4 focus:ring-rose/20 disabled:pointer-events-none disabled:opacity-50'
const activeIconButtonClass = 'text-ink ring-1 ring-ink-4/30'

export default function GenerateControls({
  phase,
  streaming,
  settingsOpen,
  viewingSavedPiece,
  disabled,
  onGenerate,
  onToggleSettings,
  onStop,
}: GenerateControlsProps) {
  if (viewingSavedPiece && !streaming) return null

  return (
    <div className="mt-3">
      <div className="flex items-center gap-3">
        {!viewingSavedPiece && (
          <button
            type="button"
            className="min-h-11 min-w-0 flex-1 rounded-full bg-rose px-5 py-2.5 font-serif-zh text-[15px] italic leading-none text-white shadow-(--shadow-cta) transition-all duration-200 hover:-translate-y-0.5 hover:bg-rose-deep hover:shadow-(--shadow-cta-hover) focus:outline-none focus:ring-4 focus:ring-rose/25 disabled:pointer-events-none disabled:opacity-50"
            onClick={onGenerate}
            disabled={disabled}
          >
            {generateButtonLabel(phase)}
          </button>
        )}
        {!viewingSavedPiece && (
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
        )}
        {streaming && (
          <button
            type="button"
            className={iconButtonClass}
            onClick={onStop}
            aria-label="Stop generation"
            title="Stop generation"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  )
}

function generateButtonLabel(phase: GenerationPhase) {
  if (phase === 'waiting_provider') return 'Waiting...'
  if (phase === 'thinking') return 'Thinking...'
  if (phase === 'writing') return 'Writing...'
  return 'Take it'
}
