import { useNavigate } from 'react-router-dom'
import { Check } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../../../api'
import { entityLabel } from '../../../config'
import { useTopNavConfig } from '../../../components/topNavConfig'
import { useWorldForm } from './state'
import WorldFormFields from './Fields'

interface CreatedWorld {
  id: number
  name: string
  origin: string
  is_example: boolean
  summary: string
  body: string
  register_id: number | null
}

export default function WorldCreate() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { values, setField } = useWorldForm()
  useTopNavConfig({ secondaryTitle: `Create ${entityLabel('world', { capitalize: true })}`, backHref: '/worlds' })

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
    <div className="page-fade-in min-h-svh bg-paper">
      <div className="page-width min-h-svh px-6 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-12">
        {/* <header className="mb-10">
          <div className="mb-4">
            <span className="t-eyebrow eyebrow-rule">New</span>
          </div>
          <h1 className="t-display">Create {entityLabel('world', { capitalize: true })}</h1>
        </header> */}

        <WorldFormFields values={values} setField={setField} autoFocusName />

        <div className="mb-12 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="inline-flex items-center gap-3 rounded-full bg-rose py-2.5 pl-2.5 pr-5 font-serif-zh text-[15px] italic leading-none text-white shadow-(--shadow-cta) transition-all duration-200 hover:-translate-y-0.5 hover:bg-rose-deep hover:shadow-(--shadow-cta-hover) focus:outline-none focus-visible:ring-4 focus-visible:ring-rose/25 disabled:pointer-events-none disabled:opacity-50"
            onClick={saveWorld}
            disabled={!values.name.trim() || createMutation.isPending}
          >
            <span className="grid h-8 w-8 place-items-center rounded-full bg-white/15">
              <Check aria-hidden="true" className="h-4 w-4 stroke-[1.8]" />
            </span>
            {createMutation.isPending ? 'Saving...' : 'Save'}
          </button>
          {createMutation.isError && (
            <span className="font-serif-zh text-[13px] italic leading-normal text-signal-red">
              {createMutation.error instanceof Error ? createMutation.error.message : `Could not save ${entityLabel('world')}`}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
