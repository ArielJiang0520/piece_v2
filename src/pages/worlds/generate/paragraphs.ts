// Paragraphs are separated by one or more blank lines. We split while keeping the
// separators (capturing group) so a paragraph's position in the split array is a
// stable index shared between the renderer (GenerateOutput) and the expansion logic
// (GenerateOverlay): even positions are paragraph text, odd positions are separators.
const PARAGRAPH_SPLIT_RE = /(\n{2,})/

export interface Paragraph {
  // Index within the raw split array (always even). Used as the selection key and
  // passed back to buildExpandPrefix so both sides agree on which block is meant.
  index: number
  text: string
}

export function splitParagraphs(text: string): Paragraph[] {
  const parts = text.split(PARAGRAPH_SPLIT_RE)
  const result: Paragraph[] = []
  for (let i = 0; i < parts.length; i += 2) {
    const value = parts[i]
    if (!value || value.trim().length === 0) continue
    result.push({ index: i, text: value })
  }
  return result
}

// The text kept when expanding `paragraphIndex`: everything through that paragraph,
// trimmed of trailing whitespace and capped with a single blank line so the new
// continuation streams in as a fresh paragraph below it.
export function buildExpandPrefix(text: string, paragraphIndex: number): string {
  const parts = text.split(PARAGRAPH_SPLIT_RE)
  const through = parts.slice(0, paragraphIndex + 1).join('')
  return `${through.replace(/\s+$/, '')}\n\n`
}

// Fast-forward keeps the paragraph the reveal is currently sitting in, then cuts the
// rest of the (already-buffered, unrevealed) text. `revealedLength` is the reveal
// cursor into `buffer`: we extend to the end of the current paragraph (the next blank
// line at/after the cursor), or keep the whole buffer if that paragraph hasn't closed
// yet. Trailing whitespace is capped with one blank line so the next beat streams in
// as a fresh paragraph below.
export function buildFastForwardPrefix(buffer: string, revealedLength: number): string {
  const rest = buffer.slice(revealedLength)
  const match = rest.match(PARAGRAPH_SPLIT_RE)
  const cut = match && match.index !== undefined ? revealedLength + match.index : buffer.length
  return `${buffer.slice(0, cut).replace(/\s+$/, '')}\n\n`
}
