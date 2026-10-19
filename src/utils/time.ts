import { DEFAULT_LANGUAGE_ID, type LanguageId } from '@/preferences/language'

const relativeTimeFormats = new Map<LanguageId, Intl.RelativeTimeFormat>()

function getRelativeTimeFormat(language: LanguageId) {
  const existing = relativeTimeFormats.get(language)
  if (existing) return existing

  const formatter = new Intl.RelativeTimeFormat(language === 'zh' ? 'zh-Hans' : 'en', { numeric: 'auto' })
  relativeTimeFormats.set(language, formatter)
  return formatter
}

export function relativeTime(timestamp: number, language: LanguageId = DEFAULT_LANGUAGE_ID) {
  const relativeTimeFormat = getRelativeTimeFormat(language)
  const diffSeconds = (Date.now() - timestamp) / 1000

  if (diffSeconds < 60) return relativeTimeFormat.format(-Math.round(diffSeconds), 'second')
  if (diffSeconds < 3600) return relativeTimeFormat.format(-Math.round(diffSeconds / 60), 'minute')
  if (diffSeconds < 86400) return relativeTimeFormat.format(-Math.round(diffSeconds / 3600), 'hour')
  return relativeTimeFormat.format(-Math.round(diffSeconds / 86400), 'day')
}
