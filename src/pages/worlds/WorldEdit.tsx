import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../../api'

interface World {
  name: string
  summary: string
  body: string
}

export default function WorldEdit() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [summary, setSummary] = useState('')
  const [body, setBody] = useState('')
  const [initialized, setInitialized] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const worldQuery = useQuery({
    queryKey: ['world', id],
    queryFn: () => apiFetch(`/api/worlds/${id}`) as Promise<World>,
    enabled: !!id,
  })

  useEffect(() => {
    if (worldQuery.data && !initialized) {
      setName(worldQuery.data.name)
      setSummary(worldQuery.data.summary)
      setBody(worldQuery.data.body)
      setInitialized(true)
    }
  }, [worldQuery.data, initialized])

  useEffect(() => {
    if (worldQuery.isError) navigate('/')
  }, [worldQuery.isError, navigate])

  function invalidateWorld() {
    queryClient.invalidateQueries({ queryKey: ['world', id] })
    queryClient.invalidateQueries({ queryKey: ['worlds'] })
    queryClient.invalidateQueries({ queryKey: ['world-clusters', id] })
  }

  const saveNameMutation = useMutation({
    mutationFn: (next: string) =>
      apiFetch(`/api/worlds/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: next }),
      }),
    onSuccess: invalidateWorld,
  })

  const saveBodyMutation = useMutation({
    mutationFn: (payload: { summary: string; body: string }) =>
      apiFetch(`/api/worlds/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
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
  })

  function saveName() {
    const trimmed = name.trim()
    if (!trimmed) return
    saveNameMutation.mutate(trimmed)
  }

  function saveBody() {
    saveBodyMutation.mutate({ summary, body })
  }

  function deleteWorld() {
    deleteMutation.mutate()
  }

  if (!initialized) return <div className="page-width p-6 text-ink-3">Loading...</div>

  return (
    <div className="page-width min-h-svh px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-6">
      <div className="mb-6">
        <Link to={`/worlds/${id}`} className="text-rose hover:text-rose-deep text-sm">
          Back to pieces
        </Link>
      </div>

      <div className="mb-6">
        <label className="block text-xs text-ink-3 mb-1 uppercase tracking-wide">World name</label>
        <input
          className="w-full bg-paper-2 border border-paper-3 rounded-sm px-3 py-2 text-ink focus:outline-none focus:border-rose"
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={saveName}
        />
      </div>

      <div className="mb-6">
        <label className="block text-xs text-ink-3 mb-1 uppercase tracking-wide">Summary</label>
        <textarea
          className="w-full bg-paper-2 border border-paper-3 rounded-sm px-3 py-2 text-ink text-sm focus:outline-none focus:border-rose resize-y placeholder-ink-3"
          rows={3}
          value={summary}
          onChange={e => setSummary(e.target.value)}
          placeholder="A short description of this world..."
        />
      </div>

      <div className="mb-4">
        <label className="block text-xs text-ink-3 mb-1 uppercase tracking-wide">System instruction (world body)</label>
        <textarea
          className="w-full bg-paper-2 border border-paper-3 rounded-sm px-3 py-2 text-ink font-mono text-sm focus:outline-none focus:border-rose resize-y placeholder-ink-3"
          rows={24}
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Write the world's system instruction here..."
        />
      </div>

      <div className="flex items-center gap-3 mb-12">
        <button
          className="bg-rose hover:bg-rose-deep text-white rounded-sm px-4 py-2 font-medium transition-colors disabled:opacity-50"
          onClick={saveBody}
          disabled={saveBodyMutation.isPending}
        >
          {saveBodyMutation.isPending ? 'Saving...' : 'Save'}
        </button>
      </div>

      <div className="border-t border-paper-3 pt-6">
        {!confirmDelete ? (
          <button
            className="text-rose-deep hover:text-rose text-sm border border-rose hover:border-rose-deep rounded-sm px-4 py-2 transition-colors"
            onClick={() => setConfirmDelete(true)}
          >
            Delete world
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-ink-3 text-sm">Delete this world and all its pieces?</span>
            <button
              className="bg-rose-deep hover:bg-rose text-white rounded-sm px-4 py-2 text-sm font-medium transition-colors"
              onClick={deleteWorld}
            >
              Yes, delete
            </button>
            <button
              className="text-ink-3 text-sm hover:text-ink"
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
