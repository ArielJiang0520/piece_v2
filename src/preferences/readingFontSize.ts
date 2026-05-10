import { createPreference } from './createPreference'

export const READING_FONT_SIZE_OPTIONS = [
  {
    id: 'xsmall',
    label: 'Very small',
    iconClass: 'text-[11px]',
    outputStyle: { fontSize: '13px', lineHeight: 1.9 },
  },
  {
    id: 'small',
    label: 'Small',
    iconClass: 'text-xs',
    outputStyle: { fontSize: '14px', lineHeight: 1.85 },
  },
  {
    id: 'medium',
    label: 'Medium',
    iconClass: 'text-base',
    outputStyle: { fontSize: '15px', lineHeight: 1.85 },
  },
  {
    id: 'large',
    label: 'Large',
    iconClass: 'text-xl',
    outputStyle: { fontSize: '17px', lineHeight: 1.8 },
  },
  {
    id: 'xlarge',
    label: 'Very large',
    iconClass: 'text-2xl',
    outputStyle: { fontSize: '19px', lineHeight: 1.75 },
  },
] as const

export type ReadingFontSize = (typeof READING_FONT_SIZE_OPTIONS)[number]['id']
export type ReadingFontSizeOption = (typeof READING_FONT_SIZE_OPTIONS)[number]

export const READING_FONT_SIZE_BY_ID = Object.fromEntries(
  READING_FONT_SIZE_OPTIONS.map(option => [option.id, option]),
) as Record<ReadingFontSize, ReadingFontSizeOption>

const DEFAULT_READING_FONT_SIZE: ReadingFontSize = 'large'

function isReadingFontSize(value: unknown): value is ReadingFontSize {
  return READING_FONT_SIZE_OPTIONS.some(option => option.id === value)
}

const readingFontSizePreference = createPreference<ReadingFontSize>({
  key: 'piece:reading-font-size',
  defaultValue: DEFAULT_READING_FONT_SIZE,
  parse: raw => (isReadingFontSize(raw) ? raw : DEFAULT_READING_FONT_SIZE),
})

export const setReadingFontSize = readingFontSizePreference.set
export const useReadingFontSize = readingFontSizePreference.use
