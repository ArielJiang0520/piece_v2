// A piece's action history, stored as a sidecar JSON column (`pieces.structure`) next to
// the flat `pieces.body`. Each segment is the prose produced by one generation action plus
// the action that produced it. Shared by both client and server (like generationModel.ts),
// so it stays free of React/DOM imports.

export type PieceAction = 'fresh' | 'expand' | 'continue' | 'regenerate'

export interface PieceSegment {
  // The action that produced this segment's text. The first segment is always 'fresh'
  // (the origin prose); 'regenerate' is the per-paragraph Continue.
  action: PieceAction
  // The optional steer typed for the action ('' when none).
  direction: string
  text: string
}

export interface PieceStructure {
  v: 1
  segments: PieceSegment[]
}

const ACTIONS: readonly PieceAction[] = ['fresh', 'expand', 'continue', 'regenerate']

function isAction(value: unknown): value is PieceAction {
  return typeof value === 'string' && (ACTIONS as readonly string[]).includes(value)
}

// Validate a stored/received structure against the piece body. Returns null when the
// payload is malformed, empty, or doesn't reconstruct the body exactly — callers then fall
// back to treating the piece as plain text, so a bad structure never yields wrong markers.
export function parseStructure(raw: unknown, body: string): PieceStructure | null {
  let value: any = raw
  if (typeof raw === 'string') {
    if (!raw) return null
    try {
      value = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (!value || typeof value !== 'object' || value.v !== 1 || !Array.isArray(value.segments)) return null

  const segments: PieceSegment[] = []
  for (const seg of value.segments) {
    if (!seg || typeof seg !== 'object') return null
    if (!isAction(seg.action)) return null
    if (typeof seg.direction !== 'string' || typeof seg.text !== 'string') return null
    segments.push({ action: seg.action, direction: seg.direction, text: seg.text })
  }
  if (segments.length === 0) return null
  // The whole point of the structure is to decompose exactly this body.
  if (segments.map(s => s.text).join('') !== body) return null

  return { v: 1, segments }
}

export function serializeStructure(structure: PieceStructure): string {
  return JSON.stringify(structure)
}

// Absolute char offset at which each segment begins; aligned with `segments`. Index 0 is
// always 0 (the origin segment).
export function segmentStartOffsets(segments: PieceSegment[]): number[] {
  const offsets: number[] = []
  let acc = 0
  for (const seg of segments) {
    offsets.push(acc)
    acc += seg.text.length
  }
  return offsets
}
