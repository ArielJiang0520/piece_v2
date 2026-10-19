import { useEffect, useMemo, useRef, useState } from 'react'
import { FlaskConical, Trash2 } from 'lucide-react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import { useUiText } from '@/i18n'
import ConfirmDialog from '@/components/ConfirmDialog'
import Skeleton, { SkeletonText } from '@/components/Skeleton'
import { useTopNavConfig } from '@/components/topNavConfig'
import { useAutosave } from '@/hooks/useAutosave'
import { setGenerationModel, useGenerationModel } from '@/preferences/generationModel'
import { useLanguageId } from '@/preferences/language'
import ModelSelector from '../worlds/scene/components/ModelSelector'
import type { CreatorSceneDetail, CreatorTree } from '../worlds/shared/worldTypes'
import CollectionPicker from './CollectionPicker'
import { CreatorSaveLine } from './CreatorStatusBar'
import { invalidateWorldScenes, useCreatorTitle } from './creatorQueries'

// One of the author's scenes in the creator center, /worlds/:id/edit/scenes/:sceneId (its draft key), or
// 'new' (into ?collection=, none: No collection): an empty editor that is stored nowhere until
// something is typed in it — the first save adds the scene to the draft and swaps the URL to it, so
// opening New scene and backing out leaves nothing behind.
// Laid out like a reader's scene page: the scene — its description, which readers see, and its
// instruction, which only the model is given — then the big Test button with the model under it
// (where a reader has Generate), and Delete in the top bar. Everything autosaves to the world's
// draft, the collection chip included; readers get it when the world is published, from the
// World or Scenes tab. Test plays the scene as saved, against the world's draft.
interface SceneDraft {
  description: string
  instruction: string
}

