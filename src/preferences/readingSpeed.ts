import { createPreference } from './createPreference'

const CHINESE_TEXT_PATTERN = /\p{Script=Han}/u

export function containsChineseText(text: string) {
  return CHINESE_TEXT_PATTERN.test(text)
}

// Streaming reveal speed (non-whitespace text units per second).
// The slider is driven entirely by these three knobs — tune the feel here.
export const READING_SPEED_MIN = 2
export const READING_SPEED_MAX = 30
export const READING_SPEED_STEP = 1

const DEFAULT_READING_SPEED = 15

function snapReadingSpeed(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_READING_SPEED
  const clamped = Math.min(READING_SPEED_MAX, Math.max(READING_SPEED_MIN, value))
  const steps = Math.round((clamped - READING_SPEED_MIN) / READING_SPEED_STEP)
  return READING_SPEED_MIN + steps * READING_SPEED_STEP
}

const readingSpeedPreference = createPreference<number>({
  key: 'piece:reading-speed',
  defaultValue: DEFAULT_READING_SPEED,
  parse: raw => (raw === null ? DEFAULT_READING_SPEED : snapReadingSpeed(Number(raw))),
})

export const setReadingSpeed = readingSpeedPreference.set
export const useReadingSpeed = readingSpeedPreference.use
