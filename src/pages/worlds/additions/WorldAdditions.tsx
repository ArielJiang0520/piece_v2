import { useEffect, useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import ConfirmDialog from '@/components/ConfirmDialog'
import Skeleton from '@/components/Skeleton'
import { useTopNavConfig } from '@/components/topNavConfig'
import { useUiText } from '@/i18n'
import { useWorldAdditions, type WorldAddition } from '../shared/useWorldAdditions'

const headerTextActionClass =
  'inline-flex h-8 shrink-0 items-center justify-center px-1 font-serif-zh text-[14px] italic leading-none text-ink-3 underline decoration-ink-4/50 underline-offset-4 transition-colors duration-200 active:text-ink disabled:pointer-events-none disabled:opacity-50'

// Where additions are written, rewritten and deleted. Switching them on and off is not here —
// that lives on the About page as pills against the description they join, which is where knowing
// what's on actually matters. So a card has exactly one meaning: tap it to edit it.
export default function WorldAdditions() {
  const t = useUiText()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { additions, additionsLoading, activeIds, worldVersionId, setIds } = useWorldAdditions(id)

  // null = not editing. { id: null } = writing a new one.
  const [editing, setEditing] = useState<{ id: number | null } | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftBody, setDraftBody] = useState('')
  const [confirmCancel, setConfirmCancel] = useState(false)
  // The addition the delete dialog is about, so it can name it.
  const [pendingDelete, setPendingDelete] = useState<WorldAddition | null>(null)
  const [deleteError, setDeleteError] = useState('')

  const editingAddition = editing?.id != null
    ? additions.find(addition => addition.id === editing.id) ?? null
    : null

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['world-additions', id] })
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = JSON.stringify({ name: draftName.trim(), body: draftBody })
      return editing?.id != null
        ? apiFetch(`/api/worlds/${id}/additions/${editing.id}`, { method: 'PATCH', body: payload })
        : apiFetch(`/api/worlds/${id}/additions`, { method: 'POST', body: payload })
    },
    onSuccess: () => {
      setEditing(null)
      invalidate()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (additionId: number) =>
      apiFetch(`/api/worlds/${id}/additions/${additionId}`, { method: 'DELETE' }),
    onSuccess: (_result, additionId) => {
      setPendingDelete(null)
      setDeleteError('')
      // A deleted addition can't stay switched on. Pieces already written with it keep their
      // stamp, which is what turns their label into "since deleted".
      setIds(activeIds.filter(activeId => activeId !== additionId))
      invalidate()
    },
    onError: error => {
      setDeleteError(error instanceof Error ? error.message : t.couldNotSave(t.additions))
    },
  })

  const dirty = editing?.id != null
    ? draftName !== (editingAddition?.name ?? '') || draftBody !== (editingAddition?.body ?? '')
    : draftName.trim().length > 0 || draftBody.trim().length > 0
  const canSave = draftName.trim().length > 0

  function startNew() {
    setDraftName('')
    setDraftBody('')
    saveMutation.reset()
    setEditing({ id: null })
  }

  function startEditing(addition: WorldAddition) {
    setDraftName(addition.name)
    setDraftBody(addition.body)
    saveMutation.reset()
    setEditing({ id: addition.id })
  }

  function save() {
    if (!canSave || saveMutation.isPending) return
    if (!dirty) {
      setEditing(null)
      return
    }
    saveMutation.mutate()
  }

  function cancelEditing() {
    if (saveMutation.isPending) return
    if (dirty) {
      setConfirmCancel(true)
      return
    }
    setEditing(null)
  }

  const editActions = useMemo(() => (
    <div className="page-width border-b border-rose-line/80 px-4 pb-2">
      <div className="flex h-12 items-center gap-3">
        <button
          type="button"
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-full px-3.5 font-serif-zh text-[15px] italic leading-none text-ink-3 transition-[background-color,color] duration-200 active:bg-paper-2 active:text-ink"
          onClick={cancelEditing}
        >
          {t.cancel}
        </button>
        <div className="flex-1" aria-hidden="true" />
        <button
          type="button"
          className="inline-flex h-10 min-w-20 shrink-0 items-center justify-center rounded-full bg-rose px-4 font-serif-zh text-[15px] italic leading-none text-white shadow-(--shadow-cta) transition-transform duration-200 active:translate-y-px disabled:pointer-events-none disabled:opacity-50"
          onClick={save}
          disabled={!canSave || saveMutation.isPending}
        >
          {saveMutation.isPending ? t.saving : t.save}
        </button>
      </div>
    </div>
  ), [canSave, dirty, saveMutation.isPending, t])

  // Reached from the About page, so back goes there rather than to the world list — additions are
  // part of that description, not a section of the world alongside it.
  useTopNavConfig({
    backHref: id ? `/worlds/${id}/about` : '/worlds',
    bottomSlot: editing ? editActions : undefined,
  })

  useEffect(() => {
    if (!id) navigate('/worlds')
  }, [id, navigate])

  const saveError = saveMutation.isError
    ? (saveMutation.error instanceof Error ? saveMutation.error.message : t.couldNotSave(t.additions))
    : ''

  if (editing) {
    return (
      <div className="page-fade-in bg-paper">
        <div className="page-width flex min-h-below-nav flex-col px-6 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-0">
          {/* One titled card rather than the world editor's two ruled sections — an addition is
              written in its own kind of form, not the one the whole world is written in. The
              writing surface still takes everything that's left: an addition is short next to a
              world, but there is no reason to cramp it. Deleting is not offered here; it is an
              operation on the card in the list, where you can see what you are deleting. */}
          <div className="mt-8 flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-rose-line/80 bg-paper/60">
            <input
              value={draftName}
              onChange={event => setDraftName(event.target.value)}
              aria-label={t.additionName}
              className="block w-full shrink-0 border-b border-rose-line/70 bg-transparent px-4 py-3.5 font-serif-zh text-[16px] leading-6 text-ink placeholder:text-ink-4 focus:outline-none"
              placeholder={t.additionNamePlaceholder}
            />
            <textarea
              value={draftBody}
              onChange={event => setDraftBody(event.target.value)}
              aria-label={t.additionBody}
              className="block min-h-[55svh] w-full flex-1 resize-none bg-transparent px-4 py-3.5 font-serif-zh text-[16px] leading-7 text-ink placeholder:text-ink-4 focus:outline-none"
              placeholder={t.additionBodyPlaceholder}
            />
          </div>

          {saveError && (
            <p className="mt-4 rounded-md border border-rose/40 bg-rose-pale px-3 py-2 text-sm text-rose-deep">
              {saveError}
            </p>
          )}
        </div>

        <ConfirmDialog
          open={confirmCancel}
          title={t.discardChangesTitle}
          description={t.discardChangesDescription}
          confirmLabel={t.discard}
          onConfirm={() => {
            setConfirmCancel(false)
            setEditing(null)
          }}
          onClose={() => setConfirmCancel(false)}
        />
      </div>
    )
  }

  return (
    <div className="page-fade-in bg-paper">
      <div className="page-width px-6 pb-32 pt-0">
        <div className="flex items-center justify-between gap-3 pt-6">
          <span className="t-eyebrow truncate">{t.additions}</span>
          <button
            type="button"
            className={headerTextActionClass}
            onClick={startNew}
            disabled={worldVersionId == null}
          >
            {t.newAddition}
          </button>
        </div>

        <p className="mt-5 font-serif-zh text-[15px] leading-7 text-ink-3">{t.additionsIntro}</p>

        {additionsLoading ? (
          <div className="mt-8 flex flex-col gap-3">
            <Skeleton className="h-24 w-full rounded-md" />
            <Skeleton className="h-24 w-full rounded-md" />
          </div>
        ) : additions.length === 0 ? (
          // No CTA here: the header row already carries New, and this would be the same action twice.
          <div className="mt-10 border-t border-rose-line/70 pt-6">
            <p className="t-meta">{t.noAdditionsYet}</p>
          </div>
        ) : (
          <ul className="mt-8 flex flex-col gap-3">
            {additions.map(addition => (
              // Delete sits on the card, not inside the editor: it belongs to the thing in the
              // list. Siblings rather than nested buttons, so the card stays one whole target.
              <li key={addition.id} className="relative">
                <button
                  type="button"
                  onClick={() => startEditing(addition)}
                  className="block w-full rounded-md border border-rose-line/80 bg-paper/60 py-4 pl-4 pr-14 text-left transition-transform duration-150 active:scale-[0.99]"
                >
                  <span className="block truncate font-serif-zh text-[16px] leading-snug text-ink-2">
                    {addition.name}
                  </span>
                  {addition.body.trim() && (
                    <p className="mt-2.5 line-clamp-2 whitespace-pre-wrap font-serif-zh text-[14px] leading-6 text-ink-3">
                      {addition.body}
                    </p>
                  )}
                </button>
                <button
                  type="button"
                  aria-label={t.deleteThisAddition}
                  onClick={() => {
                    setDeleteError('')
                    setPendingDelete(addition)
                  }}
                  className="absolute right-2 top-2 grid h-10 w-10 place-items-center rounded-full text-ink-4 transition-colors active:text-signal-red"
                >
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t.deleteAdditionTitle}
        description={t.deleteAdditionDescription}
        confirmLabel={t.yesDelete}
        pendingLabel={t.deleting}
        isPending={deleteMutation.isPending}
        error={deleteError}
        onConfirm={() => {
          if (pendingDelete === null || deleteMutation.isPending) return
          deleteMutation.mutate(pendingDelete.id)
        }}
        onClose={() => {
          if (deleteMutation.isPending) return
          setPendingDelete(null)
          setDeleteError('')
        }}
      />
    </div>
  )
}
