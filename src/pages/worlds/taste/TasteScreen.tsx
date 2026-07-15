import { useState } from 'react'
import { Eye, EyeOff, Heart, RotateCw, Trash2 } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import { useUiText } from '@/i18n'
import Skeleton from '@/components/Skeleton'
import { useTopNavConfig } from '@/components/topNavConfig'
import { setTasteProfileEnabled, useTasteProfileEnabled } from '@/preferences/tasteProfileEnabled'
import { useLanguageId } from '@/preferences/language'
import { TASTE_TAGS, tasteTagLabel, type TasteTag } from '../shared/tasteTags'

interface Statement {
  id: string
  dimension: TasteTag
  text: string
  enabled: boolean
  world_id?: number
}

interface ProfileResponse {
  statements: Statement[]
  likeCount: number
}

interface LikeRow {
  id: number
  snippet: string
  reasons: string | null
}

// The global taste screen: the on/off toggle, the distilled sensibility statements (with a
// per-statement veto and a manual refresh), and the raw liked passages that feed them.
export default function TasteScreen() {
  const t = useUiText()
  const lang = useLanguageId()
  const queryClient = useQueryClient()
  const enabled = useTasteProfileEnabled()
  const [refreshing, setRefreshing] = useState(false)

  useTopNavConfig({ mainTitle: t.tasteTitle, backHref: '/worlds' })

  const profileQuery = useQuery({
    queryKey: ['taste-profile'],
    queryFn: () => apiFetch('/api/taste/profile') as Promise<ProfileResponse>,
  })
  const likesQuery = useQuery({
    queryKey: ['taste-likes-all'],
    queryFn: () => apiFetch('/api/taste/likes') as Promise<LikeRow[]>,
  })

  const statements = profileQuery.data?.statements ?? []
  const likes = likesQuery.data ?? []

  async function refresh() {
    if (refreshing) return
    setRefreshing(true)
    try {
      await apiFetch('/api/taste/profile/refresh', { method: 'POST' })
      await queryClient.invalidateQueries({ queryKey: ['taste-profile'] })
    } catch {
      // Silent: a failed distill leaves the existing profile intact.
    } finally {
      setRefreshing(false)
    }
  }

  async function patchStatement(id: string, change: { enabled?: boolean; deleted?: boolean }) {
    await apiFetch(`/api/taste/profile/statements/${id}`, { method: 'PATCH', body: JSON.stringify(change) })
    await queryClient.invalidateQueries({ queryKey: ['taste-profile'] })
  }

  async function deleteLike(id: number) {
    await apiFetch(`/api/taste/likes/${id}`, { method: 'DELETE' })
    await queryClient.invalidateQueries({ queryKey: ['taste-likes-all'] })
    await queryClient.invalidateQueries({ queryKey: ['taste-likes'] })
  }

  return (
    <div className="page-width px-4 pb-16 pt-4">
      <p className="t-meta mb-6 text-ink-3">{t.tasteIntro}</p>

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

      {/* Distilled statements */}
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

      {profileQuery.isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-6 w-full" />)}
        </div>
      ) : statements.length === 0 ? (
        <p className="t-meta mb-8 text-ink-4">{t.tasteProfileEmpty}</p>
      ) : (
        <div className="mb-8 flex flex-col gap-4">
          {TASTE_TAGS.map(dimension => {
            const group = statements.filter(s => s.dimension === dimension)
            if (group.length === 0) return null
            return (
              <div key={dimension}>
                <p className="t-meta mb-1.5 text-ink-4">{tasteTagLabel(dimension, lang)}</p>
                <ul className="flex flex-col gap-1.5">
                  {group.map(statement => (
                    <li key={statement.id} className="flex items-start gap-2">
                      <p className={`flex-1 font-serif-zh text-[15px] leading-snug ${statement.enabled ? 'text-ink-2' : 'text-ink-4 line-through'}`}>
                        {statement.text}
                      </p>
                      <button
                        type="button"
                        aria-label={statement.enabled ? t.tasteDisable : t.tasteEnable}
                        onClick={() => patchStatement(statement.id, { enabled: !statement.enabled })}
                        className="mt-0.5 shrink-0 text-ink-4 transition-colors active:text-ink"
                      >
                        {statement.enabled
                          ? <Eye aria-hidden="true" className="h-4 w-4" />
                          : <EyeOff aria-hidden="true" className="h-4 w-4" />}
                      </button>
                      <button
                        type="button"
                        aria-label={t.tasteDelete}
                        onClick={() => patchStatement(statement.id, { deleted: true })}
                        className="mt-0.5 shrink-0 text-ink-4 transition-colors active:text-signal-red"
                      >
                        <Trash2 aria-hidden="true" className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      )}

      {/* Liked passages (evidence) */}
      <div className="mb-4 flex items-center gap-2">
        <Heart aria-hidden="true" className="h-3.5 w-3.5 text-ink-4" />
        <span className="t-eyebrow">{t.tasteLikesHeading}</span>
      </div>
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
              <div className="flex items-start gap-2">
                <p className="flex-1 font-serif-zh text-[14px] leading-snug text-ink-2">{like.snippet}</p>
                <button
                  type="button"
                  aria-label={t.tasteDelete}
                  onClick={() => deleteLike(like.id)}
                  className="shrink-0 text-ink-4 transition-colors active:text-signal-red"
                >
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
              {like.reasons && <p className="t-meta mt-2 text-ink-4">{like.reasons}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
