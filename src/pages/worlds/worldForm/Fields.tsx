import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../../../api'
import { entityLabel } from '../../../config'
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
        containerClassName="mb-6"
        label={`${entityLabel('world', { capitalize: true })} name`}
        value={values.name}
        onChange={e => setField('name', e.target.value)}
        autoFocus={autoFocusName}
      />

      <div className="mb-6">
        <label className="mb-1 block text-sm uppercase tracking-wide text-ink-3">Setting</label>
        <div className="flex gap-2">
          <button
            type="button"
            className={`rounded-sm border px-3 py-2 text-sm transition-colors ${values.origin === 'original'
              ? 'border-rose bg-rose text-white'
              : 'border-paper-3 bg-paper-2 text-ink hover:border-rose'
              }`}
            onClick={() => setField('origin', 'original')}
          >
            original
          </button>
          <button
            type="button"
            className={`rounded-sm border px-3 py-2 text-sm transition-colors ${values.origin !== 'original'
              ? 'border-rose bg-rose text-white'
              : 'border-paper-3 bg-paper-2 text-ink hover:border-rose'
              }`}
            onClick={() => setField('origin', '')}
          >
            based on an existing work
          </button>
        </div>
        {values.origin !== 'original' && (
          <TextField
            containerClassName="mt-3"
            value={values.origin}
            onChange={e => setField('origin', e.target.value)}
            placeholder="work name"
          />
        )}
      </div>

      <div className="mb-6">
        <label className="mb-1 block text-sm uppercase tracking-wide text-ink-3">Vibe</label>
        {registersQuery.isLoading ? (
          <p className="text-sm text-ink-3">Loading registers...</p>
        ) : registers.length === 0 ? (
          <p className="text-sm text-ink-3">No registers available.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {registers.map(r => {
              const selected = values.register_id === r.id
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    className={`w-full rounded-sm border px-3 py-2 text-left transition-colors ${selected
                      ? 'border-rose bg-rose text-white'
                      : 'border-paper-3 bg-paper-2 text-ink hover:border-rose'
                      }`}
                    onClick={() => setField('register_id', r.id)}
                  >
                    <div className="font-serif-zh text-[15px]">{r.title}</div>
                    {r.summary && (
                      <div className={`mt-1 text-xs ${selected ? 'text-white/85' : 'text-ink-3'}`}>
                        {r.summary}
                      </div>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <TextField
        containerClassName="mb-4"
        label={`Premise`}
        multiline
        rows={24}
        value={values.body}
        onChange={e => setField('body', e.target.value)}
        placeholder={`Write the ${entityLabel('world')}'s details here...`}
        mono
      />
    </>
  )
}
