// A story's action history, stored as a sidecar JSON column (`stories.structure`) next to
// the flat `stories.body`. Each segment is the prose produced by one generation action plus
// the action that produced it. Shared by both client and server (like generationModel.ts),
// so it stays free of React/DOM imports.

export type StoryAction = 'fresh' | 'expand' | 'continue' | 'regenerate'

export interface StorySegment {
  // The action that produced this segment's text. The first segment is always 'fresh'
  // (the origin prose); 'regenerate' is the per-paragraph Continue.
  action: StoryAction
  // The optional steer typed for the action ('' when none).
  direction: string
  text: string
}

export interface StoryStructure {
  v: 1
  segments: StorySegment[]
}

const ACTIONS: readonly StoryAction[] = ['fresh', 'expand', 'continue', 'regenerate']

function isAction(value: unknown): value is StoryAction {
  return typeof value === 'string' && (ACTIONS as readonly string[]).includes(value)
}

// Validate a stored/received structure against the story body. Returns null when the
// payload is malformed, empty, or doesn't reconstruct the body exactly — callers then fall
// back to treating the story as plain text, so a bad structure never yields wrong markers.
export function parseStructure(raw: unknown, body: string): StoryStructure | null {
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

  const segments: StorySegment[] = []
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

export function serializeStructure(structure: StoryStructure): string {
  return JSON.stringify(structure)
}

// Absolute char offset at which each segment begins; aligned with `segments`. Index 0 is
// always 0 (the origin segment).
export function segmentStartOffsets(segments: StorySegment[]): number[] {
  const offsets: number[] = []
  let acc = 0
  for (const seg of segments) {
    offsets.push(acc)
    acc += seg.text.length
  }
  return offsets
}
