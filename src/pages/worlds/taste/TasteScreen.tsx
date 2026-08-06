import { useMemo, useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, Pencil, RotateCw, Trash2 } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import { useUiText } from '@/i18n'
import Skeleton from '@/components/Skeleton'
import { useTopNavConfig } from '@/components/topNavConfig'
import { useLanguageId } from '@/preferences/language'
import { relativeTime } from '@/utils/time'
import { setTasteProfileEnabled, useTasteProfileEnabled } from '@/preferences/tasteProfileEnabled'
import { ProseText } from '../shared/ProseBody'

interface ProfileResponse {
  // The reader's taste profile for this world, as freeform prose ('' when there's none yet).
  profile: string
  likeCount: number
  // Advances every time a distill finishes and persists — the client's completion signal.
  updatedAt: number
  // Whether a distill is running server-side right now.
  distilling: boolean
}

// How long the UI keeps polling for a manual refresh before it stops waiting and tells the
// reader to check back. A distill queues behind any live story generation on the single
// OpenRouter slot, so give it real room.
const REFRESH_POLL_TIMEOUT_MS = 150_000

interface LikeRow {
  id: number
  snippet: string
  // The liked passage in its surrounding paragraphs — shown when the reader expands the like.
  // Falls back to the snippet itself server-side, so it's always present.
  context: string
  reasons: string | null
  // 1 while this passage feeds the distilled profile, 0 once the reader switches it off. Off
  // likes stay in the list, in full — they're simply not sent to the model on the next rebuild.
  active: number
  // When the passage was liked. Shown per row because age is what the reader judges a like by
  // when deciding whether it still speaks for them — nothing here retires a like on its own.
  created_at: number
}

type TasteTab = 'profile' | 'likes'

