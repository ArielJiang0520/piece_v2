import { formatPieceTitle } from '@/config'
import { useLanguageId } from '@/preferences/language'
import type { PieceStripPiece } from '../../shared/types'

const RESUME_DOT_WINDOW_MS = 48 * 60 * 60 * 1000

interface PieceStripProps {
  pieces: PieceStripPiece[]
  promptPieceCount: number
  selectedPieceId: number | null
  onSelectPiece: (pieceId: number) => void
}

export default function PieceStrip({
  pieces,
  promptPieceCount,
  selectedPieceId,
  onSelectPiece,
}: PieceStripProps) {
  const language = useLanguageId()
  const showOverflowHint = pieces.length > 2

  // The piece continued most recently (a resume/re-save pushes updated_at past created_at),
  // marked with a dot so it's findable without reordering the creation-numbered strip. The
  // dot decays after RESUME_DOT_WINDOW_MS so it flags *recent* activity, not any past resume.
  const now = Date.now()
  let recentlyResumedId: number | null = null
  let latestResumeAt = 0
  for (const piece of pieces) {
    if (
      piece.updated_at > piece.created_at &&
      now - piece.updated_at < RESUME_DOT_WINDOW_MS &&
      piece.updated_at > latestResumeAt
    ) {
      latestResumeAt = piece.updated_at
      recentlyResumedId = piece.id
    }
  }

  return (
    <div className="relative py-3">
      {showOverflowHint && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-3 right-0 top-3 z-10 w-10 bg-linear-to-l from-paper via-paper/90 to-transparent sm:hidden"
        />
      )}
      <div className={`flex gap-2 overflow-x-auto pb-1 ${showOverflowHint ? 'pr-8 sm:pr-0' : ''}`}>
        {pieces.map((piece, index) => {
          const pieceNumber = Math.max(1, promptPieceCount - index)
          const selected = selectedPieceId === piece.id
          const recentlyResumed = recentlyResumedId === piece.id

          return (
            <button
              key={piece.id}
              type="button"
              className={pieceButtonClass(selected)}
              onClick={() => onSelectPiece(piece.id)}
              aria-pressed={selected}
            >
              <span className={selected ? 'whitespace-nowrap font-serif-zh text-sm italic text-rose-deep' : 'whitespace-nowrap font-serif-zh text-sm italic text-ink-3'}>
                {formatPieceTitle(pieceNumber, language)}
              </span>
              {recentlyResumed && (
                <span
                  aria-hidden="true"
                  className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-rose"
                />
              )}
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

function SelectedHairline() {
  return (
    <span
      aria-hidden="true"
      className="absolute bottom-0 left-3 right-3 h-px bg-rose"
    />
  )
}
