import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { apiFetch } from '../../../api'
import { entityLabel } from '../../../config'
import ConfirmDialog from '../../../components/ConfirmDialog'
import { useTopNavConfig } from '../../../components/TopNav'
import { useWorldForm, type WorldFormValues } from './state'
import WorldFormFields from './Fields'

type World = WorldFormValues

export default function WorldEdit() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { values, setField, reset } = useWorldForm()
  const [initialized, setInitialized] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const backHref = id ? `/worlds/${id}` : '/worlds'

  const worldQuery = useQuery({
    queryKey: ['world', id],
    queryFn: () => apiFetch(`/api/worlds/${id}`) as Promise<World>,
    enabled: !!id,
  })

  useEffect(() => {
    if (worldQuery.data && !initialized) {
      reset(worldQuery.data)
      setInitialized(true)
    }
  }, [worldQuery.data, initialized, reset])

  useEffect(() => {
    if (worldQuery.isError) navigate('/')
  }, [worldQuery.isError, navigate])

  function invalidateWorld() {
    queryClient.invalidateQueries({ queryKey: ['world', id] })
    queryClient.invalidateQueries({ queryKey: ['worlds'] })
    queryClient.invalidateQueries({ queryKey: ['world-clusters', id] })
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/worlds/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(values),
      }),
    onSuccess: () => {
      invalidateWorld()
      navigate(`/worlds/${id}`)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => apiFetch(`/api/worlds/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worlds'] })
      queryClient.removeQueries({ queryKey: ['world', id] })
      queryClient.removeQueries({ queryKey: ['world-clusters', id] })
      navigate('/')
    },
    onError: e => {
      setDeleteError(e instanceof Error ? e.message : `Could not delete ${entityLabel('world')}`)
    },
  })

  const navRightAction = useMemo(() => {
    if (!initialized) return undefined

    return (
      <button
        type="button"
        className="grid h-9 w-9 place-items-center rounded-full text-ink-3 transition-colors hover:bg-paper-2 hover:text-rose-deep focus:outline-none focus:ring-2 focus:ring-rose/30 disabled:opacity-50"
        onClick={() => setConfirmDelete(true)}
        disabled={deleteMutation.isPending}
        aria-label={`Delete ${entityLabel('world')}`}
        title={`Delete ${entityLabel('world')}`}
      >
        <Trash2 aria-hidden="true" className="h-5 w-5" />
      </button>
    )
  }, [deleteMutation.isPending, initialized])

  useTopNavConfig({
    title: `Edit ${entityLabel('world', { capitalize: true })}`,
    backHref,
    rightAction: navRightAction,
  })

  function saveWorld() {
    if (!values.name.trim() || saveMutation.isPending) return
    saveMutation.mutate()
  }

  function deleteWorld() {
    if (!initialized || deleteMutation.isPending) return
    setDeleteError('')
    deleteMutation.mutate()
  }

  if (!initialized) return <div className="page-width p-6 text-ink-3">Loading...</div>

  return (
    <div className="page-width min-h-svh px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-6">
      <WorldFormFields values={values} setField={setField} />

      <div className="mb-12 flex items-center gap-3">
        <button
          className="rounded-sm bg-rose px-4 py-2 font-medium text-white transition-colors hover:bg-rose-deep disabled:opacity-50"
          onClick={saveWorld}
          disabled={!values.name.trim() || saveMutation.isPending}
        >
          {saveMutation.isPending ? 'Saving...' : 'Save'}
        </button>
        {saveMutation.isError && (
          <span className="text-sm text-rose-deep">
            {saveMutation.error instanceof Error ? saveMutation.error.message : `Could not save ${entityLabel('world')}`}
          </span>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete this ${entityLabel('world')}?`}
        description={`This will delete the ${entityLabel('world')} and all of its ${entityLabel('piece', { plural: true })}.`}
        confirmLabel="Yes, delete"
        pendingLabel="Deleting..."
        isPending={deleteMutation.isPending}
        error={deleteError}
        onConfirm={deleteWorld}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  )
}
