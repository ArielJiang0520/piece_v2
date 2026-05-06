import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Check } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../../../api'
import { entityLabel } from '../../../config'
import ConfirmDialog from '../../../components/ConfirmDialog'
import DeleteIconButton from '../../../components/DeleteIconButton'
import Skeleton, { SkeletonText } from '../../../components/Skeleton'
import { useTopNavConfig } from '../../../components/topNavConfig'
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
      <DeleteIconButton
        label={`Delete ${entityLabel('world')}`}
        onClick={() => setConfirmDelete(true)}
        disabled={deleteMutation.isPending}
      />
    )
  }, [deleteMutation.isPending, initialized])

  useTopNavConfig({
    secondaryTitle: `Edit ${entityLabel('world', { capitalize: true })}`,
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

  if (!initialized) {
    return (
      <div className="page-fade-in min-h-svh bg-paper">
        <div className="page-width min-h-svh px-6 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-12">
          <header className="mb-10">
            <Skeleton className="mb-4 h-3 w-20" />
            <Skeleton className="h-12 w-52" />
          </header>
          <div className="mb-10">
            <Skeleton className="mb-4 h-3 w-28" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="mb-10">
            <Skeleton className="mb-4 h-3 w-16" />
            <div className="flex gap-2">
              <Skeleton className="h-10 w-24 rounded-full" />
              <Skeleton className="h-10 w-52 rounded-full" />
            </div>
          </div>
          <div className="mb-10">
            <Skeleton className="mb-4 h-3 w-12" />
            <div className="hairline-list flex flex-col">
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="py-5">
                  <Skeleton className="h-5 w-1/2" />
                  <SkeletonText className="mt-2" lineClassName="h-3" lines={1} />
                </div>
              ))}
            </div>
          </div>
          <Skeleton className="mb-4 h-3 w-20" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    )
  }

  return (
    <div className="page-fade-in min-h-svh bg-paper">
      <div className="page-width min-h-svh px-6 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-12">
        {/* <header className="mb-10">
          <div className="mb-4">
            <span className="t-eyebrow eyebrow-rule">Revise</span>
          </div>
          <h1 className="t-display">Edit {entityLabel('world', { capitalize: true })}</h1>
        </header> */}

        <WorldFormFields values={values} setField={setField} />

        <div className="mb-12 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="inline-flex items-center gap-3 rounded-full bg-rose py-2.5 pl-2.5 pr-5 font-serif-zh text-[15px] italic leading-none text-white shadow-(--shadow-cta) transition-all duration-200 hover:-translate-y-0.5 hover:bg-rose-deep hover:shadow-(--shadow-cta-hover) focus:outline-none focus-visible:ring-4 focus-visible:ring-rose/25 disabled:pointer-events-none disabled:opacity-50"
            onClick={saveWorld}
            disabled={!values.name.trim() || saveMutation.isPending}
          >
            <span className="grid h-8 w-8 place-items-center rounded-full bg-white/15">
              <Check aria-hidden="true" className="h-4 w-4 stroke-[1.8]" />
            </span>
            {saveMutation.isPending ? 'Saving...' : 'Save'}
          </button>
          {saveMutation.isError && (
            <span className="font-serif-zh text-[13px] italic leading-normal text-signal-red">
              {saveMutation.error instanceof Error ? saveMutation.error.message : `Could not save ${entityLabel('world')}`}
            </span>
          )}
        </div>
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
