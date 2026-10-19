import { useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useInfiniteQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import { useUiText } from '@/i18n'
import ListEndMarker from '@/components/ListEndMarker'
import Skeleton from '@/components/Skeleton'
import { useTopNavConfig } from '@/components/topNavConfig'
import { useLanguageId } from '@/preferences/language'
import { relativeTime } from '@/utils/time'
import type { WorldChangeItem } from '../shared/worldTypes'

interface ChangesPage {
  changes: WorldChangeItem[]
  page: number
  hasMore: boolean
}

// The world's changelog, newest first: one line per thing a publish changed.
export default function WorldChanges() {
  const t = useUiText()
  const language = useLanguageId()
  const { id } = useParams<{ id: string }>()

  const changesQuery = useInfiniteQuery({
    queryKey: ['world-changes', id],
    queryFn: ({ pageParam }) => apiFetch(`/api/worlds/${id}/changes?page=${pageParam}`) as Promise<ChangesPage>,
    initialPageParam: 1,
    getNextPageParam: last => (last.hasMore ? last.page + 1 : undefined),
    enabled: !!id,
  })
  const changes = changesQuery.data?.pages.flatMap(page => page.changes) ?? []
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = changesQuery
  const loadMoreRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const node = loadMoreRef.current
    if (!node || !hasNextPage) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting && !isFetchingNextPage) fetchNextPage()
    }, { rootMargin: '400px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [fetchNextPage, hasNextPage, isFetchingNextPage])

  useTopNavConfig({ secondaryTitle: t.updateHistory, backHref: `/worlds/${id}` })

  return (
    <div className="page-fade-in page-width">
      <main className="px-4 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-4">
        {changesQuery.isLoading ? (
          <div className="card flex flex-col gap-5 p-4">
            {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-4 w-3/4" />)}
          </div>
        ) : changes.length === 0 ? (
          <div className="card px-6 py-12 text-center">
            <p className="t-body">{t.noChangesYet}</p>
          </div>
        ) : (
          <>
            <ul className="card divide-y divide-line overflow-hidden">
              {changes.map(change => (
                <li key={change.id} className="px-4 py-3.5">
                  <p className="line-clamp-3 text-[15px] leading-relaxed text-ink">
                    {t.worldChangeSentence(change.kind, change.label)}
                  </p>
                  <p className="t-meta mt-0.5">{relativeTime(change.created_at, language)}</p>
                </li>
              ))}
            </ul>
            <div ref={loadMoreRef} className="h-px" />
            {!hasNextPage && <ListEndMarker label={t.updateHistory} />}
          </>
        )}
      </main>
    </div>
  )
}
