// One brainstorming session, shared by both prompt-generation features ("Ideas" spins premises out
// of the world, "More like this" builds off an existing prompt). The session is the whole product
// here: the writer types a vague fragment, gets five candidates, marks the ones worth pursuing,
// adds a note, and rolls again — for as many rounds as it takes.
//
// Two rules give the loop its shape, and they pull in opposite directions on purpose:
//
//   - `notes` ACCUMULATE. Every non-empty thing the writer types is appended in order, and the
//     whole trail is sent each round. This is the instruction growing as the session goes.
//   - `kept` is ONE ROUND ONLY. Keeping a candidate spares it from being replaced, but the next
//     board arrives with every mark cleared and the survivors shuffled back in among the fresh
//     ones. A keep is a vote about what is on screen right now, never a standing fact, so no
//     candidate coasts on an earlier round's approval and the board is always judged fresh.
//
// Nothing negative is ever recorded. A candidate the writer left unmarked is simply gone next
// round — it is not remembered as a dislike, because declining to tap something isn't one.
export interface PromptSession {
  notes: string[]
  candidates: string[]
  kept: string[]
  // The candidates the model wrote FOR THIS round — the ones that carry the green "new" pill.
  // Survivors kept from the previous board are not in here, so they arrive unmarked: a survivor is
  // no longer new, and its keep-mark was cleared when the round turned over.
  fresh: string[]
  // How many boards the writer has generated. 0 before the first, so it doubles as "has a board".
  round: number
}

export const EMPTY_PROMPT_SESSION: PromptSession = { notes: [], candidates: [], kept: [], fresh: [], round: 0 }

export function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export function parsePromptSession(value: unknown): PromptSession {
  const raw = value as Partial<PromptSession> | undefined
  const candidates = stringArray(raw?.candidates)
  return {
    notes: stringArray(raw?.notes),
    candidates,
    kept: stringArray(raw?.kept),
    fresh: stringArray(raw?.fresh),
    // Sessions saved before the round counter existed have no `round` but do have a board — that
    // board is at least round one, so fall back to 1 rather than showing "Round 0".
    round: typeof raw?.round === 'number' ? raw.round : (candidates.length > 0 ? 1 : 0),
  }
}

export function toggleKept(session: PromptSession, text: string): PromptSession {
  const kept = session.kept.includes(text)
    ? session.kept.filter(item => item !== text)
    : [...session.kept, text]
  return { ...session, kept }
}

// The trail sent to the model for the round about to run: everything said before, plus whatever
// the writer typed into the box this time (blank is fine — a round can be pure keeps).
export function trailWith(session: PromptSession, note: string): string[] {
  const trimmed = note.trim()
  return trimmed ? [...session.notes, trimmed] : session.notes
}

// Position is a bias of its own: survivors parked at the top of every board would read as endorsed
// before they are read. Shuffling once, here, when the round is built (not per render) keeps the
// order stable while the board is on screen and keeps a survivor indistinguishable from a fresh
// candidate — which is the point of clearing the marks.
function shuffled(items: string[]): string[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export function nextRound(session: PromptSession, trail: string[], fresh: string[]): PromptSession {
  return {
    notes: trail,
    candidates: shuffled([...session.kept, ...fresh]),
    kept: [],
    // Only the model's freshly written ones are "new" this round; the survivors mixed in with them
    // are not. In round one, `session.kept` is empty, so every candidate is new — as it should be.
    fresh,
    round: session.round + 1,
  }
}
