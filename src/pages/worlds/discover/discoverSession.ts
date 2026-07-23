import { useSyncExternalStore } from 'react'

// The Discover deck lives in module memory and mirrors itself into localStorage, so closing the
// app and coming back lands on the same card. The deck is purely a client-side browse cache —
// the server keeps no record of what was offered. Keyed per (world, version): versions are
// branches, so switching versions starts a fresh deck and switching back restores the old one.
// The mirror is trimmed, not whole: only a few cards behind the reader survive a reload
// (PERSIST_BEHIND), so already-read premises silently fall off the head over time instead of
// accumulating forever. Within a live session the full deck stays browsable back — trimming only
// ever happens to the stored copy.

export interface DiscoverCard {
  text: string
  kind: 'aligned' | 'wildcard'
  // Client-only: powers the "cards waiting" badge on the prompt list. Never sent anywhere.
  shown: boolean
  liked: boolean
}

export interface DiscoverSession {
  cards: DiscoverCard[]
  index: number
  fetching: boolean
  error: string | null
}

// How many already-read cards to keep behind the reader in the stored copy. Enough to browse a
// little way back after a reload, few enough that storage stays flat no matter how long the deck
// ran.
const PERSIST_BEHIND = 5

const sessions = new Map<string, DiscoverSession>()
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function deckKey(worldId: number, versionId: number) {
  return `${worldId}:${versionId}`
}

function storageKey(worldId: number, versionId: number) {
  return `piece:discover-deck:${worldId}:${versionId}`
}

function isStoredCard(value: unknown): value is DiscoverCard {
  if (typeof value !== 'object' || value === null) return false
  const card = value as Record<string, unknown>
  return (
    typeof card.text === 'string' &&
    (card.kind === 'aligned' || card.kind === 'wildcard') &&
    typeof card.shown === 'boolean' &&
    typeof card.liked === 'boolean'
  )
}

function loadSession(worldId: number, versionId: number): DiscoverSession | null {
  try {
    // Decks from before version keying are unreadable under any current key; sweep the old slot.
    window.localStorage.removeItem(`piece:discover-deck:${worldId}`)
    const raw = window.localStorage.getItem(storageKey(worldId, versionId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as { cards?: unknown; index?: unknown }
    if (!Array.isArray(parsed.cards) || !parsed.cards.every(isStoredCard)) return null
    const index = typeof parsed.index === 'number' ? parsed.index : 0
    return {
      cards: parsed.cards,
      index: Math.max(0, Math.min(index, parsed.cards.length)),
      fetching: false,
      error: null,
    }
  } catch {
    return null
  }
}

function persistSession(worldId: number, versionId: number, session: DiscoverSession) {
  // Trim the head before writing: everything more than PERSIST_BEHIND cards behind the reader is
  // dropped from the stored copy, which is where "old cards quietly disappear" happens.
  const drop = Math.max(0, session.index - PERSIST_BEHIND)
  try {
    window.localStorage.setItem(storageKey(worldId, versionId), JSON.stringify({
      cards: session.cards.slice(drop),
      index: session.index - drop,
    }))
  } catch {
    // Quota or private-mode failure — the deck just goes back to being session-only.
  }
}

function createSession(): DiscoverSession {
  return {
    cards: [],
    index: 0,
    fetching: false,
    error: null,
  }
}

export function getDiscoverSession(worldId: number, versionId: number): DiscoverSession {
  const key = deckKey(worldId, versionId)
  let session = sessions.get(key)
  if (!session) {
    session = loadSession(worldId, versionId) ?? createSession()
    sessions.set(key, session)
  }
  return session
}

// Every mutation replaces the session object so useSyncExternalStore sees a new reference.
function update(worldId: number, versionId: number, change: (session: DiscoverSession) => DiscoverSession) {
  const next = change(getDiscoverSession(worldId, versionId))
  sessions.set(deckKey(worldId, versionId), next)
  persistSession(worldId, versionId, next)
  emit()
}

export function useDiscoverSession(worldId: number, versionId: number): DiscoverSession {
  return useSyncExternalStore(subscribe, () => getDiscoverSession(worldId, versionId))
}

export function setFetching(worldId: number, versionId: number, fetching: boolean) {
  update(worldId, versionId, session => (session.fetching === fetching ? session : { ...session, fetching }))
}

export function setError(worldId: number, versionId: number, error: string | null) {
  update(worldId, versionId, session => (session.error === error ? session : { ...session, error }))
}

export function appendCards(worldId: number, versionId: number, cards: DiscoverCard[]) {
  if (cards.length === 0) return
  update(worldId, versionId, session => {
    // The model is told not to repeat, but nothing guarantees it — drop exact duplicates so the
    // deck never shows the same premise twice.
    const seen = new Set(session.cards.map(card => card.text.trim()))
    const fresh = cards.filter(card => !seen.has(card.text.trim()))
    return fresh.length === 0 ? session : { ...session, cards: [...session.cards, ...fresh] }
  })
}

// The deck is one slide longer than it has cards: the last slide is the placeholder the reader
// swipes into while the next batch is still coming, so the index may legitimately sit at
// cards.length.
export function setIndex(worldId: number, versionId: number, index: number) {
  update(worldId, versionId, session => {
    const clamped = Math.max(0, Math.min(index, session.cards.length))
    return clamped === session.index ? session : { ...session, index: clamped }
  })
}

export function markCardShown(worldId: number, versionId: number, text: string) {
  update(worldId, versionId, session => {
    if (!session.cards.some(card => card.text === text && !card.shown)) return session
    return {
      ...session,
      cards: session.cards.map(card => (card.text === text ? { ...card, shown: true } : card)),
    }
  })
}

export function setCardLiked(worldId: number, versionId: number, text: string, liked: boolean) {
  update(worldId, versionId, session => {
    if (!session.cards.some(card => card.text === text && card.liked !== liked)) return session
    return {
      ...session,
      cards: session.cards.map(card => (card.text === text ? { ...card, liked } : card)),
    }
  })
}
