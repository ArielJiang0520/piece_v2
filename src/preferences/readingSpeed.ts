import { createPreference } from './createPreference'

const CHINESE_TEXT_PATTERN = /\p{Script=Han}/u

export function containsChineseText(text: string) {
  return CHINESE_TEXT_PATTERN.test(text)
}

// Streaming reveal speed (non-whitespace text units per second).
export const READING_SPEED_OPTIONS = [
  { id: 'slow', label: '0.5×', unitsPerSecond: 10 },
  { id: 'normal', label: '1×', unitsPerSecond: 20 },
  { id: 'fast', label: '1.5×', unitsPerSecond: 30 },
  { id: 'faster', label: '2×', unitsPerSecond: 40 },
] as const

export type ReadingSpeed = (typeof READING_SPEED_OPTIONS)[number]['id']
export type ReadingSpeedOption = (typeof READING_SPEED_OPTIONS)[number]

export const READING_SPEED_BY_ID = Object.fromEntries(
  READING_SPEED_OPTIONS.map(option => [option.id, option]),
) as Record<ReadingSpeed, ReadingSpeedOption>

const DEFAULT_READING_SPEED: ReadingSpeed = 'normal'

function isReadingSpeed(value: unknown): value is ReadingSpeed {
  return READING_SPEED_OPTIONS.some(option => option.id === value)
}

const readingSpeedPreference = createPreference<ReadingSpeed>({
  key: 'piece:reading-speed',
  defaultValue: DEFAULT_READING_SPEED,
  parse: raw => (isReadingSpeed(raw) ? raw : DEFAULT_READING_SPEED),
})

export const setReadingSpeed = readingSpeedPreference.set
export const useReadingSpeed = readingSpeedPreference.use
