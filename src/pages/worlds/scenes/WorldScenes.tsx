import { useEffect, useMemo, useState } from 'react'
import { BookOpen, ChevronRight, MessageSquareText, SearchX } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import { useUiText } from '@/i18n'
import Skeleton, { SkeletonText } from '@/components/Skeleton'
import TagPills from '@/components/TagPills'
import { useTopNavConfig } from '@/components/topNavConfig'
import { useLanguageId } from '@/preferences/language'
import WorldTabs from '../shared/WorldTabs'
import type { SceneItem, WorldDetail, WorldScenesResponse } from '../shared/worldTypes'

// The world's Scenes tab, the same for everyone (the author too, who is a reader here): the
// author's collections in their order — name, description, tags, a "Has premise" chip, then its
// first few scenes — and last the scenes in no collection, all of them. A collection's name (or
// See all) opens its own page, with its premise and every scene. The tag pills filter
// collections. Tapping a scene goes to it to generate.

// How many of a collection's scenes the tab shows before See all.
const PREVIEW_SCENES = 3

export default function WorldScenes() {
  const t = useUiText()
  const language = useLanguageId()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [selectedTags, setSelectedTags] = useState<string[]>([])

  const worldQuery = useQuery({
    queryKey: ['world', id],
    queryFn: () => apiFetch(`/api/worlds/${id}`) as Promise<WorldDetail>,
    enabled: !!id,
  })
  const scenesQuery = useQuery({
    queryKey: ['world-scenes', id],
    queryFn: () => apiFetch(`/api/worlds/${id}/scenes`) as Promise<WorldScenesResponse>,
    enabled: !!id,
  })

  useEffect(() => {
    if (worldQuery.isError) navigate('/')
  }, [navigate, worldQuery.isError])

  const collections = scenesQuery.data?.collections ?? []
  const uncollected = scenesQuery.data?.uncollected ?? []
  // Tags in the order they first appear, in the author's collection order.
  const tags = useMemo(() => [...new Set(collections.flatMap(collection => collection.tags))], [collections])
  const filtering = selectedTags.length > 0
  const visibleCollections = collections.filter(collection => selectedTags.every(tag => collection.tags.includes(tag)))
  // Scenes in no collection have no tags, so a tag filter leaves them out.
  const visibleUncollected = filtering ? [] : uncollected

  const worldTabs = useMemo(
    () => <WorldTabs active="scenes" worldId={id} sceneCount={worldQuery.data?.scene_count} />,
    [id, worldQuery.data?.scene_count],
  )
  useTopNavConfig({ backHref: '/', bottomSlot: worldTabs })

  function toggleTag(tag: string) {
    setSelectedTags(current => current.includes(tag) ? current.filter(existing => existing !== tag) : [...current, tag])
  }

  const isEmpty = collections.length === 0 && uncollected.length === 0
  const noMatches = !isEmpty && visibleCollections.length === 0 && visibleUncollected.length === 0

  return (
    <div className="page-fade-in page-width">
      <main className="px-4 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-4">
        {scenesQuery.isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-6 w-40" />
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="card p-4">
                <SkeletonText lineClassName="h-4" lines={2} />
              </div>
            ))}
          </div>
        ) : isEmpty ? (
          <div className="card flex flex-col items-center px-6 py-12 text-center">
            <MessageSquareText aria-hidden="true" className="h-8 w-8 text-ink-4" />
            <p className="t-body mt-3">{t.noScenesYet}</p>
          </div>
        ) : (
          <>
            <TagPills tags={tags} selected={selectedTags} onToggle={toggleTag} onClear={() => setSelectedTags([])} className="mb-2" />

            {noMatches && (
              <div className="card mt-3 flex flex-col items-center px-6 py-12 text-center">
                <SearchX aria-hidden="true" className="h-8 w-8 text-ink-4" />
                <p className="t-body mt-3">{t.noMatches}</p>
              </div>
            )}

            {visibleCollections.map(collection => {
              const collectionHref = `/worlds/${id}/collections/${collection.id}`
              const hidden = collection.scenes.length - PREVIEW_SCENES
              return (
                <section key={collection.id} className="mt-5 first-of-type:mt-3">
                  <Link to={collectionHref} className="flex items-center gap-2 active:opacity-70">
                    <h2 className="t-section min-w-0 flex-1">{collection.name || t.untitled}</h2>
                    <ChevronRight aria-hidden="true" className="h-5 w-5 shrink-0 text-ink-4" />
                  </Link>
                  {collection.description && (
                    <p className="t-body mt-1 line-clamp-2 whitespace-pre-line text-ink-2">{collection.description}</p>
                  )}
                  {(collection.premise || collection.tags.length > 0) && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {collection.premise && (
                        <span className="badge badge-rose">
                          <BookOpen aria-hidden="true" />
                          {t.hasPremise}
                        </span>
                      )}
                      {collection.tags.map(tag => <span key={tag} className="tag">{tag}</span>)}
                    </div>
                  )}
                  <SceneList worldId={id} scenes={collection.scenes.slice(0, PREVIEW_SCENES)} />
                  {hidden > 0 && (
                    <Link to={collectionHref} className="btn btn-ghost btn-sm mt-2 text-ink-2">
                      {t.seeAll(t.sceneCount(collection.scenes.length))}
                      <ChevronRight aria-hidden="true" />
                    </Link>
                  )}
                </section>
              )
            })}

            {visibleUncollected.length > 0 && (
              <section className="mt-5 first-of-type:mt-3">
                {collections.length > 0 && <h2 className="t-section">{t.noCollection}</h2>}
                <SceneList worldId={id} scenes={visibleUncollected} />
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}

export function SceneList({ worldId, scenes }: { worldId: string | undefined; scenes: SceneItem[] }) {
  return (
    <ul className="mt-3 flex flex-col gap-3">
      {scenes.map(scene => (
        <li key={scene.id}>
          <Link to={`/worlds/${worldId}/scenes/${scene.id}`} className="card card-press flex items-center gap-3 p-4">
            <p className="line-clamp-4 min-w-0 flex-1 whitespace-pre-line text-[15px] leading-relaxed text-ink">{scene.description}</p>
            <ChevronRight aria-hidden="true" className="h-5 w-5 shrink-0 text-ink-4" />
          </Link>
        </li>
      ))}
    </ul>
  )
}
