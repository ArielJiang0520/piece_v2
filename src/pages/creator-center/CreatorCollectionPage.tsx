import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import { useUiText } from '@/i18n'
import Skeleton, { SkeletonText } from '@/components/Skeleton'
import TagInput from '@/components/TagInput'
import { useTopNavConfig } from '@/components/topNavConfig'
import { useAutosave } from '@/hooks/useAutosave'
import { useLanguageId } from '@/preferences/language'
import type { CreatorCollectionDetail } from '../worlds/shared/worldTypes'
import { CreatorSaveLine } from './CreatorStatusBar'
import { newSceneHref, CreatorSceneCard } from './CreatorScenes'
import { invalidateWorldScenes, useCreatorTitle } from './creatorQueries'

interface CollectionDraft {
  name: string
  description: string
  premise: string
  tags: string[]
}

type DeleteMode = 'move' | 'delete'

// One collection in the creator center, /worlds/:id/edit/collections/:collectionId (its draft key): its
// name, description, tags and premise, the scenes in it, New scene into it, and Delete, which asks
// whether its scenes move to No collection or go with it. All of it autosaves to the world's
// draft; readers get it when the world is published, from the World or Scenes tab. collectionId
// 'new' (New collection) is an empty editor stored nowhere until something is typed in it: the
// first save adds the collection and swaps the URL to it, so backing out leaves nothing behind.
export default function CreatorCollectionPage() {
  const { id, collectionId } = useParams<{ id: string; collectionId: string }>()
  const t = useUiText()
  const language = useLanguageId()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const listHref = `/worlds/${id}/edit/scenes`
  const isNew = collectionId === 'new'
  const [draft, setDraft] = useState<CollectionDraft | null>(isNew ? { name: '', description: '', premise: '', tags: [] } : null)
  // The key a new collection got on its first save, so later saves (even queued ones) edit it.
  const createdRef = useRef<string | null>(null)
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteMode, setDeleteMode] = useState<DeleteMode>('move')
  const [deleteError, setDeleteError] = useState('')

  const collectionQuery = useQuery({
    queryKey: ['creator-collection', id, collectionId],
    queryFn: () => apiFetch(`/api/worlds/${id}/creator-center/collections/${collectionId}`) as Promise<CreatorCollectionDetail>,
    enabled: !isNew,
  })
  const collection = collectionQuery.data

  useEffect(() => {
    if (collectionQuery.isError) navigate(listHref, { replace: true })
  }, [collectionQuery.isError, listHref, navigate])

  useEffect(() => {
    if (!collection || draft) return
    setDraft({ name: collection.name, description: collection.description, premise: collection.premise, tags: collection.tags })
  }, [collection, draft])

  const { status: saveStatus } = useAutosave(draft, async value => {
    const key = createdRef.current ?? (isNew ? null : collectionId)
    if (key === null) {
      const created = await apiFetch(`/api/worlds/${id}/creator-center/collections`, { method: 'POST', body: JSON.stringify(value) }) as { id: string }
      createdRef.current = created.id
      queryClient.setQueryData<CreatorCollectionDetail>(['creator-collection', id, created.id], {
        id: created.id, ...value, scenes: [], story_count: 0,
      })
      // Left already (the save on the way out): no URL to swap.
      if (mountedRef.current) navigate(`/worlds/${id}/edit/collections/${created.id}`, { replace: true })
    } else {
      await apiFetch(`/api/worlds/${id}/creator-center/collections/${key}`, { method: 'PATCH', body: JSON.stringify(value) })
    }
    invalidateWorldScenes(queryClient, id)
  })

  const deleteMutation = useMutation({
    mutationFn: (mode: DeleteMode) =>
      apiFetch(`/api/worlds/${id}/creator-center/collections/${collectionId}?scenes=${mode}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidateWorldScenes(queryClient, id)
      queryClient.removeQueries({ queryKey: ['creator-collection', id, collectionId] })
      navigate(listHref, { replace: true })
    },
    onError: error => setDeleteError(error instanceof Error ? error.message : t.couldNotDeleteCollection),
  })

  const statusBar = useMemo(
    () => <CreatorSaveLine saveStatus={saveStatus} />,
    [saveStatus],
  )
  const title = useCreatorTitle(id)
  useTopNavConfig({ mainTitle: title, backHref: listHref, bottomSlot: statusBar })

  if (!draft || (!isNew && !collection)) {
    return (
      <div className="page-width px-4 pt-4">
        <Skeleton className="h-9 w-40 rounded-xl" />
        <div className="card mt-4 p-4"><SkeletonText lineClassName="h-4" lines={4} /></div>
      </div>
    )
  }

  const sceneCount = collection?.scenes.length ?? 0

  return (
    <>
      <div className="page-fade-in page-width px-4 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-4">
        <div className="card flex flex-col gap-5 p-4">
          <label className="block">
            <span className="t-label mb-1.5">{t.name}</span>
            <input
              value={draft.name}
              onChange={event => setDraft(current => current && { ...current, name: event.target.value })}
              placeholder={t.collectionNamePlaceholder}
              autoFocus={isNew}
              className="input"
            />
          </label>
          <label className="block">
            <span className="t-label mb-1.5">{t.description}</span>
            <textarea
              value={draft.description}
              onChange={event => setDraft(current => current && { ...current, description: event.target.value })}
              placeholder={t.collectionDescriptionPlaceholder}
              className="textarea min-h-24"
            />
          </label>
          <div>
            <span className="t-label mb-1.5">{t.tags}</span>
            <TagInput value={draft.tags} onChange={tags => setDraft(current => current && { ...current, tags })} />
          </div>
          <label className="block">
            <span className="t-label mb-1.5">{t.premise}</span>
            <textarea
              value={draft.premise}
              onChange={event => setDraft(current => current && { ...current, premise: event.target.value })}
              placeholder={t.premisePlaceholder}
              className="textarea min-h-32"
            />
            <span className="t-hint mt-1.5 block">{t.premiseHint}</span>
          </label>
        </div>

        {/* Scenes and Delete once the collection exists. */}
        {collection && (
          <>
          <section className="mt-6">
            <h2 className="t-section">{t.scenes}</h2>
            <ul className="mt-3 flex flex-col gap-2">
              {collection.scenes.map(scene => (
                <li key={scene.id}>
                  <CreatorSceneCard worldId={id} scene={scene} />
                </li>
              ))}
              <li>
                <Link to={newSceneHref(id, collection.id)} className="btn btn-ghost btn-sm text-ink-2">
                  <Plus aria-hidden="true" />
                  {t.newScene}
                </Link>
              </li>
            </ul>
          </section>

          <button
            type="button"
            className="btn btn-danger btn-block mt-10"
            onClick={() => {
              setDeleteError('')
              setDeleteMode('move')
              setConfirmDelete(true)
            }}
          >
            <Trash2 aria-hidden="true" />
            {t.deleteCollection}
          </button>
          </>
        )}
      </div>

      <DeleteCollectionDialog
        open={confirmDelete}
        description={sceneCount > 0 ? t.deleteCollectionCounts(sceneCount, collection?.story_count ?? 0) : undefined}
        // An empty collection has nothing to decide about.
        options={sceneCount > 0
          ? [
            { mode: 'move', label: t.deleteCollectionMove },
            { mode: 'delete', label: t.deleteCollectionDelete },
          ]
          : []}
        mode={deleteMode}
        onModeChange={setDeleteMode}
        isPending={deleteMutation.isPending}
        error={deleteError}
        onConfirm={() => {
          if (!deleteMutation.isPending) deleteMutation.mutate(deleteMode)
        }}
        onClose={() => {
          if (!deleteMutation.isPending) setConfirmDelete(false)
        }}
      />
    </>
  )
}

interface DeleteCollectionDialogProps {
  open: boolean
  description?: string
  options: { mode: DeleteMode; label: string }[]
  mode: DeleteMode
  onModeChange: (mode: DeleteMode) => void
  isPending: boolean
  error: string
  onConfirm: () => void
  onClose: () => void
}

// ConfirmDialog's frame with a choice in it: what happens to the collection's scenes.
function DeleteCollectionDialog({ open, description, options, mode, onModeChange, isPending, error, onConfirm, onClose }: DeleteCollectionDialogProps) {
  const t = useUiText()
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isPending) onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isPending, onClose, open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-5 py-8" role="presentation" onClick={() => { if (!isPending) onClose() }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-(--shadow-menu)"
        onClick={event => event.stopPropagation()}
      >
        <h2 id={titleId} className="text-[18px] font-bold leading-snug text-ink">{t.deleteCollectionTitle}</h2>
        {description && <p className="mt-2 text-[15px] leading-relaxed text-ink-3">{description}</p>}

        {options.length > 0 && (
          <div role="radiogroup" className="mt-4 flex flex-col gap-2">
            {options.map(option => (
              <button
                key={option.mode}
                type="button"
                role="radio"
                aria-checked={mode === option.mode}
                onClick={() => onModeChange(option.mode)}
                className={`flex items-start gap-3 rounded-xl border px-3.5 py-3 text-left text-[15px] leading-snug ${mode === option.mode ? 'border-rose bg-rose-pale text-ink' : 'border-line text-ink-2 active:bg-paper-2'}`}
              >
                <span
                  aria-hidden="true"
                  className={`mt-0.5 grid h-4.5 w-4.5 shrink-0 place-items-center rounded-full border-2 ${mode === option.mode ? 'border-rose' : 'border-ink-4'}`}
                >
                  {mode === option.mode && <span className="h-2 w-2 rounded-full bg-rose" />}
                </span>
                {option.label}
              </button>
            ))}
          </div>
        )}

        {error && <p className="error-box mt-4">{error}</p>}

        <div className="mt-6 grid grid-cols-2 gap-2.5">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isPending}>{t.cancel}</button>
          <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={isPending}>
            {isPending ? t.deleting : t.yesDelete}
          </button>
        </div>
      </div>
    </div>
  )
}
