const relativeTimeFormat = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000
const ONE_HOUR_MS = 60 * 60 * 1000

export function relativeTime(timestamp: number) {
  const diffSeconds = (Date.now() - timestamp) / 1000

  if (diffSeconds < 60) return relativeTimeFormat.format(-Math.round(diffSeconds), 'second')
  if (diffSeconds < 3600) return relativeTimeFormat.format(-Math.round(diffSeconds / 60), 'minute')
  if (diffSeconds < 86400) return relativeTimeFormat.format(-Math.round(diffSeconds / 3600), 'hour')
  return relativeTimeFormat.format(-Math.round(diffSeconds / 86400), 'day')
}

export function isWithinLastMonth(timestamp: number) {
  return Date.now() - timestamp < ONE_MONTH_MS
}

export function isWithinLastHour(timestamp: number) {
  return Date.now() - timestamp < ONE_HOUR_MS
}
