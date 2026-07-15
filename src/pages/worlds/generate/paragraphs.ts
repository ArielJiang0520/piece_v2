import type { PieceSegment } from '../shared/pieceStructure'
import { segmentStartOffsets } from '../shared/pieceStructure'

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

// The window of prose around a liked paragraph: up to `radius` paragraphs before and after
// it, joined with blank lines. Stored alongside the like so the taste distiller reads the
// loved passage inside its surrounding flow, not as a bare line. Returns just the paragraph
// itself when it sits at the very start/end (or can't be located).
export function buildLikeContext(text: string, paragraphIndex: number, radius = 1): string {
  const paragraphs = splitParagraphs(text)
  const at = paragraphs.findIndex(p => p.index === paragraphIndex)
  if (at === -1) return ''
  const start = Math.max(0, at - radius)
  const end = Math.min(paragraphs.length, at + radius + 1)
  return paragraphs.slice(start, end).map(p => p.text.trim()).join('\n\n')
}

export interface AnnotatedParagraph extends Paragraph {
  // Set when a recorded action's output begins at this paragraph, so the static reader can
  // show a marker there. `segmentIndex` keys the re-run; `action`/`direction` describe it.
  segmentIndex?: number
  action?: PieceSegment['action']
  direction?: string
}

// Map each segment (K>=1) onto the paragraph where its text begins. Every action caps the
// kept prior text with a blank line, so a segment start always lands on a paragraph
// boundary; if an offset doesn't match a start exactly, it snaps to the nearest following
// paragraph. The first segment (the origin) never carries a marker.
export function annotateParagraphs(text: string, segments: PieceSegment[]): AnnotatedParagraph[] {
  const paragraphs: AnnotatedParagraph[] = splitParagraphs(text)
  if (segments.length <= 1) return paragraphs

  // Absolute char start of each raw split part, so paragraph `index` → offset in `text`.
  const parts = text.split(PARAGRAPH_SPLIT_RE)
  const partOffsets: number[] = []
  let acc = 0
  for (const part of parts) {
    partOffsets.push(acc)
    acc += part.length
  }

  const offsets = segmentStartOffsets(segments)
  for (let k = 1; k < segments.length; k++) {
    const target = offsets[k]
    const chosen =
      paragraphs.find(p => partOffsets[p.index] >= target) ?? paragraphs[paragraphs.length - 1]
    if (chosen) {
      chosen.segmentIndex = k
      chosen.action = segments[k].action
      chosen.direction = segments[k].direction
    }
  }
  return paragraphs
}
