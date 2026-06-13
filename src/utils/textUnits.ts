// A "display unit" is a single non-whitespace character. Whitespace is free, so
// pacing by units keeps reveal speed steady regardless of spacing/newlines.

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
