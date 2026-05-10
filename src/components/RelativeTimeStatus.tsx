import { relativeTime } from '@/utils/time'

const ONE_HOUR_MS = 60 * 60 * 1e3

function recencyClasses(timestamp: number | null | undefined) {
  if (!timestamp) return { dot: 'bg-ink-4/50' }

  const age = Date.now() - timestamp
  if (age < ONE_HOUR_MS) return { dot: 'bg-signal-green' }
  return { dot: 'bg-ink-4/50' }
}

interface RelativeTimeStatusProps {
  timestamp: number | null | undefined
  className?: string
  emptyLabel?: string
  prefix?: string
}

export default function RelativeTimeStatus({
  timestamp,
  className = 'mb-4',
  emptyLabel = 'No activity',
  prefix = '',
}: RelativeTimeStatusProps) {
  const classes = recencyClasses(timestamp)
  const label = timestamp ? `${prefix}${relativeTime(timestamp)}` : emptyLabel

  return (
    <div className={`${className} t-meta flex items-center gap-2.5 leading-none`}>
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${classes.dot}`} />
      <span>{label}</span>
    </div>
  )
}
