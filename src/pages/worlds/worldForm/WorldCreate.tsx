import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../../../api'
import { entityLabel } from '../../../config'
import { useTopNavConfig } from '../../../components/TopNav'
import { useWorldForm } from './state'
import WorldFormFields from './Fields'

interface CreatedWorld {
  id: number
  name: string
  origin: string
  summary: string
  body: string
  register_id: number | null
}

export default function WorldCreate() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { values, setField } = useWorldForm()
  useTopNavConfig({ title: `Create ${entityLabel('world', { capitalize: true })}`, backHref: '/worlds' })

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch('/api/worlds', {
        method: 'POST',
        body: JSON.stringify(values),
      }) as Promise<CreatedWorld>,
    onSuccess: world => {
      queryClient.invalidateQueries({ queryKey: ['worlds'] })
      queryClient.setQueryData(['world', String(world.id)], world)
      navigate(`/worlds/${world.id}`)
    },
  })

  function saveWorld() {
    if (!values.name.trim() || createMutation.isPending) return
    createMutation.mutate()
  }

  return (
    <div className="page-width min-h-svh px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-6">
      <WorldFormFields values={values} setField={setField} autoFocusName />

      <div className="mb-12 flex items-center gap-3">
        <button
          className="rounded-sm bg-rose px-4 py-2 font-medium text-white transition-colors hover:bg-rose-deep disabled:opacity-50"
          onClick={saveWorld}
          disabled={!values.name.trim() || createMutation.isPending}
        >
          {createMutation.isPending ? 'Saving...' : 'Save'}
        </button>
        {createMutation.isError && (
          <span className="text-sm text-rose-deep">
            {createMutation.error instanceof Error ? createMutation.error.message : `Could not save ${entityLabel('world')}`}
          </span>
        )}
      </div>
    </div>
  )
}
