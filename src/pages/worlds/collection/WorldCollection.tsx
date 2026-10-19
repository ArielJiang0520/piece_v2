import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import { useUiText } from '@/i18n'
import Skeleton, { SkeletonText } from '@/components/Skeleton'
import { useTopNavConfig } from '@/components/topNavConfig'
import { useLanguageId } from '@/preferences/language'
import { SceneList } from '../scenes/WorldScenes'
import type { WorldScenesResponse } from '../shared/worldTypes'

// One collection, /worlds/:id/collections/:collectionId, the same for everyone: its name,
// description and tags, its premise in full (the context every scene in it shares), then every
// scene in it in the author's order. Reached from the Scenes tab, which shows only the first few.
export default function WorldCollection() {
  const t = useUiText()
  const language = useLanguageId()
  const { id, collectionId } = useParams<{ id: string; collectionId: string }>()
  const navigate = useNavigate()
  const scenesHref = `/worlds/${id}/scenes`

  // The Scenes tab's own data, usually already cached from it.
  const scenesQuery = useQuery({
    queryKey: ['world-scenes', id],
    queryFn: () => apiFetch(`/api/worlds/${id}/scenes`) as Promise<WorldScenesResponse>,
    enabled: !!id,
  })
  const collection = scenesQuery.data?.collections.find(item => String(item.id) === collectionId)
  // Gone, or empty (readers don't get empty collections).
  const missing = scenesQuery.isError || (scenesQuery.isSuccess && !collection)

  useEffect(() => {
    if (missing) navigate(scenesHref, { replace: true })
  }, [missing, navigate, scenesHref])

  useTopNavConfig({ backHref: scenesHref })

  if (!collection) {
    return (
      <div className="page-width px-4 pt-4">
        <div className="card p-4">
          <Skeleton className="h-6 w-40" />
          <SkeletonText className="mt-3" lineClassName="h-4" lines={2} />
        </div>
        <div className="card mt-3 p-4"><SkeletonText lineClassName="h-4" lines={4} /></div>
      </div>
    )
  }

  return (
    <div className="page-fade-in page-width">
      <main className="px-4 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-4">
        <div className="card p-4">
          <span className="t-label mb-1 text-ink-3">{t.collection}</span>
          <h1 className="text-[22px] font-bold leading-snug text-ink">{collection.name || t.untitled}</h1>
          {collection.description && (
            <p className="t-body mt-2 whitespace-pre-line text-ink-2">{collection.description}</p>
          )}
          {collection.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {collection.tags.map(tag => <span key={tag} className="tag">{tag}</span>)}
            </div>
          )}
        </div>

        {collection.premise && (
          <section className="card mt-3 p-4">
            <h2 className="t-label mb-1.5">{t.premise}</h2>
            <p className="whitespace-pre-line text-[15px] leading-relaxed text-ink">{collection.premise}</p>
          </section>
        )}

        <section className="mt-6">
          <h2 className="t-section">{t.scenes}</h2>
          <SceneList worldId={id} scenes={collection.scenes} />
        </section>
      </main>
    </div>
  )
}
