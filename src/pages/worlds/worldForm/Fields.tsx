import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../../../api'
import { entityLabel } from '../../../config'
import Skeleton, { SkeletonText } from '../../../components/Skeleton'
import TextField from '../../../components/TextField'
import type { WorldFormValues } from './state'

interface Register {
  id: number
  title: string
  details: string
  summary: string
}

interface Props {
  values: WorldFormValues
  setField: <K extends keyof WorldFormValues>(field: K, value: WorldFormValues[K]) => void
  autoFocusName?: boolean
}

export default function WorldFormFields({ values, setField, autoFocusName }: Props) {
  const registersQuery = useQuery({
    queryKey: ['registers'],
    queryFn: () => apiFetch('/api/registers') as Promise<Register[]>,
  })
  const registers = registersQuery.data ?? []

  return (
    <>
      <TextField
        containerClassName="mb-10"
        label={`${entityLabel('world', { capitalize: true })} name`}
        value={values.name}
        onChange={e => setField('name', e.target.value)}
        autoFocus={autoFocusName}
      />

      <div className="mb-10">
        <div className="mb-3">
          <span className="t-eyebrow eyebrow-rule">Setting</span>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Setting">
          <button
            type="button"
            className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 py-2 font-serif-zh text-[13px] italic leading-normal transition-all duration-200 hover:-translate-y-px hover:shadow-(--shadow-feather) focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30 ${values.origin === 'original'
              ? 'border-rose-line text-ink'
              : 'border-transparent text-ink-3'
              }`}
            onClick={() => setField('origin', 'original')}
            aria-pressed={values.origin === 'original'}
          >
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full ${values.origin === 'original' ? 'bg-rose' : 'bg-ink-4'}`}
            />
            original
          </button>
          <button
            type="button"
            className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 py-2 font-serif-zh text-[13px] italic leading-normal transition-all duration-200 hover:-translate-y-px hover:shadow-(--shadow-feather) focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30 ${values.origin !== 'original'
              ? 'border-rose-line text-ink'
              : 'border-transparent text-ink-3'
              }`}
            onClick={() => setField('origin', '')}
            aria-pressed={values.origin !== 'original'}
          >
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full ${values.origin !== 'original' ? 'bg-rose' : 'bg-ink-4'}`}
            />
            based on an existing work
          </button>
        </div>
        {values.origin !== 'original' && (
          <TextField
            containerClassName="mt-6"
            label="Source work"
            value={values.origin}
            onChange={e => setField('origin', e.target.value)}
            placeholder="work name"
          />
        )}
      </div>

      <div className="mb-10">
        <div className="mb-3">
          <span className="t-eyebrow eyebrow-rule">Vibe</span>
        </div>
        {registersQuery.isLoading ? (
          <ul className="hairline-list flex flex-col">
            {Array.from({ length: 3 }, (_, index) => (
              <li
                key={index}
                className="py-5"
              >
                <Skeleton className="h-4 w-1/2" />
                <SkeletonText className="mt-2" lineClassName="h-3" lines={1} />
              </li>
            ))}
          </ul>
        ) : registers.length === 0 ? (
          <p className="t-meta">No registers available.</p>
        ) : (
          <ul className="hairline-list flex flex-col">
            {registers.map((r, index) => {
              const selected = values.register_id === r.id
              return (
                <li
                  key={r.id}
                  className="list-item-reveal"
                  style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
                >
                  <button
                    type="button"
                    className="flex w-full items-start gap-4 py-5 text-left transition-all duration-200 hover:-translate-y-px hover:shadow-(--shadow-feather) focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30 focus-visible:ring-offset-4 focus-visible:ring-offset-paper"
                    onClick={() => setField('register_id', r.id)}
                    aria-pressed={selected}
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-2 h-2 w-2 shrink-0 rounded-full ${selected ? 'bg-rose' : 'bg-ink-4'}`}
                    />
                    <div className="min-w-0">
                      <div className="font-serif-zh text-lg leading-snug text-ink">{r.title}</div>
                      {r.summary && (
                        <div className="t-meta mt-1">
                          {r.summary}
                        </div>
                      )}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <TextField
        containerClassName="mb-8"
        label={`Premise`}
        multiline
        rows={24}
        value={values.body}
        onChange={e => setField('body', e.target.value)}
        placeholder={`Write the ${entityLabel('world')}'s details here...`}
      />
    </>
  )
}
