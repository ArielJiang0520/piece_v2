import { entityLabel, type EntityKey } from '../config'

const DEFAULT_MAX_DOTS = 8
const DEFAULT_UNITS_PER_DOT = 2
const DOT_INTENSITY_MIX = [
  { black: 0, alpha: 0.8 },
  { black: 25, alpha: 1 },
  { black: 45, alpha: 1 },
  { black: 60, alpha: 1 },
  { black: 75, alpha: 1 },
]

interface CountIndicatorProps {
  count: number
  className?: string
  color?: string
  entity?: EntityKey
  maxDots?: number
  unitsPerDot?: number
}

function countLabel(count: number, entity: EntityKey) {
  return `${count} ${entityLabel(entity, { plural: count !== 1 })}`
}

function countDotStyles(count: number, color: string, maxDots: number, unitsPerDot: number) {
  const dotUnits = Math.ceil(count / unitsPerDot)
  const visibleDots = Math.min(maxDots, dotUnits)
  const overflowDotUnits = Math.max(0, dotUnits - maxDots)

  return Array.from({ length: visibleDots }, (_, index) => {
    const intensity = Math.floor((overflowDotUnits + maxDots - 1 - index) / maxDots)
    const level = DOT_INTENSITY_MIX[Math.min(intensity, DOT_INTENSITY_MIX.length - 1)]
    const mixed = level.black === 0
      ? color
      : `color-mix(in oklab, ${color} ${100 - level.black}%, black)`
    const backgroundColor = level.alpha < 1
      ? `color-mix(in oklab, ${mixed} ${level.alpha * 100}%, transparent)`
      : mixed
    return { backgroundColor }
  })
}

export default function CountIndicator({
  count,
  className,
  color = 'var(--color-rose)',
  entity = 'piece',
  maxDots = DEFAULT_MAX_DOTS,
  unitsPerDot = DEFAULT_UNITS_PER_DOT,
}: CountIndicatorProps) {
  const dotStyles = countDotStyles(count, color, maxDots, unitsPerDot)

  return (
    <div className={['flex min-w-0 max-w-full flex-wrap items-center gap-x-3 gap-y-1', className].filter(Boolean).join(' ')}>
      {dotStyles.length > 0 && (
        <span aria-hidden="true" className="flex min-w-0 max-w-full flex-wrap items-center gap-1">
          {dotStyles.map((style, index) => (
            <span key={index} className="h-2 w-2 shrink-0 rounded-xs" style={style} />
          ))}
        </span>
      )}
      <span className="shrink-0">{countLabel(count, entity)}</span>
    </div>
  )
}