export default function CreatorScenePage() {
  const { id, sceneId } = useParams<{ id: string; sceneId: string }>()
  const t = useUiText()
  const language = useLanguageId()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const model = useGenerationModel()
  const listHref = `/worlds/${id}/edit/scenes`
  const [searchParams] = useSearchParams()
  const isNew = sceneId === 'new'
  const [draft, setDraft] = useState<SceneDraft | null>(isNew ? { description: '', instruction: '' } : null)
  // Where a new scene goes when it is first saved.
  const [newCollectionId, setNewCollectionId] = useState<string | null>(searchParams.get('collection'))
  // The key a new scene got on its first save: every save after it (even one already queued) edits
  // that scene rather than adding another.
  const createdRef = useRef<string | null>(null)
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const sceneQuery = useQuery({
    queryKey: ['creator-scene', id, sceneId],
    queryFn: () => apiFetch(`/api/worlds/${id}/creator-center/scenes/${sceneId}`) as Promise<CreatorSceneDetail>,
    enabled: !isNew,
  })
  const treeQuery = useQuery({
    queryKey: ['creator-collections', id],
    queryFn: () => apiFetch(`/api/worlds/${id}/creator-center/collections`) as Promise<CreatorTree>,
  })
  const collectionOptions = (treeQuery.data?.collections ?? []).map(collection => ({ id: collection.id, name: collection.name }))
  const scene = sceneQuery.data

  useEffect(() => {
    if (sceneQuery.isError) navigate(listHref, { replace: true })
  }, [listHref, navigate, sceneQuery.isError])

  // Loaded once; after that the screen is the source of truth and autosave follows it.
  useEffect(() => {
    if (scene && !draft) setDraft({ description: scene.description, instruction: scene.instruction })
  }, [draft, scene])

  const { status: saveStatus, flush } = useAutosave(draft, async value => {
    const key = createdRef.current ?? (isNew ? null : sceneId)
    if (key === null) {
      const created = await apiFetch(`/api/worlds/${id}/creator-center/scenes`, {
        method: 'POST',
        body: JSON.stringify({ ...value, collectionId: newCollectionId }),
      }) as { id: string }
      createdRef.current = created.id
      queryClient.setQueryData<CreatorSceneDetail>(['creator-scene', id, created.id], {
        id: created.id, ...value, collection_id: newCollectionId, story_count: 0,
      })
      // Left already (the save on the way out): no URL to swap.
      if (mountedRef.current) navigate(`/worlds/${id}/edit/scenes/${created.id}`, { replace: true })
    } else {
      await apiFetch(`/api/worlds/${id}/creator-center/scenes/${key}`, { method: 'PATCH', body: JSON.stringify(value) })
    }
    queryClient.invalidateQueries({ queryKey: ['world-draft', id] })
    queryClient.invalidateQueries({ queryKey: ['creator-collections', id] })
    queryClient.invalidateQueries({ queryKey: ['creator-collection', id] })
  })

  const moveMutation = useMutation({
    mutationFn: (collectionId: string | null) =>
      apiFetch(`/api/worlds/${id}/creator-center/scenes/${sceneId}/move`, { method: 'POST', body: JSON.stringify({ collectionId }) }),
    onSuccess: (_result, collectionId) => {
      queryClient.setQueryData<CreatorSceneDetail>(['creator-scene', id, sceneId], current => current && { ...current, collection_id: collectionId })
    },
    onSettled: () => invalidateWorldScenes(queryClient, id),
  })

  const deleteMutation = useMutation({
    mutationFn: () => apiFetch(`/api/worlds/${id}/creator-center/scenes/${sceneId}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidateWorldScenes(queryClient, id)
      queryClient.removeQueries({ queryKey: ['creator-scene', id, sceneId] })
      navigate(listHref, { replace: true })
    },
    onError: error => setDeleteError(error instanceof Error ? error.message : t.couldNotDeleteScene),
  })

  // The test plays what is saved, so whatever is still waiting goes first.
  async function test() {
    await flush().catch(() => { })
    const key = createdRef.current ?? (isNew ? null : sceneId)
    if (key !== null) navigate(`/worlds/${id}/edit/scenes/${key}/test`)
  }

  // Nothing to delete until the scene exists.
  const topRight = useMemo(() => isNew ? undefined : (
    <button
      type="button"
      className="icon-btn text-signal-red"
      aria-label={t.deleteScene}
      onClick={() => {
        setDeleteError('')
        setConfirmDelete(true)
      }}
    >
      <Trash2 aria-hidden="true" className="h-5 w-5" />
    </button>
  ), [isNew, t])
  const statusBar = useMemo(
    () => <CreatorSaveLine saveStatus={moveMutation.isPending ? 'saving' : saveStatus} />,
    [moveMutation.isPending, saveStatus],
  )
  const title = useCreatorTitle(id)
  useTopNavConfig({ mainTitle: title, backHref: listHref, rightAction: topRight, bottomSlot: statusBar })

  if (draft === null || (!isNew && !scene)) {
    return (
      <div className="page-width px-4 pt-4">
        <Skeleton className="h-9 w-40 rounded-xl" />
        <div className="card mt-4 p-4"><SkeletonText lineClassName="h-4" lines={5} /></div>
      </div>
    )
  }

  const hasInstruction = draft.instruction.trim().length > 0

  return (
    <>
      <div className="page-fade-in page-width px-4 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-4">
        <div className="card flex flex-col gap-5 p-4">
          <div>
            <span className="t-label mb-1.5">{t.sceneDescription}</span>
            <textarea
              value={draft.description}
              onChange={event => setDraft({ ...draft, description: event.target.value })}
              placeholder={t.sceneDescriptionPlaceholder}
              autoFocus={isNew}
              className="textarea min-h-32"
            />
            <p className="t-hint mt-1.5">{t.sceneDescriptionHint}</p>
          </div>

          <div>
            <span className="t-label mb-1.5">{t.sceneInstruction}</span>
            <textarea
              value={draft.instruction}
              onChange={event => setDraft({ ...draft, instruction: event.target.value })}
              placeholder={t.sceneInstructionPlaceholder}
              className="textarea min-h-40"
            />
            <p className="t-hint mt-1.5">{t.sceneInstructionHint}</p>
          </div>

          <div>
            <span className="t-label mb-1.5">{t.collection}</span>
            <CollectionPicker
              collections={collectionOptions}
              value={isNew ? newCollectionId : scene?.collection_id ?? null}
              disabled={moveMutation.isPending}
              onChange={collectionId => {
                if (isNew) setNewCollectionId(collectionId)
                else moveMutation.mutate(collectionId)
              }}
            />
          </div>
        </div>

        {/* Test, with the model it uses right below, as a reader's Generate has. */}
        <button
          type="button"
          onClick={() => void test()}
          disabled={!hasInstruction}
          className="btn btn-primary btn-block mt-4"
        >
          <FlaskConical aria-hidden="true" />
          {t.test}
        </button>
        <div className="mt-2 flex justify-center">
          <ModelSelector model={model} onModelChange={setGenerationModel} />
        </div>
        <p className="t-hint mt-3">{t.publishedSceneHint}</p>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={t.deleteSceneTitle}
        description={scene && scene.story_count > 0 ? t.deleteSceneStoriesDescription(scene.story_count) : undefined}
        confirmLabel={t.yesDelete}
        pendingLabel={t.deleting}
        isPending={deleteMutation.isPending}
        error={deleteError}
        onConfirm={() => {
          if (!deleteMutation.isPending) deleteMutation.mutate()
        }}
        onClose={() => {
          if (!deleteMutation.isPending) setConfirmDelete(false)
        }}
      />
    </>
  )
}
