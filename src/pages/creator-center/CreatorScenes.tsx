import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Check, ChevronRight, FolderPlus, ListOrdered, MessageSquareText, Plus } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import { useUiText } from '@/i18n'
import Skeleton, { SkeletonText } from '@/components/Skeleton'
import { useLanguageId } from '@/preferences/language'
import type { CreatorSceneItem, CreatorTree, CreatorWorldDetail } from '../worlds/shared/worldTypes'
import CollectionPicker, { type CollectionOption } from './CollectionPicker'
import { CreatorWorldHeader } from './CreatorTabs'
import { invalidateWorldScenes } from './creatorQueries'

type Move =
  | { kind: 'collection'; collectionId: string; index: number }
  | { kind: 'scene'; sceneId: string; collectionId: string | null; index?: number }

// The creator center's Scenes tab, /worlds/:id/edit/scenes: the world's collections in the author's
// order, each with its scenes, then the scenes in no collection — empty collections included.
// A collection opens its page (name, description, tags); a scene opens its editor; New scene under
// a group opens an empty editor for one, stored once something is typed in it. Reorder switches every row to up/down arrows, plus
// a collection picker on each scene to move it elsewhere. All of it is the world's draft, saved
// as it happens; readers get it on Publish (the status bar under the tabs).
export default function CreatorScenes() {
  const { id } = useParams<{ id: string }>()
  const t = useUiText()
  const language = useLanguageId()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [reordering, setReordering] = useState(false)

  const worldQuery = useQuery({
    queryKey: ['world-draft', id],
    queryFn: () => apiFetch(`/api/worlds/${id}/draft`) as Promise<CreatorWorldDetail>,
  })
  const treeQuery = useQuery({
    queryKey: ['creator-collections', id],
    queryFn: () => apiFetch(`/api/worlds/${id}/creator-center/collections`) as Promise<CreatorTree>,
  })

  useEffect(() => {
    if (worldQuery.isError) navigate('/creator-center', { replace: true })
  }, [id, navigate, worldQuery.isError])

  const move = useMutation({
    mutationFn: (change: Move) => change.kind === 'collection'
      ? apiFetch(`/api/worlds/${id}/creator-center/collections/${change.collectionId}/move`, { method: 'POST', body: JSON.stringify({ index: change.index }) })
      : apiFetch(`/api/worlds/${id}/creator-center/scenes/${change.sceneId}/move`, { method: 'POST', body: JSON.stringify({ collectionId: change.collectionId, index: change.index }) }),
    onSettled: () => invalidateWorldScenes(queryClient, id),
  })

  const saving = move.isPending

  const collections = treeQuery.data?.collections ?? []
  const uncollected = treeQuery.data?.uncollected ?? []
  const options: CollectionOption[] = collections.map(collection => ({ id: collection.id, name: collection.name }))
  const isEmpty = collections.length === 0 && uncollected.length === 0
  const busy = move.isPending

  return (
    <div className="page-fade-in page-width">
      <CreatorWorldHeader active="scenes" worldId={id} saveStatus={saving ? 'saving' : 'idle'} />
      <main className="px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-4">
        {treeQuery.isLoading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="card p-4">
                <SkeletonText lineClassName="h-4" lines={2} />
                <Skeleton className="mt-4 h-3 w-24" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {!isEmpty && (
              <div className="mb-1 flex justify-start">
                <button
                  type="button"
                  className={`btn btn-sm ${reordering ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setReordering(value => !value)}
                >
                  {reordering ? <Check aria-hidden="true" /> : <ListOrdered aria-hidden="true" />}
                  {reordering ? t.done : t.reorder}
                </button>
              </div>
            )}

            {collections.map((collection, index) => (
              <section key={collection.id} className="mt-5">
                {reordering ? (
                  <div className="card flex items-center gap-2 p-3 pl-4">
                    <span className="t-headline min-w-0 flex-1 truncate">{collection.name || t.untitled}</span>
                    <ArrowButtons
                      onUp={index > 0 ? () => move.mutate({ kind: 'collection', collectionId: collection.id, index: index - 1 }) : undefined}
                      onDown={index < collections.length - 1 ? () => move.mutate({ kind: 'collection', collectionId: collection.id, index: index + 1 }) : undefined}
                      disabled={busy}
                    />
                  </div>
                ) : (
                  <Link to={`/worlds/${id}/edit/collections/${collection.id}`} className="card card-press flex items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <span className="t-meta">{t.collection}</span>
                      <p className={`t-headline mt-0.5 truncate ${collection.name ? '' : 'text-ink-4'}`}>{collection.name || t.untitled}</p>
                      {collection.description && <p className="t-body mt-1 line-clamp-2 text-ink-2">{collection.description}</p>}
                      {collection.tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {collection.tags.map(tag => <span key={tag} className="tag">{tag}</span>)}
                        </div>
                      )}
                      <p className="t-meta mt-2">{t.sceneCount(collection.scenes.length)}</p>
                    </div>
                    <ChevronRight aria-hidden="true" className="h-5 w-5 shrink-0 text-ink-4" />
                  </Link>
                )}
                <SceneGroup
                  worldId={id}
                  collectionId={collection.id}
                  scenes={collection.scenes}
                  options={options}
                  reordering={reordering}
                  busy={busy}
                  onMove={change => move.mutate(change)}
                />
              </section>
            ))}

            {/* Always there, so a scene can be written before any collection exists. */}
            <section className="mt-6">
              <h2 className="t-section">{t.noCollection}</h2>
              {isEmpty && (
                <div className="card mt-3 flex flex-col items-center px-6 py-10 text-center">
                  <MessageSquareText aria-hidden="true" className="h-8 w-8 text-ink-4" />
                  <p className="t-body mt-3">{t.noScenesYet}</p>
                </div>
              )}
              <SceneGroup
                worldId={id}
                collectionId={null}
                scenes={uncollected}
                options={options}
                reordering={reordering}
                busy={busy}
                onMove={change => move.mutate(change)}
              />
            </section>
          </>
        )}
      </main>

      {/* Bottom-left: the app is held one-handed with the left thumb. Not while reordering: it
          would sit over the collection menus near the bottom. */}
      {!reordering && (
        <button
          type="button"
          onClick={() => navigate(`/worlds/${id}/edit/collections/new`)}
          className="fab"
        >
          <FolderPlus aria-hidden="true" />
          <span>{t.newCollection}</span>
        </button>
      )}
    </div>
  )
}

interface SceneGroupProps {
  worldId: string | undefined
  collectionId: string | null
  scenes: CreatorSceneItem[]
  options: CollectionOption[]
  reordering: boolean
  busy: boolean
  onMove: (change: Move) => void
}

// One collection's scenes (or No collection's), then New scene into it.
function SceneGroup({ worldId, collectionId, scenes, options, reordering, busy, onMove }: SceneGroupProps) {
  const t = useUiText()
  const language = useLanguageId()

  return (
    <ul className="mt-2 flex flex-col gap-2 pl-3">
      {scenes.map((scene, index) => (
        <li key={scene.id}>
          {reordering ? (
            <div className="card p-3 pl-4">
              <div className="flex items-start gap-2">
                <p className="line-clamp-2 min-w-0 flex-1 whitespace-pre-line text-[15px] leading-relaxed text-ink">{scene.description}</p>
                <ArrowButtons
                  onUp={index > 0 ? () => onMove({ kind: 'scene', sceneId: scene.id, collectionId, index: index - 1 }) : undefined}
                  onDown={index < scenes.length - 1 ? () => onMove({ kind: 'scene', sceneId: scene.id, collectionId, index: index + 1 }) : undefined}
                  disabled={busy}
                />
              </div>
              <div className="mt-2">
                <CollectionPicker
                  collections={options}
                  value={collectionId}
                  disabled={busy}
                  onChange={target => onMove({ kind: 'scene', sceneId: scene.id, collectionId: target })}
                />
              </div>
            </div>
          ) : (
            <CreatorSceneCard worldId={worldId} scene={scene} />
          )}
        </li>
      ))}
      {!reordering && (
        <li>
          <Link to={newSceneHref(worldId, collectionId)} className="btn btn-ghost btn-sm text-ink-2">
            <Plus aria-hidden="true" />
            {t.newScene}
          </Link>
        </li>
      )}
    </ul>
  )
}

function ArrowButtons({ onUp, onDown, disabled }: { onUp?: () => void; onDown?: () => void; disabled: boolean }) {
  const t = useUiText()
  return (
    <div className="flex shrink-0 gap-1">
      <button type="button" className="btn btn-secondary btn-sm px-2.5" aria-label={t.moveUp} onClick={onUp} disabled={disabled || !onUp}>
        <ArrowUp aria-hidden="true" />
      </button>
      <button type="button" className="btn btn-secondary btn-sm px-2.5" aria-label={t.moveDown} onClick={onDown} disabled={disabled || !onDown}>
        <ArrowDown aria-hidden="true" />
      </button>
    </div>
  )
}

// New scene into a collection (null: No collection): the editor's unsaved 'new' (CreatorScenePage).
export function newSceneHref(worldId: string | undefined, collectionId: string | null) {
  return `/worlds/${worldId}/edit/scenes/new${collectionId === null ? '' : `?collection=${collectionId}`}`
}

// A scene in a creator center list: its description, and Unfinished while it lacks its description or
// instruction (the world can't be published until it has both).
export function CreatorSceneCard({ worldId, scene }: { worldId: string | undefined; scene: CreatorSceneItem }) {
  const t = useUiText()
  const unfinished = !scene.description.trim() || !scene.instruction_written
  return (
    <Link to={`/worlds/${worldId}/edit/scenes/${scene.id}`} className="card card-press flex items-center gap-3 p-4">
      <div className="min-w-0 flex-1">
        {scene.description.trim() && (
          <p className="line-clamp-4 whitespace-pre-line text-[15px] leading-relaxed text-ink">{scene.description}</p>
        )}
        {unfinished && <span className={`badge badge-rose ${scene.description.trim() ? 'mt-2' : ''}`}>{t.unfinished}</span>}
      </div>
      <ChevronRight aria-hidden="true" className="h-5 w-5 shrink-0 text-ink-4" />
    </Link>
  )
}
