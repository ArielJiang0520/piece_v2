import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../../api'
import { entityLabel } from '../../config'
import ConfirmDialog from '../../components/ConfirmDialog'
import Skeleton from '../../components/Skeleton'
import { useTopNavConfig } from '../../components/topNavConfig'

interface World {
  id: number
  name: string
  body: string
  is_example: boolean
  updated_at: number
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
  const [confirmCancel, setConfirmCancel] = useState(false)

  useTopNavConfig({
    secondaryTitle: `${isNewWorld ? 'Create' : 'Edit'} ${entityLabel('world', { capitalize: true })}`,
    backHref: id ? `/worlds/${id}/about` : '/worlds',
  })

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

  const saveError = useMemo(() => {
    if (!saveMutation.isError) return ''
    return saveMutation.error instanceof Error ? saveMutation.error.message : `Could not save ${entityLabel('world')}`
  }, [saveMutation.error, saveMutation.isError])

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

  if (!initialized) {
    return (
      <div className="page-fade-in min-h-svh bg-paper">
        <div className="page-width min-h-svh px-6 pb-10 pt-4">
          <div className="sticky top-12 z-10 -mx-6 flex h-14 items-center justify-between border-b border-rose-line bg-paper/95 px-6 backdrop-blur">
            <Skeleton className="h-8 w-16 rounded-full" />
            <Skeleton className="h-8 w-16 rounded-full" />
          </div>
          <Skeleton className="mt-8 h-12 w-full" />
          <Skeleton className="mt-8 h-[55svh] w-full" />
        </div>
      </div>
    )
  }

  return (
    <div className="page-fade-in min-h-svh bg-paper">
      <div className="page-width flex min-h-svh flex-col px-6 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-4">
        <header className="sticky top-12 z-10 -mx-6 flex h-14 items-center justify-between border-b border-rose-line bg-paper/95 px-6 backdrop-blur">
          <button
            type="button"
            className="rounded-full px-3 py-2 font-serif-zh text-[15px] italic text-ink-3 transition-colors hover:bg-paper-2 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30"
            onClick={cancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-full bg-rose px-4 py-2 font-serif-zh text-[15px] italic text-white shadow-(--shadow-cta) transition-colors hover:bg-rose-deep focus:outline-none focus-visible:ring-4 focus-visible:ring-rose/25 disabled:pointer-events-none disabled:opacity-50"
            onClick={save}
            disabled={!canSave || saveMutation.isPending}
          >
            {saveMutation.isPending ? 'Saving...' : 'Save'}
          </button>
        </header>

        <label className="mt-8">
          <span className="t-eyebrow eyebrow-rule">Name</span>
          <input
            value={name}
            onChange={event => setName(event.target.value)}
            className="mt-3 w-full border-b border-rose-line bg-transparent px-0 py-2.5 font-serif-zh text-3xl leading-tight text-ink placeholder:text-ink-4 focus:border-rose focus:outline-none"
            placeholder={`${entityLabel('world', { capitalize: true })} name`}
            autoFocus
          />
        </label>

        <label className="mt-8 flex min-h-0 flex-1 flex-col">
          <span className="t-eyebrow eyebrow-rule">Body</span>
          <textarea
            value={body}
            onChange={event => setBody(event.target.value)}
            className="mt-3 min-h-[55svh] flex-1 resize-none border-y border-rose-line bg-transparent px-0 py-4 font-serif-zh text-[17px] leading-8 text-ink placeholder:text-ink-4 focus:border-rose focus:outline-none"
            placeholder={`Write the ${entityLabel('world')}'s details here...`}
          />
        </label>

        {saveError && (
          <p className="mt-4 rounded-md border border-rose/40 bg-rose-pale px-3 py-2 text-sm text-rose-deep">
            {saveError}
          </p>
        )}
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title="Discard changes?"
        description="Your unsaved edits will be lost."
        confirmLabel="Discard"
        onConfirm={() => navigate(isNewWorld ? '/worlds' : `/worlds/${id}/about`)}
        onClose={() => setConfirmCancel(false)}
      />
    </div>
  )
}
