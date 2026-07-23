import { Heart, Loader2, Pencil, PenLine } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import { useUiText } from '@/i18n'
import { useTopNavConfig } from '@/components/topNavConfig'
import DiscoverCarousel from './DiscoverCarousel'
import { useDiscoverFeed } from './useDiscoverFeed'
import type { DiscoverCard } from './discoverSession'

// The Discover tab: one premise at a time, drawn from what this reader keeps choosing in this
// world, with the occasional deliberate long shot. Swiping browses the deck; the buttons are the
// only decisions — Keep saves it as a prompt, Edit opens it in the draft box, Write starts now.
export default function DiscoverScreen() {
  const t = useUiText()
  const { id } = useParams<{ id: string }>()
  const worldId = Number(id)

  // Discover is about a setting, so it needs the world before it can do anything: the deck is
  // keyed to the checked-out version, and a world with no setting has no feed at all.
  const worldQuery = useQuery({
    queryKey: ['world', id],
    queryFn: () => apiFetch(`/api/worlds/${id}`) as Promise<{ body: string; current_version_id: number | null }>,
    enabled: Number.isFinite(worldId),
  })
  const versionId = worldQuery.data?.current_version_id ?? null
  const hasSetting = (worldQuery.data?.body ?? '').trim().length > 0
  const ready = Number.isFinite(worldId) && versionId != null && hasSetting

  const { session, refill, like, edit, generate, goTo } = useDiscoverFeed(worldId, versionId ?? 0, ready)

  // Reached from the prompt list, so back goes there — and no tab row: Discover is a place you
  // go and come back from, not one of the world's tabs. The nav's main line is the world's name,
  // so "Discover" says where you are on the second line under it.
  useTopNavConfig({ backHref: id ? `/worlds/${id}` : '/worlds', secondaryTitle: t.discoverTab })

  // One slide past the cards: the deck's tail, where the reader waits for the next batch (or
  // retries a failed one).
  const slideCount = session.cards.length + 1

  function renderCard(card: DiscoverCard) {
    return (
      <div className="flex h-full w-full flex-col px-6 pb-6 pt-8">
        {/* Position and wildcard marker, kept for debugging: a counted deck reads as a finite
            list, and Discover should feel like it never runs out.
        <div className="flex items-center gap-3">
          <span className="t-eyebrow">{`${position + 1} / ${session.cards.length}`}</span>
          {card.kind === 'wildcard' && (
            <span className="rounded-full bg-paper-3 px-2.5 py-1 font-serif-zh text-[11px] italic leading-none text-ink-3">
              {t.discoverWildcard}
            </span>
          )}
        </div>
        */}

        {/* Never a scroller: a premise is one screenful by design, and a second scroll axis here
            fights the swipe for every gesture. */}
        <div className="flex min-h-0 flex-1 items-center overflow-hidden py-8">
          <p className="w-full text-center font-serif-zh text-[19px] leading-9 text-ink-2 wrap-break-word">
            {card.text}
          </p>
        </div>

        {/* Held one-handed with the left thumb: the actions sit low and left of center. Three
            pills is as much as a phone row takes, so they wrap rather than shrink. */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => like(card)}
            aria-pressed={card.liked}
            className={`inline-flex h-11 items-center gap-2 rounded-full px-5 font-serif-zh text-[15px] italic leading-none transition-transform duration-150 active:translate-y-px ${card.liked ? 'bg-rose-pale text-rose-deep' : 'bg-paper-2 text-ink-2'
              }`}
          >
            <Heart aria-hidden="true" className={`h-4 w-4 ${card.liked ? 'fill-current' : ''}`} />
            <span>{card.liked ? t.discoverLiked : t.discoverLike}</span>
          </button>
          <button
            type="button"
            onClick={() => edit(card)}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-paper-2 px-5 font-serif-zh text-[15px] italic leading-none text-ink-2 transition-transform duration-150 active:translate-y-px"
          >
            <Pencil aria-hidden="true" className="h-4 w-4" />
            <span>{t.edit}</span>
          </button>
          <button
            type="button"
            onClick={() => generate(card)}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-rose px-5 font-serif-zh text-[15px] italic leading-none text-white shadow-(--shadow-cta) transition-transform duration-150 active:translate-y-px"
          >
            <PenLine aria-hidden="true" className="h-4 w-4" />
            <span>{t.discoverGenerate}</span>
          </button>
        </div>
      </div>
    )
  }

  function renderTail() {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-5 px-10 text-center">
        {session.error ? (
          <>
            <p className="t-meta leading-6 text-ink-3">{session.error}</p>
            <button
              type="button"
              onClick={() => void refill()}
              className="inline-flex h-11 items-center rounded-full bg-paper-2 px-5 font-serif-zh text-[15px] italic leading-none text-ink-2 transition-transform duration-150 active:translate-y-px"
            >
              {t.discoverTryAgain}
            </button>
          </>
        ) : session.fetching ? (
          <>
            <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-rose" />
            <div className="space-y-2">
              <p className="font-serif-zh text-[17px] italic leading-7 text-ink-2">{t.discoverLoading}</p>
              <p className="t-meta leading-6 text-ink-4">{t.discoverLoadingHint}</p>
            </div>
          </>
        ) : (
          <>
            <p className="t-meta leading-6 text-ink-3">{t.discoverEnd}</p>
            <button
              type="button"
              onClick={() => void refill()}
              className="inline-flex h-11 items-center rounded-full bg-paper-2 px-5 font-serif-zh text-[15px] italic leading-none text-ink-2 transition-transform duration-150 active:translate-y-px"
            >
              {t.discoverMore}
            </button>
          </>
        )}
      </div>
    )
  }

  // A world with no setting has nothing for Discover to be about — say so instead of dealing
  // cards from nowhere. (While the world is still loading, show the same quiet frame empty.)
  if (!ready) {
    return (
      <div className="page-fade-in flex h-[calc(100svh-3rem-1.25rem)] flex-col bg-paper">
        <div className="page-width flex min-h-0 flex-1 flex-col items-center justify-center px-10 text-center">
          {worldQuery.data && !hasSetting && (
            <p className="t-meta leading-6 text-ink-3">{t.discoverNeedsSetting}</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="page-fade-in flex h-[calc(100svh-3rem-1.25rem)] flex-col bg-paper">
      <div className="page-width flex min-h-0 flex-1 flex-col">
        <DiscoverCarousel
          count={slideCount}
          index={session.index}
          onIndexChange={goTo}
          renderSlide={slide => {
            const card = session.cards[slide]
            return card ? renderCard(card) : renderTail()
          }}
        />
      </div>
    </div>
  )
}
