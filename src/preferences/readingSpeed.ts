const CHINESE_TEXT_PATTERN = /\p{Script=Han}/u

export function containsChineseText(text: string) {
  return CHINESE_TEXT_PATTERN.test(text)
}
