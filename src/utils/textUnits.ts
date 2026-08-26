// A "display unit" is a single non-whitespace character. Whitespace is free, so
// pacing by units keeps reveal speed steady regardless of spacing/newlines.

export function isDisplayUnit(char: string) {
  return /\S/u.test(char)
}

/**
 * Index at which a reveal starting at `from` should stop, having taken at most `maxUnits`
 * non-whitespace characters. Whitespace is free and rides along, so the result sits just
 * past the last free-flowing whitespace and before the next display unit that wouldn't fit.
 *
 * Walks `text` in place rather than slicing it: the paced reveal calls this many times a
 * second against a buffer that runs far ahead of what's on screen, and it only needs a
 * character or two each time — copying the whole unrevealed remainder to find them made the
 * cost of a tick scale with the length of the piece.
 */
export function advanceByUnits(text: string, from: number, maxUnits: number): number {
  let unitCount = 0
  let end = from

  while (end < text.length) {
    // Step by code point so a surrogate pair is never split down the middle.
    const width = (text.codePointAt(end) ?? 0) > 0xffff ? 2 : 1
    const cost = isDisplayUnit(text.slice(end, end + width)) ? 1 : 0
    if (cost > 0 && unitCount + cost > maxUnits && end > from) break
    unitCount += cost
    end += width
  }

  return end
}
