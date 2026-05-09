import { createPreference } from './createPreference'

export const DEFAULT_READING_SPEED_UNITS_PER_SECOND = 50
export const MIN_READING_SPEED_UNITS_PER_SECOND = 10
export const MAX_READING_SPEED_UNITS_PER_SECOND = 60
export const READING_SPEED_STEP = 5
export const CHINESE_READING_SPEED_MULTIPLIER = 2

const CHINESE_TEXT_PATTERN = /\p{Script=Han}/u

function clampReadingSpeed(value: number) {
  const stepped = Math.round(value / READING_SPEED_STEP) * READING_SPEED_STEP
  return Math.min(
    MAX_READING_SPEED_UNITS_PER_SECOND,
    Math.max(MIN_READING_SPEED_UNITS_PER_SECOND, stepped),
  )
}

function parseReadingSpeed(raw: string | null) {
  if (!raw) return DEFAULT_READING_SPEED_UNITS_PER_SECOND
  const numeric = Number(raw)
  return Number.isFinite(numeric) ? clampReadingSpeed(numeric) : DEFAULT_READING_SPEED_UNITS_PER_SECOND
}

const readingSpeedPreference = createPreference<number>({
  key: 'piece:reading-speed',
  defaultValue: DEFAULT_READING_SPEED_UNITS_PER_SECOND,
  parse: parseReadingSpeed,
})

export function containsChineseText(text: string) {
  return CHINESE_TEXT_PATTERN.test(text)
}

export function getHiddenReadingSpeedUnitsPerSecond(text: string, readingSpeedUnitsPerSecond: number) {
  return containsChineseText(text)
    ? readingSpeedUnitsPerSecond * CHINESE_READING_SPEED_MULTIPLIER
    : readingSpeedUnitsPerSecond
}

export const setReadingSpeedUnitsPerSecond = readingSpeedPreference.set
export const useReadingSpeedUnitsPerSecond = readingSpeedPreference.use
