import { relativeTime } from '../utils/time'

function recencyClasses(timestamp: number | null | undefined) {
  if (!timestamp) return { text: 'text-ink-4', dot: 'bg-ink-4/60' }

  // const age = Date.now() - timestamp
  // if (age < THREE_HOUR_MS) return { text: 'text-emerald-800/65', dot: 'bg-emerald-600/45' }
  // if (age < SEVEN_DAYS_MS) return { text: 'text-amber-800/65', dot: 'bg-amber-600/45' }
  return { text: 'text-ink-4', dot: 'bg-ink-4/60' }
}

interface RelativeTimeStatusProps {
  timestamp: number | null | undefined
  emptyLabel?: string
  prefix?: string
}

export default function RelativeTimeStatus({
  timestamp,
  emptyLabel = 'No activity',
  prefix = '',
}: RelativeTimeStatusProps) {
  const classes = recencyClasses(timestamp)
  const label = timestamp ? `${prefix}${relativeTime(timestamp)}` : emptyLabel

  return (
    <div className={`mb-4 flex items-center gap-2.5 text-xs font-normal leading-none ${classes.text}`}>
      <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${classes.dot}`} />
      <span>{label}</span>
    </div>
  )
}
