// Hard guarantee that at most ONE OpenRouter generation runs at a time, process-wide.
// The OpenRouter account allows a single concurrent session; overlapping calls get the
// whole account rate-limited (429). Everything that talks to OpenRouter's streaming
// chat endpoint must go through `withGenerationSlot`.
//
// Two concerns, kept separate:
//   1. Serialization (the mutex): a promise chain ensures call N+1 never opens its
//      socket until call N has fully drained — plus a short settle so OpenRouter frees
//      the slot on its side before the next one opens.
//   2. Replacement (the registry): a user's new action (expand/continue/etc.) aborts
//      their own in-flight run by owner key, so the queue drains promptly instead of
//      waiting for the abandoned run to finish on its own.

interface Registered {
  controller: AbortController
}

// ownerKey (`${userId}:${worldId}`) -> the latest run for that owner.
const owners = new Map<string, Registered>()

// The mutex: each acquired slot appends to this chain; the next slot awaits it.
let tail: Promise<void> = Promise.resolve()

// Time to let OpenRouter release its single concurrent slot after a run ends/aborts
// before the next run opens its socket. Erring toward "we wait" over "we 429".
const SETTLE_MS = 300

// Register a new run. Aborts any prior run for the same owner so the chain advances
// instead of waiting on an abandoned stream. Call this synchronously when the request
// arrives, BEFORE awaiting the slot.
export function registerGeneration(ownerKey: string, controller: AbortController) {
  owners.get(ownerKey)?.controller.abort()
  owners.set(ownerKey, { controller })
}

// Drop a run from the registry once it has finished (only if it's still the latest).
export function clearGeneration(ownerKey: string, controller: AbortController) {
  if (owners.get(ownerKey)?.controller === controller) owners.delete(ownerKey)
}

// Abort the current run for an owner, if any (used by the explicit /stop endpoint).
export function abortGeneration(ownerKey: string): boolean {
  const entry = owners.get(ownerKey)
  if (!entry) return false
  entry.controller.abort()
  return true
}

// Run `task` as the sole OpenRouter session. Blocks until every earlier slot has
// drained, then runs, then holds the slot through a short settle before releasing.
export async function withGenerationSlot(task: () => Promise<void>): Promise<void> {
  const prior = tail
  let release!: () => void
  tail = new Promise<void>(resolve => { release = resolve })

  await prior
  try {
    await task()
  } finally {
    await new Promise(resolve => setTimeout(resolve, SETTLE_MS))
    release()
  }
}
