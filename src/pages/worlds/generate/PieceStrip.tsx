import { entityLabel } from '@/config'

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
  const newPieceNumber = promptPieceCount + 1

  return (
    <div className="py-3">
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          className={pieceButtonClass(newSelected)}
          onClick={onSelectNew}
          disabled={disabled}
          aria-pressed={newSelected}
        >
          <span className="flex items-center justify-center gap-1.5 whitespace-nowrap">
            <span className="font-serif-zh text-sm italic text-rose">
              {entityLabel('piece', { capitalize: true })} #{newPieceNumber}
            </span>
            <span className="t-meta text-[11px]">New</span>

          </span>
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
              <span className="whitespace-nowrap font-serif-zh text-sm italic text-rose">
                {entityLabel('piece', { capitalize: true })} #{pieceNumber}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function pieceButtonClass(selected: boolean) {
  return [
    'flex h-10 min-w-20 shrink-0 items-center justify-center rounded-sm border px-3 py-1 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30 disabled:opacity-50',
    selected
      ? 'border-rose bg-rose-pale/70 shadow-(--shadow-feather)'
      : 'border-rose-line bg-paper/90 hover:border-rose',
  ].join(' ')
}
