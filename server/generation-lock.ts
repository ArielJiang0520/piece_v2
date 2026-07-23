// Serialization for OpenRouter generations, scoped per owner.
//
// This used to be a process-wide single-session mutex (the account was believed to allow
// only one concurrent session, and overlap 429'd the whole key). Concurrent calls no longer
// throttle, so the global lock is gone: background work (Discover refills, taste distills)
// runs alongside a live story stream instead of queueing behind it.
//
// Three concerns, kept separate:
//   1. Serialization (per owner): a promise chain per ownerKey ensures call N+1 for that
//      owner never opens its socket until call N has fully drained — plus a short settle.
//      This is what makes "a new action always fully stops the previous one" true: the
//      registry aborts the prior run, and the chain waits for it to actually close.
//   2. Replacement (the registry): a user's new action (expand/continue/etc.) aborts
//      their own in-flight run by owner key, so the chain drains promptly instead of
//      waiting for the abandoned run to finish on its own.
//   3. Frequency (the interval): request *starts* are spaced globally by a minimum gap, so
//      a fast drain or rapid refires can't fire a cluster that trips a rate limit. This
//      spaces starts only — it never serializes whole runs.

interface Registered {
  controller: AbortController
}

// ownerKey (`${userId}:${worldId}`, prefixed for background jobs) -> the latest run for it.
const owners = new Map<string, Registered>()

// The per-owner mutexes: each acquired slot appends to its owner's chain; the next slot for
// that same owner awaits it. Entries are dropped once an owner's chain goes idle.
const tails = new Map<string, Promise<void>>()

// Time to let OpenRouter release the connection after a run ends/aborts before the same
// owner's next run opens its socket. Erring toward "we wait" over "we 429".
const SETTLE_MS = 300

// Frequency floor: two OpenRouter requests never *start* closer together than this,
// process-wide (across all owners). Long streams already exceed it, so it only bites when
// runs are short or replaced quickly. Same in dev and prod.
const MIN_REQUEST_INTERVAL_MS = 1000
let lastSlotStartedAt = 0
// A tiny chain used only to hand out start times one at a time, so two owners waiting for
// the interval can't both decide they're clear at the same moment.
let startGate: Promise<void> = Promise.resolve()

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Wait until the frequency floor allows another request to start, then claim that start.
function claimRequestStart(): Promise<void> {
  const next = startGate.then(async () => {
    const sinceLast = Date.now() - lastSlotStartedAt
    if (sinceLast < MIN_REQUEST_INTERVAL_MS) await sleep(MIN_REQUEST_INTERVAL_MS - sinceLast)
    lastSlotStartedAt = Date.now()
  })
  startGate = next.catch(() => {})
  return next
}

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

// Run `task` as this owner's only OpenRouter session. Blocks until every earlier slot for
// the same owner has drained, then runs, then holds the slot through a short settle before
// releasing. Other owners are unaffected.
export async function withGenerationSlot(ownerKey: string, task: () => Promise<void>): Promise<void> {
  const prior = tails.get(ownerKey) ?? Promise.resolve()
  let release!: () => void
  const mine = new Promise<void>(resolve => { release = resolve })
  tails.set(ownerKey, mine)

  await prior
  try {
    await claimRequestStart()
    await task()
  } finally {
    await sleep(SETTLE_MS)
    release()
    // Last one out for this owner cleans up, so the map doesn't grow per user/world forever.
    if (tails.get(ownerKey) === mine) tails.delete(ownerKey)
  }
}
