import { useState } from 'react'
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../../api'
import TextField from '../../components/TextField'
import { useTopNavConfig } from '../../components/TopNav'
import { useToast } from '../../components/Toast'

interface Register {
  id: number
  title: string
  details: string
  summary: string
}

export default function EditRegisters() {
  const queryClient = useQueryClient()
  const toast = useToast()
  useTopNavConfig({ title: 'Edit Registers', backHref: '/worlds' })

  const registersQuery = useQuery({
    queryKey: ['registers'],
    queryFn: () => apiFetch('/api/registers') as Promise<Register[]>,
  })
  const registers = registersQuery.data ?? []

  const [newTitle, setNewTitle] = useState('')
  const [newDetails, setNewDetails] = useState('')
  const [newSummary, setNewSummary] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDetails, setEditDetails] = useState('')
  const [editSummary, setEditSummary] = useState('')

  const createMutation = useMutation({
    mutationFn: (input: { title: string; details: string; summary: string }) =>
      apiFetch('/api/registers', {
        method: 'POST',
        body: JSON.stringify(input),
      }) as Promise<Register>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['registers'] })
      setNewTitle('')
      setNewDetails('')
      setNewSummary('')
    },
    onError: (err: unknown) => {
      toast.show({ kind: 'error', title: err instanceof Error ? err.message : 'Could not create register' })
    },
  })

  const updateMutation = useMutation({
    mutationFn: (input: { id: number; title: string; details: string; summary: string }) =>
      apiFetch(`/api/registers/${input.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: input.title, details: input.details, summary: input.summary }),
      }) as Promise<Register>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['registers'] })
      setEditingId(null)
    },
    onError: (err: unknown) => {
      toast.show({ kind: 'error', title: err instanceof Error ? err.message : 'Could not update register' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/registers/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['registers'] })
    },
    onError: (err: unknown) => {
      toast.show({ kind: 'error', title: err instanceof Error ? err.message : 'Could not delete register' })
    },
  })

  function startEdit(r: Register) {
    setEditingId(r.id)
    setEditTitle(r.title)
    setEditDetails(r.details)
    setEditSummary(r.summary ?? '')
  }

  function cancelEdit() {
    setEditingId(null)
  }

  function saveEdit() {
    if (editingId == null) return
    if (!editTitle.trim() || !editDetails.trim()) return
    updateMutation.mutate({ id: editingId, title: editTitle, details: editDetails, summary: editSummary })
  }

  function handleCreate() {
    if (!newTitle.trim() || !newDetails.trim() || createMutation.isPending) return
    createMutation.mutate({ title: newTitle, details: newDetails, summary: newSummary })
  }

  function handleDelete(id: number) {
    if (!confirm('Delete this register?')) return
    deleteMutation.mutate(id)
  }

  return (
    <div className="page-width min-h-svh px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-6">
      <section className="mb-8 rounded-md border border-paper-3 bg-paper-2 p-4">
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-4">
          New Register
        </h2>
        <TextField
          containerClassName="mb-3"
          label="Title"
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
        />
        <TextField
          containerClassName="mb-3"
          label="Summary"
          multiline
          rows={3}
          value={newSummary}
          onChange={e => setNewSummary(e.target.value)}
        />
        <TextField
          containerClassName="mb-3"
          label="Details"
          multiline
          rows={4}
          value={newDetails}
          onChange={e => setNewDetails(e.target.value)}
        />
        <button
          className="inline-flex items-center gap-2 rounded-sm bg-rose px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-deep disabled:opacity-50"
          onClick={handleCreate}
          disabled={!newTitle.trim() || !newDetails.trim() || createMutation.isPending}
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          {createMutation.isPending ? 'Adding...' : 'Add Register'}
        </button>
      </section>

      <div className="flex items-center gap-3 pb-4">
        <div className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-4">
          Registers &middot; {registers.length}
        </div>
        <div className="h-px flex-1 bg-paper-3" />
      </div>

      {registersQuery.isLoading ? (
        <p className="text-sm text-ink-3">Loading...</p>
      ) : registers.length === 0 ? (
        <p className="text-sm text-ink-3">No registers yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {registers.map(r => (
            <li
              key={r.id}
              className="rounded-md border border-paper-3 bg-paper px-4 py-3"
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="font-mono text-xs text-ink-4">id: {r.id}</span>
                {editingId === r.id ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="grid h-8 w-8 place-items-center rounded-full text-ink-3 transition-colors hover:bg-paper-2 hover:text-ink disabled:opacity-50"
                      onClick={saveEdit}
                      disabled={!editTitle.trim() || !editDetails.trim() || updateMutation.isPending}
                      aria-label="Save"
                      title="Save"
                    >
                      <Check aria-hidden="true" className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="grid h-8 w-8 place-items-center rounded-full text-ink-3 transition-colors hover:bg-paper-2 hover:text-ink"
                      onClick={cancelEdit}
                      aria-label="Cancel"
                      title="Cancel"
                    >
                      <X aria-hidden="true" className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="grid h-8 w-8 place-items-center rounded-full text-ink-3 transition-colors hover:bg-paper-2 hover:text-ink"
                      onClick={() => startEdit(r)}
                      aria-label="Edit"
                      title="Edit"
                    >
                      <Pencil aria-hidden="true" className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="grid h-8 w-8 place-items-center rounded-full text-ink-3 transition-colors hover:bg-paper-2 hover:text-rose-deep"
                      onClick={() => handleDelete(r.id)}
                      aria-label="Delete"
                      title="Delete"
                    >
                      <Trash2 aria-hidden="true" className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              {editingId === r.id ? (
                <>
                  <TextField
                    containerClassName="mb-3"
                    label="Title"
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                  />
                  <TextField
                    label="Summary"
                    multiline
                    rows={3}
                    value={editSummary}
                    onChange={e => setEditSummary(e.target.value)}
                  />
                  <TextField
                    containerClassName="mb-3"
                    label="Details"
                    multiline
                    rows={4}
                    value={editDetails}
                    onChange={e => setEditDetails(e.target.value)}
                  />
                </>
              ) : (
                <>
                  <div className="font-serif-zh text-[17px] text-ink">{r.title}</div>
                  {r.summary && (
                    <div className="mt-2 whitespace-pre-wrap text-xs text-ink-3">
                      <span className="mr-1 font-semibold uppercase tracking-[0.12em] text-ink-4">Summary:</span>
                      {r.summary}
                    </div>
                  )}
                  <div className="mt-1 whitespace-pre-wrap text-sm text-ink-2">{r.details}</div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