// One world's taste screen (reached from its prompt list), split across two tabs in the nav so
// neither half has to be scrolled past to reach the other: the profile the app maintains (with
// the on/off switch that decides whether it shapes writing, and the manual refresh), and the
// liked passages that feed it. Everything here is scoped to this world.
export default function TasteScreen() {
  const t = useUiText()
  const language = useLanguageId()
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const enabled = useTasteProfileEnabled()
  const [refreshing, setRefreshing] = useState(false)
  // The last refresh outcome, shown inline so a manual refresh is never a silent no-op:
  // distillation often re-derives the same profile, and a failure leaves it untouched — either
  // way the text looks unchanged, so we say what happened instead.
  const [refreshNote, setRefreshNote] = useState<{ text: string; error: boolean } | null>(null)
  // Captured at the moment a refresh is triggered, so the polling effect can tell when the
  // background distill has finished (updatedAt advanced) and whether it changed anything.
  const baselineUpdatedAtRef = useRef(0)
  const beforeProfileRef = useRef('')
  // The like whose note is being edited inline, plus its working text. Null = nothing open.
  const [editingLikeId, setEditingLikeId] = useState<number | null>(null)
  const [editingNote, setEditingNote] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  // The like whose full surrounding context is expanded for reading. Null = none.
  const [expandedLikeId, setExpandedLikeId] = useState<number | null>(null)
  // Delete is two-tap: the first tap arms the confirm on this like, the second commits.
  // Auto-disarms after a moment so a stray tap doesn't leave it primed.
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<number | null>(null)
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(confirmTimerRef.current), [])

  const [activeTab, setActiveTab] = useState<TasteTab>('profile')

  const profileQuery = useQuery({
    queryKey: ['taste-profile', id],
    queryFn: () => apiFetch(`/api/worlds/${id}/taste/profile`) as Promise<ProfileResponse>,
    enabled: !!id,
    // While a manual refresh is in flight, poll for the background distill's result.
    refetchInterval: refreshing ? 2500 : false,
  })
  const likesQuery = useQuery({
    queryKey: ['taste-likes-all', id],
    queryFn: () => apiFetch(`/api/worlds/${id}/taste/likes`) as Promise<LikeRow[]>,
    enabled: !!id,
  })

  const profile = profileQuery.data?.profile ?? ''
  const likes = likesQuery.data ?? []
  // How much of the collection is actually feeding the profile. The reader is the only thing that
  // moves this number, so it doubles as a read on how much they've switched off.
  const activeCount = likes.filter(like => like.active).length

  // The two halves live in the nav, the same in-page tab bar the prompt page uses. Switching
  // returns to the top, since each tab is its own scroll.
  const tabs = useMemo(() => {
    function show(tab: TasteTab) {
      setActiveTab(tab)
      requestAnimationFrame(() => window.scrollTo({ top: 0 }))
    }
    return (
      <nav className="page-width border-b border-rose-line/80" aria-label={t.tasteTitle}>
        <div className="grid grid-cols-2 px-4" role="tablist" aria-label={t.tasteTitle}>
          <TasteTabButton active={activeTab === 'profile'} onClick={() => show('profile')}>
            {t.tasteTabProfile}
          </TasteTabButton>
          <TasteTabButton active={activeTab === 'likes'} onClick={() => show('likes')}>
            <span className="inline-flex items-center gap-2">
              <span>{t.tasteTabLikes}</span>
              {likes.length > 0 && (
                <span className="inline-flex min-w-5 justify-center rounded-full bg-paper-2 px-1.5 py-0.5 font-sans text-[11px] font-semibold leading-none tracking-normal text-ink-3 ring-1 ring-paper-3/70">
                  {likes.length}
                </span>
              )}
            </span>
          </TasteTabButton>
        </div>
      </nav>
    )
  }, [activeTab, likes.length, t])

  useTopNavConfig({ mainTitle: t.tasteTitle, backHref: id ? `/worlds/${id}` : '/worlds', bottomSlot: tabs })

  // A distill can take a while (it waits for the single OpenRouter generation slot, then runs),
  // so the refresh only *triggers* it and returns; we then poll the profile for the result
  // rather than holding one request open and mistaking its slowness for a failure.
  async function refresh() {
    if (refreshing) return
    // Snapshot what "done" will look like, so the polling effect can detect completion and
    // whether anything actually changed.
    baselineUpdatedAtRef.current = profileQuery.data?.updatedAt ?? 0
    beforeProfileRef.current = profile
    setRefreshNote({ text: t.tasteRefreshing, error: false })
    setRefreshing(true)
    try {
      await apiFetch(`/api/worlds/${id}/taste/profile/refresh`, { method: 'POST' })
    } catch {
      // Only the trigger itself failed (e.g. auth/network) — that's a real error worth showing.
      // A slow distill is NOT this path; it succeeds here and resolves via polling below.
      setRefreshing(false)
      setRefreshNote({ text: t.tasteRefreshFailed, error: true })
    }
  }

  // Completion: the background distill stamps a newer updatedAt when it persists. Report the
  // outcome (changed / unchanged / empty) and stop polling.
  const polledUpdatedAt = profileQuery.data?.updatedAt ?? 0
  useEffect(() => {
    if (!refreshing) return
    if (polledUpdatedAt <= baselineUpdatedAtRef.current) return
    const next = profileQuery.data?.profile ?? ''
    const note = !next && likes.length === 0
      ? t.tasteRefreshEmpty
      : next === beforeProfileRef.current
        ? t.tasteRefreshedNoChange
        : t.tasteRefreshed
    setRefreshNote({ text: note, error: false })
    setRefreshing(false)
  }, [refreshing, polledUpdatedAt, profileQuery.data, likes.length, t])

  // Soft ceiling: if the distill hasn't landed in this long, stop spinning and tell the reader
  // to check back — it's still running server-side, so this is a status, not an error.
  useEffect(() => {
    if (!refreshing) return
    const timer = setTimeout(() => {
      setRefreshing(false)
      setRefreshNote({ text: t.tasteRefreshStillWorking, error: false })
    }, REFRESH_POLL_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [refreshing, t])

  // First tap arms the confirm; second tap (while armed) deletes. Any other tap re-arms/resets.
  function requestDelete(likeId: number) {
    clearTimeout(confirmTimerRef.current)
    if (confirmingDeleteId === likeId) {
      setConfirmingDeleteId(null)
      void deleteLike(likeId)
      return
    }
    setConfirmingDeleteId(likeId)
    confirmTimerRef.current = setTimeout(() => setConfirmingDeleteId(null), 3500)
  }

  async function deleteLike(likeId: number) {
    await apiFetch(`/api/worlds/${id}/taste/likes/${likeId}`, { method: 'DELETE' })
    await queryClient.invalidateQueries({ queryKey: ['taste-likes-all', id] })
    await queryClient.invalidateQueries({ queryKey: ['taste-likes', id] })
  }

  // Flip whether a like feeds the profile. The list is patched in place first so the pill answers
  // the tap immediately, then the write lands and the query refetches. The profile itself is left
  // alone — rebuilding it is the Refresh button's job, so a run of toggles costs one distill.
  async function toggleActive(like: LikeRow) {
    const next = like.active ? 0 : 1
    queryClient.setQueryData<LikeRow[]>(['taste-likes-all', id], rows =>
      rows?.map(row => (row.id === like.id ? { ...row, active: next } : row)))
    await apiFetch(`/api/worlds/${id}/taste/likes/${like.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ active: next === 1 }),
    })
    await queryClient.invalidateQueries({ queryKey: ['taste-likes-all', id] })
  }

  function startEditing(like: LikeRow) {
    setConfirmingDeleteId(null)
    setEditingLikeId(like.id)
    setEditingNote(like.reasons ?? '')
  }

  // Save-on-commit (blur or Enter), iOS-notes style — no explicit Save button. A no-op edit
  // just closes without a round-trip.
  async function saveEdit() {
    if (editingLikeId === null || savingEdit) return
    const current = likes.find(l => l.id === editingLikeId)
    const next = editingNote.trim()
    if (current && (current.reasons ?? '') === next) {
      setEditingLikeId(null)
      return
    }
    setSavingEdit(true)
    try {
      await apiFetch(`/api/worlds/${id}/taste/likes/${editingLikeId}`, {
        method: 'PATCH',
        body: JSON.stringify({ reasons: next }),
      })
      await queryClient.invalidateQueries({ queryKey: ['taste-likes-all', id] })
      await queryClient.invalidateQueries({ queryKey: ['taste-likes', id] })
      setEditingLikeId(null)
    } finally {
      setSavingEdit(false)
    }
  }

  return (
    <div className="page-fade-in page-width px-4 pb-16 pt-4">
      {activeTab === 'profile' ? (
        <>
          {/* On/off toggle */}
          <div className="mb-8 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="font-serif-zh text-[15px] text-ink-2">{t.tasteUseProfile}</p>
              <p className="t-meta mt-0.5 text-ink-4">{t.tasteUseProfileHint}</p>
            </div>
            <div className="grid w-24 shrink-0 grid-cols-2 overflow-hidden rounded-full border border-rose-line p-0.5" aria-label={t.tasteUseProfile}>
              {[true, false].map(value => {
                const selected = enabled === value
                return (
                  <button
                    key={String(value)}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setTasteProfileEnabled(value)}
                    className={`grid h-7 place-items-center rounded-full font-serif-zh text-[12px] italic leading-none transition-colors ${selected ? 'bg-rose-pale text-rose-deep' : 'text-ink-3 active:text-ink'}`}
                  >
                    {value ? t.tasteOn : t.tasteOff}
                  </button>
                )
              })}
            </div>
          </div>

          {/* The taste profile */}
          <div className="mb-4 flex items-center justify-between gap-3">
            <span className="t-eyebrow">{t.tasteProfileHeading}</span>
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-full bg-paper-2 px-3 py-1 font-serif-zh text-[12px] italic leading-none text-ink-3 transition-opacity active:opacity-70 disabled:opacity-50"
            >
              <RotateCw aria-hidden="true" className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
              {t.tasteRefresh}
            </button>
          </div>

          {refreshNote && (
            <p className={`t-meta -mt-2 mb-4 ${refreshNote.error ? 'text-signal-red' : 'text-ink-4'}`} aria-live="polite">
              {refreshNote.text}
            </p>
          )}

          {profileQuery.isLoading ? (
            <div className="mb-8 flex flex-col gap-2">
              {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-5 w-full" />)}
            </div>
          ) : !profile ? (
            <p className="t-meta mb-8 text-ink-4">{t.tasteProfileEmpty}</p>
          ) : (
            <p className="whitespace-pre-line font-serif-zh text-[15px] leading-relaxed text-ink-2">
              {profile}
            </p>
          )}
        </>
      ) : (
        <>
          {/* Liked passages (the evidence the profile is distilled from) */}
          <p className="t-meta mb-4 text-ink-3">{t.tasteIntro}</p>
          {likes.length > 0 && (
            <>
              <p className="t-eyebrow mb-2">{t.tasteActiveCount(activeCount, likes.length)}</p>
              <p className="t-meta mb-4 text-ink-4">{t.tasteLikesActiveHint}</p>
            </>
          )}
          {likesQuery.isLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : likes.length === 0 ? (
            <p className="t-meta text-ink-4">{t.tasteLikesEmpty}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {likes.map(like => (
                <li key={like.id} className="rounded-lg bg-paper-2 p-3">
                  <p className="t-meta mb-1.5 not-italic text-ink-4">{relativeTime(like.created_at, language)}</p>
                  {/* Tap the passage itself to open / close its full surrounding context — accordion, no icon. */}
                  <button
                    type="button"
                    aria-expanded={expandedLikeId === like.id}
                    onClick={() => setExpandedLikeId(prev => (prev === like.id ? null : like.id))}
                    className="flex w-full items-start gap-2 text-left"
                  >
                    {/* A switched-off like reads at resting weight — still legible, plainly not in play. */}
                    <p className={`flex-1 font-serif-zh text-[14px] leading-snug ${like.active ? 'text-ink-2' : 'text-ink-4'}`}>
                      <ProseText text={like.snippet} />
                    </p>
                    <ChevronDown
                      aria-hidden="true"
                      className={`mt-0.5 h-4 w-4 shrink-0 text-ink-4 transition-transform ${expandedLikeId === like.id ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {expandedLikeId === like.id && (
                    <p className="mt-2 whitespace-pre-line rounded-lg bg-paper p-3 font-serif-zh text-[13px] leading-relaxed text-ink-3">
                      <ProseText text={like.context} />
                    </p>
                  )}

                  {/* On/off, note and delete on one line. The note is edited in place — tap it, type,
                      tap away. The on/off pill sits leftmost, where the thumb already is. */}
                  <div className="mt-2 flex items-center gap-3">
                    <button
                      type="button"
                      aria-label={t.tasteLikeActive}
                      aria-pressed={!!like.active}
                      onClick={() => void toggleActive(like)}
                      className={`inline-flex h-8 w-11 shrink-0 items-center justify-center rounded-full font-serif-zh text-[12px] italic leading-none transition-colors active:opacity-70 ${like.active ? 'bg-rose-pale text-rose-deep' : 'bg-paper text-ink-4'}`}
                    >
                      {like.active ? t.tasteOn : t.tasteOff}
                    </button>

                    {editingLikeId === like.id ? (
                      <input
                        value={editingNote}
                        onChange={e => setEditingNote(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            e.currentTarget.blur()
                          }
                        }}
                        onBlur={saveEdit}
                        maxLength={600}
                        autoFocus
                        placeholder={t.tasteNotePlaceholder}
                        enterKeyHint="done"
                        className="h-8 flex-1 rounded-full bg-paper px-3 font-serif-zh text-[13px] italic leading-none text-ink placeholder:text-ink-4 focus:outline-none"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEditing(like)}
                        className="group flex flex-1 items-center gap-1.5 text-left"
                      >
                        <span className={`t-meta ${like.reasons ? 'text-ink-4' : 'italic text-ink-4/70'}`}>
                          {like.reasons || t.tasteAddNote}
                        </span>
                        <Pencil aria-hidden="true" className="h-3 w-3 shrink-0 text-ink-4/60" />
                      </button>
                    )}

                    {editingLikeId !== like.id && (
                      confirmingDeleteId === like.id ? (
                        <button
                          type="button"
                          onClick={() => requestDelete(like.id)}
                          className="inline-flex h-8 shrink-0 items-center rounded-full bg-signal-red/10 px-3 font-serif-zh text-[12px] italic leading-none text-signal-red transition-opacity active:opacity-70"
                        >
                          {t.tasteDeleteConfirm}
                        </button>
                      ) : (
                        <button
                          type="button"
                          aria-label={t.tasteDelete}
                          onClick={() => requestDelete(like.id)}
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-4 transition-colors active:bg-rose-line/50 active:text-signal-red"
                        >
                          <Trash2 aria-hidden="true" className="h-[17px] w-[17px]" />
                        </button>
                      )
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

interface TasteTabButtonProps {
  active: boolean
  children: ReactNode
  onClick: () => void
}

function TasteTabButton({ active, children, onClick }: TasteTabButtonProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`-mb-px inline-flex h-11 min-w-0 items-center justify-center gap-2 border-b-2 px-1 t-eyebrow leading-none transition-colors ${active
        ? 'border-rose text-ink!'
        : 'border-transparent text-ink-3!'
        }`}
    >
      {children}
    </button>
  )
}
