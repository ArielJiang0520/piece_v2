// Hard guarantee that at most ONE OpenRouter generation runs at a time, process-wide.
// The OpenRouter account allows a single concurrent session; overlapping calls get the
// whole account rate-limited (429). Everything that talks to OpenRouter's streaming
// chat endpoint must go through `withGenerationSlot`.
//
// Three concerns, kept separate:
//   1. Serialization (the mutex): a promise chain ensures call N+1 never opens its
//      socket until call N has fully drained — plus a short settle so OpenRouter frees
//      the slot on its side before the next one opens.
//   2. Replacement (the registry): a user's new action (expand/continue/etc.) aborts
//      their own in-flight run by owner key, so the queue drains promptly instead of
//      waiting for the abandoned run to finish on its own.
//   3. Frequency (the interval): request *starts* are spaced by a minimum gap so a fast
//      drain or rapid refires can't fire a cluster that trips OpenRouter's rate limit.

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

// Frequency floor: two OpenRouter requests never *start* closer together than this,
// process-wide. The mutex only guarantees one-at-a-time; this guarantees not-too-often,
// so a fast drain or rapid refires can't fire a cluster of requests that trips
// OpenRouter's per-model request-rate limit. Long streams already exceed it, so it only
// bites when runs are short or replaced quickly. Same in dev and prod.
const MIN_REQUEST_INTERVAL_MS = 1000
let lastSlotStartedAt = 0

// Register a new run. Aborts any prior run for the same owner so the chain advances
// instead of waiting on an abandoned stream. Call this synchronously when the request
// arrives, BEFORE awaiting the slot.
export function registerGeneration(ownerKey: string, controller: AbortController) {
  const prior = owners.get(ownerKey)
  if (prior) {
    // A run being replaced before it finished is a refire — logged so a burst of them
    // (which still counts as requests against OpenRouter's per-model rate limit) shows up.
    console.log('[generation replaced]', new Date().toISOString(), ownerKey)
    prior.controller.abort()
  }
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
    // Hold off until at least MIN_REQUEST_INTERVAL_MS has passed since the previous slot
    // opened, so request *starts* are spaced even when runs drain quickly.
    const sinceLast = Date.now() - lastSlotStartedAt
    if (sinceLast < MIN_REQUEST_INTERVAL_MS) {
      await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - sinceLast))
    }
    lastSlotStartedAt = Date.now()
    await task()
  } finally {
    await new Promise(resolve => setTimeout(resolve, SETTLE_MS))
    release()
  }
}
