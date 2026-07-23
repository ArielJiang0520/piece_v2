import { useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import { useToast } from '@/components/Toast'
import { useUiText } from '@/i18n'
import { LOW_WATER, refillDiscoverDeck } from './discoverRefill'
import {
  markCardShown,
  setCardLiked,
  setIndex,
  useDiscoverSession,
  type DiscoverCard,
} from './discoverSession'

// The session store is the source of truth here, not TanStack Query: the deck is append-only,
// survives navigating to the generate screen and back without refetching, and is restored from
// localStorage across app launches (see discoverSession). The caller (DiscoverScreen) resolves
// the world's checked-out version and gates `enabled` on the world having a setting at all.
export function useDiscoverFeed(worldId: number, versionId: number, enabled: boolean) {
  const t = useUiText()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const session = useDiscoverSession(worldId, versionId)

  const refill = useCallback(async () => {
    if (!enabled) return
    await refillDiscoverDeck(worldId, versionId, t.discoverError)
  }, [enabled, t, versionId, worldId])

  // Cold start, and the low-water refill. Both are the same call; which one it is only depends on
  // how much deck is left ahead of the reader.
  const remaining = session.cards.length - session.index - 1
  useEffect(() => {
    if (!enabled || session.fetching || session.error) return
    if (session.cards.length === 0 || remaining <= LOW_WATER) void refill()
  }, [enabled, refill, remaining, session.cards.length, session.error, session.fetching])

  // The card reached the reader's eyes — a purely local flag that feeds the prompt-list badge.
  useEffect(() => {
    const card = session.cards[session.index]
    if (!card || card.shown) return
    markCardShown(worldId, versionId, card.text)
  }, [session.cards, session.index, versionId, worldId])

  const like = useCallback(async (card: DiscoverCard) => {
    if (card.liked) return
    setCardLiked(worldId, versionId, card.text, true)
    try {
      await apiFetch(`/api/worlds/${worldId}/discover/like`, {
        method: 'POST',
        body: JSON.stringify({ text: card.text }),
      })
      // The premise is a real prompt now, so the Prompts tab and its count are stale.
      queryClient.invalidateQueries({ queryKey: ['world-clusters', String(worldId)] })
      queryClient.invalidateQueries({ queryKey: ['world-clusters-count', String(worldId)] })
      // The Prompts tab is a tab away, so say where it went.
      toast.show({ kind: 'success', title: t.discoverSavedToPrompts })
    } catch (error) {
      // A failed like is about this card, not the deck — surfacing it as a deck error would
      // stall refills behind a retry the reader never asked for.
      setCardLiked(worldId, versionId, card.text, false)
      toast.show({ kind: 'error', title: error instanceof Error ? error.message : t.discoverError })
    }
  }, [queryClient, t, toast, versionId, worldId])

  // Writing from a card records nothing by itself — the positive signal is the piece the reader
  // saves, which lands in the DB through the ordinary pieces flow.
  const generate = useCallback((card: DiscoverCard) => {
    // Discarding the read comes back here, to this card — the deck lives in the session store,
    // so the reader lands on the premise they left rather than on a prompt draft.
    navigate(`/worlds/${worldId}/prompt/new/generate`, {
      state: { prompt: card.text, generated: true, returnTo: `/worlds/${worldId}/discover` },
    })
  }, [navigate, worldId])

  // Edit is the middle road between Keep and Write: the premise was close, but the reader wants
  // their own hand on it first. It lands on the draft page with the text in the box, unsubmitted —
  // nothing is recorded unless they save, at which point it becomes an ordinary prompt row.
  const edit = useCallback((card: DiscoverCard) => {
    navigate(`/worlds/${worldId}/prompt/new`, {
      state: { draftPrompt: card.text, generated: true },
    })
  }, [navigate, worldId])

  const goTo = useCallback((index: number) => setIndex(worldId, versionId, index), [versionId, worldId])

  return { session, refill, like, edit, generate, goTo }
}
