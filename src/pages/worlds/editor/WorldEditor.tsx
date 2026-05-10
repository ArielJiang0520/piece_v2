import { useEffect, useMemo, useRef, useState } from 'react'
import { Ellipsis, Lightbulb, Trash2 } from 'lucide-react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import { entityLabel } from '@/config'
import ConfirmDialog from '@/components/ConfirmDialog'
import Skeleton from '@/components/Skeleton'
import { useTopNavConfig } from '@/components/topNavConfig'
import CreateWorldTipsDialog from './CreateWorldTipsDialog'

interface World {
  id: number
  name: string
  body: string
  is_example: boolean
  updated_at: number
}

interface WorldListItem {
  is_example: boolean
}

export default function WorldEditor() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isNewWorld = !id
  const createState = location.state as { name?: unknown; body?: unknown } | null
  const draftName = typeof createState?.name === 'string' ? createState.name : ''
  const draftBody = typeof createState?.body === 'string' ? createState.body : ''
  const [name, setName] = useState('')
  const [body, setBody] = useState('')
  const [initialName, setInitialName] = useState('')
  const [initialBody, setInitialBody] = useState('')
  const [initialized, setInitialized] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [tipsOpen, setTipsOpen] = useState(false)
  const actionsMenuRef = useRef<HTMLDivElement | null>(null)
  const worldsQuery = useQuery({
    queryKey: ['worlds'],
    queryFn: () => apiFetch('/api/worlds') as Promise<WorldListItem[]>,
    enabled: isNewWorld,
  })
  const isFirstUserWorld = isNewWorld && worldsQuery.data?.every(world => world.is_example) === true
  const tipsAction = useMemo(() => {
    if (!isNewWorld) return undefined

    return (
      <button
        type="button"
        className="relative grid h-9 w-9 place-items-center rounded-full text-ink-3 transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30"
        aria-label={`Show ${entityLabel('world')} tips`}
        title={`${entityLabel('world', { capitalize: true })} tips`}
        onClick={() => setTipsOpen(true)}
      >
        <Lightbulb aria-hidden="true" className="h-5 w-5" />
        {isFirstUserWorld && (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose ring-2 ring-paper" aria-hidden="true" />
        )}
      </button>
    )
  }, [isFirstUserWorld, isNewWorld])

  const worldQuery = useQuery({
    queryKey: ['world', id],
    queryFn: () => apiFetch(`/api/worlds/${id}`) as Promise<World>,
    enabled: !isNewWorld,
  })

  useEffect(() => {
    if (!isNewWorld || initialized) return
    setName(draftName)
    setBody(draftBody)
    setInitialName(draftName)
    setInitialBody(draftBody)
    setInitialized(true)
  }, [draftBody, draftName, initialized, isNewWorld])

  useEffect(() => {
    if (!worldQuery.data || initialized) return
    setName(worldQuery.data.name)
    setBody(worldQuery.data.body ?? '')
    setInitialName(worldQuery.data.name)
    setInitialBody(worldQuery.data.body ?? '')
    setInitialized(true)
  }, [initialized, worldQuery.data])

  useEffect(() => {
    if (worldQuery.isError) navigate('/worlds')
  }, [navigate, worldQuery.isError])

  useEffect(() => {
    if (!actionsOpen) return

    function handlePointerDown(event: PointerEvent) {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(event.target as Node)) {
        setActionsOpen(false)
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setActionsOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [actionsOpen])

  const dirty = name !== initialName || body !== initialBody
  const canSave = name.trim().length > 0

  const saveMutation = useMutation({
    mutationFn: () => {
      if (isNewWorld) {
        return apiFetch('/api/worlds', {
          method: 'POST',
          body: JSON.stringify({ name, body }),
        }) as Promise<World>
      }

      return apiFetch(`/api/worlds/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name, body }),
      })
    },
    onSuccess: result => {
      queryClient.invalidateQueries({ queryKey: ['worlds'] })
      if (isNewWorld && result && typeof result === 'object' && 'id' in result) {
        const world = result as World
        queryClient.setQueryData(['world', String(world.id)], world)
        navigate(`/worlds/${world.id}/about`)
        return
      }

      queryClient.invalidateQueries({ queryKey: ['world', id] })
      queryClient.invalidateQueries({ queryKey: ['world-versions', id] })
      navigate(`/worlds/${id}/about`)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => apiFetch(`/api/worlds/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worlds'] })
      queryClient.removeQueries({ queryKey: ['world', id] })
      queryClient.removeQueries({ queryKey: ['world-versions', id] })
      queryClient.removeQueries({ queryKey: ['world-clusters', id] })
      queryClient.removeQueries({ queryKey: ['world-clusters-count', id] })
      navigate('/worlds')
    },
    onError: error => {
      setDeleteError(error instanceof Error ? error.message : `Could not delete ${entityLabel('world')}`)
    },
  })

  const saveError = useMemo(() => {
    if (!saveMutation.isError) return ''
    return saveMutation.error instanceof Error ? saveMutation.error.message : `Could not save ${entityLabel('world')}`
  }, [saveMutation.error, saveMutation.isError])

  const editorActions = useMemo(() => (
    <div className="page-width border-b border-rose-line/80 px-4 pb-2">
      <div className="flex h-12 items-center gap-3">
        {initialized ? (
          <>
            <button
              type="button"
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-full px-3.5 font-serif-zh text-[15px] italic leading-none text-ink-3 transition-[background-color,color,transform] duration-200 hover:-translate-y-px hover:bg-paper-2 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-4/50"
              onClick={cancel}
            >
              Cancel
            </button>
            {!isNewWorld && (
              <div ref={actionsMenuRef} className="relative shrink-0">
                <button
                  type="button"
                  className="grid h-10 w-10 place-items-center rounded-full text-ink-3 transition-[background-color,color,transform] duration-200 hover:-translate-y-px hover:bg-paper-2 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30"
                  onClick={() => setActionsOpen(open => !open)}
                  aria-label={`${entityLabel('world', { capitalize: true })} actions`}
                  title={`${entityLabel('world', { capitalize: true })} actions`}
                  aria-haspopup="menu"
                  aria-expanded={actionsOpen}
                >
                  <Ellipsis aria-hidden="true" className="h-5 w-5" />
                </button>
                {actionsOpen && (
                  <div
                    role="menu"
                    className="absolute left-0 top-full z-30 mt-2 w-44 overflow-hidden rounded-md border border-rose-line bg-paper/95 shadow-(--shadow-menu) backdrop-blur"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-signal-red transition-colors hover:bg-paper-2 focus:outline-none focus:ring-2 focus:ring-rose/30"
                      onClick={() => {
                        setActionsOpen(false)
                        setDeleteError('')
                        setConfirmDelete(true)
                      }}
                    >
                      <Trash2 aria-hidden="true" className="h-4 w-4" />
                      Delete this {entityLabel('world')}
                    </button>
                  </div>
                )}
              </div>
            )}
            <div className="hidden min-w-0 flex-1 items-center justify-center gap-2 sm:flex">
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${dirty ? 'bg-rose' : 'bg-ink-4/45'}`}
                aria-hidden="true"
              />
              <span className="t-meta truncate text-ink-3">
                {dirty ? 'Unsaved changes' : 'No changes'}
              </span>
            </div>
            <div className="flex-1 sm:hidden" aria-hidden="true" />
            <button
              type="button"
              className="inline-flex h-10 min-w-20 shrink-0 items-center justify-center rounded-full bg-rose px-4 font-serif-zh text-[15px] italic leading-none text-white shadow-(--shadow-cta) transition-[background-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:bg-rose-deep hover:shadow-(--shadow-cta-hover) focus:outline-none focus-visible:ring-4 focus-visible:ring-rose/25 disabled:pointer-events-none disabled:opacity-50"
              onClick={save}
              disabled={!canSave || saveMutation.isPending}
            >
              {saveMutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </>
        ) : (
          <>
            <Skeleton className="h-9 w-20 rounded-full" />
            <div className="flex-1" />
            <Skeleton className="h-9 w-20 rounded-full" />
          </>
        )}
      </div>
    </div>
  ), [actionsOpen, body, canSave, dirty, initialized, isNewWorld, name, saveMutation.isPending])

  useTopNavConfig({
    mainTitle: isNewWorld ? `Create ${entityLabel('world', { capitalize: true })}` : undefined,
    secondaryTitle: isNewWorld ? undefined : `Edit ${entityLabel('world', { capitalize: true })}`,
    backHref: id ? `/worlds/${id}/about` : '/worlds',
    rightAction: tipsAction,
    bottomSlot: editorActions,
  })

  function cancel() {
    if (dirty) {
      setConfirmCancel(true)
      return
    }
    if (isNewWorld) {
      navigate('/worlds')
      return
    }
    navigate(`/worlds/${id}/about`)
  }

  function save() {
    if (!canSave || saveMutation.isPending) return
    saveMutation.mutate()
  }

  function deleteWorld() {
    if (isNewWorld || deleteMutation.isPending) return
    setDeleteError('')
    deleteMutation.mutate()
  }

  if (!initialized) {
    return (
      <div className="page-fade-in min-h-svh bg-paper">
        <div className="page-width min-h-svh px-6 pb-10 pt-7">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="mt-8 h-[55svh] w-full" />
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="page-fade-in min-h-svh bg-paper">
        <div className="page-width flex min-h-svh flex-col px-6 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-7">
          {isFirstUserWorld && (
            <div className="rounded-md border border-rose-line bg-rose-pale/45 px-4 py-3">
              <p className="flex flex-col items-start gap-1 font-serif-zh text-[16px] leading-7 text-ink">
                First {entityLabel('world')}?
                <button
                  type="button"
                  className="italic text-rose underline decoration-rose/35 underline-offset-4 transition-colors hover:text-rose-deep focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30"
                  onClick={() => setTipsOpen(true)}
                >
                  Read the tips first.
                </button>
              </p>
            </div>
          )}

          <label className={isFirstUserWorld ? 'mt-8 block' : 'block'}>
            <span className="t-eyebrow eyebrow-rule">Name</span>
            <input
              value={name}
              onChange={event => setName(event.target.value)}
              className="mt-4 block w-full bg-transparent px-0 py-1 font-serif-zh text-[17px] leading-8 text-ink placeholder:text-ink-4 focus:outline-none focus-visible:outline focus-visible:outline-offset-4 focus-visible:outline-ink-4/70"
              placeholder={`${entityLabel('world', { capitalize: true })} name`}
              autoFocus
            />
          </label>

          <label className="mt-10 flex min-h-0 flex-1 flex-col">
            <span className="t-eyebrow eyebrow-rule">Details</span>
            <textarea
              value={body}
              onChange={event => setBody(event.target.value)}
              className="mt-4 min-h-[55svh] flex-1 resize-none border-l border-rose-line bg-transparent py-1 pl-5 pr-0 font-serif-zh text-[17px] leading-8 text-ink placeholder:text-ink-4 focus:outline-none focus-visible:border-ink-4"
              placeholder={`Setting, characters, tone, dynamic, dirty details. Whatever the AI needs to know.`}
            />
          </label>

          {saveError && (
            <p className="mt-4 rounded-md border border-rose/40 bg-rose-pale px-3 py-2 text-sm text-rose-deep">
              {saveError}
            </p>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title="Discard changes?"
        description="Your unsaved edits will be lost."
        confirmLabel="Discard"
        onConfirm={() => navigate(isNewWorld ? '/worlds' : `/worlds/${id}/about`)}
        onClose={() => setConfirmCancel(false)}
      />
      <ConfirmDialog
        open={confirmDelete}
        title={`Delete this ${entityLabel('world')}?`}
        description={`This will delete the ${entityLabel('world')} and all of its ${entityLabel('piece', { plural: true })}.`}
        confirmLabel="Yes, delete"
        pendingLabel="Deleting..."
        isPending={deleteMutation.isPending}
        error={deleteError}
        onConfirm={deleteWorld}
        onClose={() => {
          setConfirmDelete(false)
          setDeleteError('')
        }}
      />
      <CreateWorldTipsDialog open={tipsOpen} onClose={() => setTipsOpen(false)} />
    </>
  )
}
