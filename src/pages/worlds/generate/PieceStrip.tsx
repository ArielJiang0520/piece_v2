import { entityLabel } from '@/config'
import { Plus } from 'lucide-react'

export interface PieceStripPiece {
  id: number
}

interface PieceStripProps {
  pieces: PieceStripPiece[]
  promptPieceCount: number
  selectedPieceId: number | null
  disabled: boolean
  onSelectNew: () => void
  onSelectPiece: (pieceId: number) => void
}

export default function PieceStrip({
  pieces,
  promptPieceCount,
  selectedPieceId,
  disabled,
  onSelectNew,
  onSelectPiece,
}: PieceStripProps) {
  const newSelected = selectedPieceId === null
  const showOverflowHint = pieces.length > 2

  return (
    <div className="relative py-3">
      {showOverflowHint && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-3 right-0 top-3 z-10 w-10 bg-linear-to-l from-paper via-paper/90 to-transparent sm:hidden"
        />
      )}
      <div className={`flex gap-2 overflow-x-auto pb-1 ${showOverflowHint ? 'pr-8 sm:pr-0' : ''}`}>
        <button
          type="button"
          className={newPieceButtonClass(newSelected)}
          onClick={onSelectNew}
          disabled={disabled}
          aria-pressed={newSelected}
        >
          <span className="flex items-center justify-center gap-1.5 whitespace-nowrap">
            <Plus aria-hidden="true" className={newSelected ? 'h-4 w-4 shrink-0 text-rose-deep' : 'h-4 w-4 shrink-0 text-ink-4'} />
            <span className={newSelected ? 'font-serif-zh text-sm italic text-rose-deep' : 'font-serif-zh text-sm italic text-ink-3'}>
              New {entityLabel('piece', { capitalize: true })}
            </span>
          </span>
          {newSelected && <SelectedHairline />}
        </button>

        {pieces.map((piece, index) => {
          const pieceNumber = Math.max(1, promptPieceCount - index)
          const selected = selectedPieceId === piece.id

          return (
            <button
              key={piece.id}
              type="button"
              className={pieceButtonClass(selected)}
              onClick={() => onSelectPiece(piece.id)}
              disabled={disabled}
              aria-pressed={selected}
            >
              <span className={selected ? 'whitespace-nowrap font-serif-zh text-sm italic text-rose-deep' : 'whitespace-nowrap font-serif-zh text-sm italic text-ink-3'}>
                {entityLabel('piece', { capitalize: true })} #{pieceNumber}
              </span>
              {selected && <SelectedHairline />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function pieceButtonClass(selected: boolean) {
  return [
    'relative flex h-10 min-w-20 shrink-0 items-center justify-center px-3 py-1 text-center transition-[color,transform] duration-200 hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30 disabled:opacity-50',
    selected
      ? 'text-rose-deep'
      : 'text-ink-3 hover:text-rose',
  ].join(' ')
}

function newPieceButtonClass(selected: boolean) {
  return [
    'relative flex h-10 min-w-28 shrink-0 items-center justify-center px-4 py-1 text-center transition-[color,transform] duration-200 hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30 disabled:opacity-50',
    selected
      ? 'text-rose-deep'
      : 'text-ink-3 hover:text-ink',
  ].join(' ')
}

function SelectedHairline() {
  return (
    <span
      aria-hidden="true"
      className="absolute bottom-0 left-3 right-3 h-px bg-rose"
    />
  )
}
