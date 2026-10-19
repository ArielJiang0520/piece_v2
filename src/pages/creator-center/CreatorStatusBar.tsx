import { useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, CheckCircle2, ChevronRight, CircleDot, Loader2, Send } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import { useUiText } from '@/i18n'
import ConfirmDialog from '@/components/ConfirmDialog'
import type { AutosaveStatus } from '@/hooks/useAutosave'
import { useLanguageId } from '@/preferences/language'
import type { CreatorTree, CreatorWorldDetail } from '../worlds/shared/worldTypes'
import { invalidateWorldScenes } from './creatorQueries'

interface Props {
  worldId: string | undefined
  // The screen's own autosave: what it is doing right now, and how to send what is still waiting
  // (Publish does that first).
  saveStatus: AutosaveStatus
  flush?: () => Promise<unknown>
}

// The one place in the creator center that says where the author's work stands, on every creator center screen,
// pinned under the top bar: Publish on the left (held one-handed, left thumb), then one sentence —
// saving, saved but not published, or published and up to date. Everything in the creator center autosaves
// to the world's draft; Publish is the only thing readers ever get anything from, and it publishes
// the whole world: its text, collections and scenes together.
export default function CreatorStatusBar({ worldId, saveStatus, flush }: Props) {
  const t = useUiText()
  const language = useLanguageId()
  const queryClient = useQueryClient()
  const [confirmPublish, setConfirmPublish] = useState(false)
  const [publishError, setPublishError] = useState('')

  const worldQuery = useQuery({
    queryKey: ['world-draft', worldId],
    queryFn: () => apiFetch(`/api/worlds/${worldId}/draft`) as Promise<CreatorWorldDetail>,
  })
  const world = worldQuery.data
  // For what blocks Publish: how many scenes are unfinished, how many collections unnamed.
  const treeQuery = useQuery({
    queryKey: ['creator-collections', worldId],
    queryFn: () => apiFetch(`/api/worlds/${worldId}/creator-center/collections`) as Promise<CreatorTree>,
  })
  const tree = treeQuery.data
  const location = useLocation()
  const scenesHref = `/worlds/${worldId}/edit/scenes`

  const publishMutation = useMutation({
    mutationFn: async () => {
      await flush?.()
      await apiFetch(`/api/worlds/${worldId}/publish`, { method: 'POST' })
    },
    onSuccess: () => {
      setConfirmPublish(false)
      invalidateWorldScenes(queryClient, worldId)
      queryClient.invalidateQueries({ queryKey: ['world-changes', worldId] })
      queryClient.invalidateQueries({ queryKey: ['tags'] })
    },
    onError: error => setPublishError(error instanceof Error ? error.message : t.couldNotPublish),
  })

  if (!world) return <div className="h-[53px] border-b border-line bg-surface" />

  // Something is waiting for Publish: never published, a saved change, or one being saved now.
  const canPublish = !world.published || world.has_draft_changes || saveStatus === 'saving' || saveStatus === 'error'
  const blocker = canPublish ? world.publish_blocker : null
  const failed = saveStatus === 'error'
  const unfinishedCount = tree
    ? [...tree.collections.flatMap(collection => collection.scenes), ...tree.uncollected]
      .filter(scene => !scene.description.trim() || !scene.instruction_written).length
    : 1
  // What blocks Publish is fixed on the Scenes tab, so from anywhere else the sentence goes there.
  const linkToScenes = (blocker === 'collection_name' || blocker === 'unfinished') && location.pathname !== scenesHref
  const status = failed
    ? t.couldNotSaveRetrying
    : saveStatus === 'saving'
      ? t.saving
      : blocker === 'name'
        ? t.nameToPublish
        : blocker === 'collection_name'
          ? t.nameCollectionsToPublish(tree?.collections.filter(collection => !collection.name.trim()).length ?? 1)
          : blocker === 'unfinished'
            ? t.finishScenesToPublish(unfinishedCount)
            : !world.published
              ? t.notPublished
              : canPublish ? t.unpublishedChanges : t.publishedUpToDate
  const StatusIcon = failed ? AlertCircle : saveStatus === 'saving' ? Loader2 : canPublish ? CircleDot : CheckCircle2

  return (
    <>
      <div className={`border-b border-line ${failed ? 'bg-signal-red/10' : 'bg-surface'}`}>
        <div className="page-width flex min-h-[52px] items-center gap-3 px-4 py-2" aria-live="polite">
          {canPublish && (
            <button
              type="button"
              onClick={() => {
                setPublishError('')
                setConfirmPublish(true)
              }}
              disabled={blocker !== null || failed}
              className="btn btn-primary btn-sm shrink-0"
            >
              <Send aria-hidden="true" />
              {t.publish}
            </button>
          )}
          {linkToScenes ? (
            <Link to={scenesHref} replace className="flex min-w-0 items-center gap-1.5 text-[14px] font-medium leading-snug text-ink-2 underline underline-offset-2 active:text-ink">
              <StatusIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span>{status}</span>
              <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0" />
            </Link>
          ) : (
            <p className={`flex min-w-0 items-center gap-1.5 text-[14px] font-medium leading-snug ${failed ? 'text-signal-red' : canPublish ? 'text-ink-2' : 'text-signal-green'}`}>
              <StatusIcon aria-hidden="true" className={`h-4 w-4 shrink-0 ${saveStatus === 'saving' ? 'animate-spin' : ''}`} />
              <span>{status}</span>
            </p>
          )}
        </div>
      </div>

      {/* Out of the sticky top bar, whose stacking layer would put the dialog under the page's FAB. */}
      {createPortal(<ConfirmDialog
        open={confirmPublish}
        title={t.publishTitle}
        description={t.publishDescription}
        confirmLabel={t.publish}
        pendingLabel={t.publishing}
        isPending={publishMutation.isPending}
        error={publishError}
        onConfirm={() => {
          if (!publishMutation.isPending) publishMutation.mutate()
        }}
        onClose={() => {
          if (!publishMutation.isPending) setConfirmPublish(false)
        }}
      />, document.body)}
    </>
  )
}

// The saving line for a creator center screen inside a world (a scene, a collection): only whether the
// screen's work is saved to the draft. Nothing until something has changed: opening a screen saves
// nothing. Publishing is the whole world's, so it lives on the World and
// Scenes tabs (CreatorStatusBar), never here.
export function CreatorSaveLine({ saveStatus }: { saveStatus: AutosaveStatus }) {
  const t = useUiText()
  if (saveStatus === 'idle') return null
  const failed = saveStatus === 'error'
  const status = failed ? t.couldNotSaveRetrying : saveStatus === 'saving' ? t.saving : t.saved
  const StatusIcon = failed ? AlertCircle : saveStatus === 'saving' ? Loader2 : CheckCircle2
  return (
    <div className={`border-b border-line ${failed ? 'bg-signal-red/10' : 'bg-surface'}`}>
      <p
        className={`page-width flex items-center gap-1.5 px-4 py-2 text-[14px] font-medium leading-snug ${failed ? 'text-signal-red' : 'text-ink-2'}`}
        aria-live="polite"
      >
        <StatusIcon aria-hidden="true" className={`h-4 w-4 shrink-0 ${saveStatus === 'saving' ? 'animate-spin' : ''}`} />
        {status}
      </p>
    </div>
  )
}
