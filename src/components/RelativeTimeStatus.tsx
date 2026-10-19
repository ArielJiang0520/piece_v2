import { relativeTime } from '@/utils/time'
import { useUiText } from '@/i18n'
import { useLanguageId } from '@/preferences/language'

interface RelativeTimeStatusProps {
  timestamp: number | null | undefined
  className?: string
  emptyLabel?: string
  prefix?: string
}

// "Updated 2 hours ago": deliberately faint, a footnote rather than a signal.
export default function RelativeTimeStatus({
  timestamp,
  className = '',
  emptyLabel = '',
  prefix = '',
}: RelativeTimeStatusProps) {
  const language = useLanguageId()
  const t = useUiText()
  const label = timestamp ? `${prefix}${relativeTime(timestamp, language)}` : emptyLabel || t.noActivity

  return (
    <div className={`${className} t-meta truncate text-ink-4`}>{label}</div>
  )
}
