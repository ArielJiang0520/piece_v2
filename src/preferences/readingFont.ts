import { createPreference } from './createPreference'

export const READING_FONT_OPTIONS = [
  {
    id: 'serif',
    label: 'Serif',
    outputClass: 'prose',
  },
  {
    id: 'mono',
    label: 'Mono',
    outputClass: 'font-mono text-ink',
  },
] as const

export type ReadingFont = (typeof READING_FONT_OPTIONS)[number]['id']
export type ReadingFontOption = (typeof READING_FONT_OPTIONS)[number]

export const READING_FONT_BY_ID = Object.fromEntries(
  READING_FONT_OPTIONS.map(option => [option.id, option]),
) as Record<ReadingFont, ReadingFontOption>

const DEFAULT_READING_FONT: ReadingFont = 'serif'

function isReadingFont(value: unknown): value is ReadingFont {
  return READING_FONT_OPTIONS.some(option => option.id === value)
}

const readingFontPreference = createPreference<ReadingFont>({
  key: 'piece:reading-font',
  defaultValue: DEFAULT_READING_FONT,
  parse: raw => (isReadingFont(raw) ? raw : DEFAULT_READING_FONT),
})

export const setReadingFont = readingFontPreference.set
export const useReadingFont = readingFontPreference.use
