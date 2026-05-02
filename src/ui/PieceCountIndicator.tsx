const MAX_PIECE_DOTS = 8
const PIECES_PER_DOT = 2
const PIECE_DOT_INTENSITY_MIX = [
  { black: 0, alpha: 0.8 },
  { black: 25, alpha: 1 },
  { black: 45, alpha: 1 },
  { black: 60, alpha: 1 },
  { black: 75, alpha: 1 },
]

interface PieceCountIndicatorProps {
  count: number
  className?: string
  color?: string
}

function pieceCountLabel(count: number) {
  return `${count} ${count === 1 ? 'piece' : 'pieces'}`
}

function pieceDotStyles(pieceCount: number, color: string) {
  const dotUnits = Math.ceil(pieceCount / PIECES_PER_DOT)
  const visibleDots = Math.min(MAX_PIECE_DOTS, dotUnits)
  const overflowDotUnits = Math.max(0, dotUnits - MAX_PIECE_DOTS)

  return Array.from({ length: visibleDots }, (_, index) => {
    const intensity = Math.floor((overflowDotUnits + MAX_PIECE_DOTS - 1 - index) / MAX_PIECE_DOTS)
    const level = PIECE_DOT_INTENSITY_MIX[Math.min(intensity, PIECE_DOT_INTENSITY_MIX.length - 1)]
    const mixed = level.black === 0
      ? color
      : `color-mix(in oklab, ${color} ${100 - level.black}%, black)`
    const backgroundColor = level.alpha < 1
      ? `color-mix(in oklab, ${mixed} ${level.alpha * 100}%, transparent)`
      : mixed
    return { backgroundColor }
  })
}

export default function PieceCountIndicator({ count, className, color = 'var(--color-rose)' }: PieceCountIndicatorProps) {
  const dotStyles = pieceDotStyles(count, color)

  return (
    <div className={['flex min-w-0 items-center gap-3', className].filter(Boolean).join(' ')}>
      {dotStyles.length > 0 && (
        <span aria-hidden="true" className="flex shrink-0 items-center gap-1">
          {dotStyles.map((style, index) => (
            <span key={index} className="h-2 w-2 rounded-xs" style={style} />
          ))}
        </span>
      )}
      <span>{pieceCountLabel(count)}</span>
    </div>
  )
}
