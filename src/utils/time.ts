const relativeTimeFormat = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

export function relativeTime(timestamp: number) {
  const diffSeconds = (Date.now() - timestamp) / 1000

  if (diffSeconds < 60) return relativeTimeFormat.format(-Math.round(diffSeconds), 'second')
  if (diffSeconds < 3600) return relativeTimeFormat.format(-Math.round(diffSeconds / 60), 'minute')
  if (diffSeconds < 86400) return relativeTimeFormat.format(-Math.round(diffSeconds / 3600), 'hour')
  return relativeTimeFormat.format(-Math.round(diffSeconds / 86400), 'day')
}
