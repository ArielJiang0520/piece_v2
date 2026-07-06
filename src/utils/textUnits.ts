// A "display unit" is a single non-whitespace character. Whitespace is free, so
// pacing by units keeps reveal speed steady regardless of spacing/newlines.

const HAN_CHAR_PATTERN = /\p{Script=Han}/gu

/**
 * Rough token estimate for a piece of text, good enough to gate things by an
 * approximate budget (not an exact tokenizer). Han characters count as ~1 token
 * each; the remaining text is estimated at ~4 characters per token.
 */
export function estimateTokens(text: string) {
  const han = text.match(HAN_CHAR_PATTERN)?.length ?? 0
  const rest = text.replace(HAN_CHAR_PATTERN, '').trim()
  return han + Math.ceil(rest.length / 4)
}

export function isDisplayUnit(char: string) {
  return /\S/u.test(char)
}

/**
 * Slice `text` so that it contains at most `maxUnits` non-whitespace characters,
 * carrying trailing/leading whitespace along for free. Returns the visible slice
 * plus the remainder.
 */
export function sliceByUnits(text: string, maxUnits: number) {
  let unitCount = 0
  let end = 0

  for (const char of text) {
    const cost = isDisplayUnit(char) ? 1 : 0
    if (cost > 0 && unitCount + cost > maxUnits && end > 0) break
    unitCount += cost
    end += char.length
  }

  return {
    visible: text.slice(0, end),
    remaining: text.slice(end),
  }
}
