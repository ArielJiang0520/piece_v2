import { DEFAULT_LANGUAGE_ID, type LanguageId } from '@/preferences/language'

const compactFormats = new Map<LanguageId, Intl.NumberFormat>()

// 12400 → "12K" / "1.2万". For popularity counts, where the order of magnitude is the point.
export function formatCompact(value: number, language: LanguageId = DEFAULT_LANGUAGE_ID) {
  let format = compactFormats.get(language)
  if (!format) {
    format = new Intl.NumberFormat(language === 'zh' ? 'zh-Hans' : 'en', { notation: 'compact', maximumFractionDigits: 1 })
    compactFormats.set(language, format)
  }
  return format.format(value)
}
