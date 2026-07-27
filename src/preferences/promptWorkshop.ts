// One prompt workshop, shared by both prompt-generation features ("Ideas" works from the world
// setting, "More like this" works from an existing prompt). The workshop is the whole product
// here: the writer says what they are after, gets ONE prompt back, says what to change, gets the
// revised prompt, and keeps going for as many rounds as it takes.
//
// It is stored as the conversation it is, because that is also exactly what gets sent to the
// model — note, draft, note, draft — and because it makes going back a truncation instead of a
// special case:
//
//   notes[0]  is the seed; notes[i>0] is the revision that produced drafts[i].
//   drafts[i] is what came back from notes[0..i].
//
// While idle the two arrays are the same length. Revising from an earlier draft throws away
// everything after it — the same "checked-out HEAD" model the world versions use, and the only
// way out of a direction that has overcooked short of starting over.
export interface PromptWorkshop {
  notes: string[]
  drafts: string[]
  // Which draft is on screen. Always a valid index into `drafts` while one exists.
  viewing: number
}

export const EMPTY_PROMPT_WORKSHOP: PromptWorkshop = { notes: [], drafts: [], viewing: 0 }

export function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export function parsePromptWorkshop(value: unknown): PromptWorkshop {
  const raw = value as Partial<PromptWorkshop> | undefined
  const drafts = stringArray(raw?.drafts)
  // No drafts means nothing worth restoring — including a session saved by the older five-candidate
  // board, whose shape has no drafts at all. Those retire silently rather than being migrated: a
  // board of five parallel candidates has no draft trail to become.
  if (drafts.length === 0) return EMPTY_PROMPT_WORKSHOP

  // A note per draft. A trail longer than the drafts it produced would put the composer and the
  // stepper out of step, so the pair is trimmed to the shorter of the two.
  const notes = stringArray(raw?.notes).slice(0, drafts.length)
  const paired = drafts.slice(0, notes.length)
  if (paired.length === 0) return EMPTY_PROMPT_WORKSHOP

  const viewing = typeof raw?.viewing === 'number' ? raw.viewing : paired.length - 1
  return {
    notes,
    drafts: paired,
    viewing: Math.min(Math.max(0, Math.floor(viewing)), paired.length - 1),
  }
}

// The conversation as it stood when `index` was the newest draft — what gets sent to the model for
// a revision made from there, and what survives it. Revising from the latest draft passes the
// whole trail; revising from an earlier one drops everything the writer has stepped back past.
export function historyFor(workshop: PromptWorkshop, index: number): { notes: string[]; drafts: string[] } {
  const end = Math.min(Math.max(0, index + 1), workshop.drafts.length)
  return { notes: workshop.notes.slice(0, end), drafts: workshop.drafts.slice(0, end) }
}

// A new draft lands after the one it was revised from, and becomes the one on screen.
export function withDraft(
  workshop: PromptWorkshop,
  note: string,
  draft: string,
  fromIndex: number,
): PromptWorkshop {
  const history = historyFor(workshop, fromIndex)
  const notes = [...history.notes, note]
  return { notes, drafts: [...history.drafts, draft], viewing: notes.length - 1 }
}

export function viewingDraft(workshop: PromptWorkshop): string | null {
  return workshop.drafts[workshop.viewing] ?? null
}

// Re-running the draft on screen: the same note, against the same conversation that produced it.
// `historyFor(index - 1)` is everything BEFORE this draft, and `notes[index]` is the note that made
// it — so the request is byte-identical to the one that produced what is on screen, which is what
// makes it a fair second look at the same ask rather than a new round.
export function regenerationRequest(
  workshop: PromptWorkshop,
  index: number,
): { notes: string[]; drafts: string[]; note: string } | null {
  const note = workshop.notes[index]
  if (note === undefined) return null
  const history = historyFor(workshop, index - 1)
  return { notes: [...history.notes, note], drafts: history.drafts, note }
}

// The re-run lands in place of the draft it replaces. Drafts made from the old one go, for the
// same reason stepping back and revising drops them: they were written against text that no longer
// exists, so keeping them would leave the trail claiming a descent that isn't there.
export function withRegeneratedDraft(
  workshop: PromptWorkshop,
  draft: string,
  index: number,
): PromptWorkshop {
  return {
    notes: workshop.notes.slice(0, index + 1),
    drafts: [...workshop.drafts.slice(0, index), draft],
    viewing: index,
  }
}
