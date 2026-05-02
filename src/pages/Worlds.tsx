import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth'
import { apiFetch } from '../api'
import RelativeTimeStatus from '../ui/RelativeTimeStatus'

interface World {
  id: number
  name: string
  summary: string
  updated_at: number
  latest_piece_at: number | null
  prompt_cluster_count: number
  piece_count: number
}

function countLabel(count: number, singular: string) {
  const value = Number(count)
  return `${value} ${value === 1 ? singular : `${singular}s`}`
}

export default function Worlds() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')

  const worldsQuery = useQuery({
    queryKey: ['worlds'],
    queryFn: () => apiFetch('/api/worlds') as Promise<World[]>,
  })
  const worlds = worldsQuery.data ?? []

  const createMutation = useMutation({
    mutationFn: (name: string) =>
      apiFetch('/api/worlds', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }) as Promise<World>,
    onSuccess: world => {
      queryClient.invalidateQueries({ queryKey: ['worlds'] })
      navigate(`/worlds/${world.id}`)
    },
  })

  function createWorld() {
    const trimmed = newName.trim()
    if (!trimmed || createMutation.isPending) return
    createMutation.mutate(trimmed)
  }

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen page-width">
      <header className="flex items-baseline justify-between gap-4 border-b border-paper-3 px-6 py-7">
        <h1 className="font-serif text-[32px] font-bold leading-none tracking-normal text-ink">Piece</h1>
        <div className="flex items-center gap-3 min-w-0">
          <span className="truncate text-sm text-ink-3">{user?.username}</span>
          <button
            className="shrink-0 rounded-sm border border-paper-3 px-3 py-1.5 text-sm text-ink-4 transition-colors hover:border-ink-4 hover:text-ink-3"
            onClick={handleLogout}
          >
            Log out
          </button>
        </div>
      </header>

      <main className="pb-10">
        <div className="px-6 pt-7">
          {!showNew ? (
            <button
              className="inline-flex items-center gap-3 rounded-sm bg-rose px-6 py-3 text-base font-medium text-white transition-colors hover:bg-rose-deep"
              onClick={() => setShowNew(true)}
            >
              <span className="text-[28px] font-light leading-4" aria-hidden="true">+</span>
              New World
            </button>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                className="flex-1 bg-paper-2 border border-paper-3 rounded-sm px-3 py-2 text-ink placeholder-ink-3 focus:outline-none focus:border-rose"
                placeholder="World name"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createWorld()}
                autoFocus
              />
              <button
                className="rounded-sm bg-rose px-4 py-2 font-medium text-white transition-colors hover:bg-rose-deep disabled:opacity-50"
                onClick={createWorld}
                disabled={createMutation.isPending}
              >
                Create
              </button>
              <button
                className="rounded-sm border border-paper-3 px-4 py-2 text-ink-3 transition-colors hover:border-ink-4 hover:text-ink"
                onClick={() => { setShowNew(false); setNewName('') }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 px-6 pb-4 pt-8">
          <div className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-4">
            Your Worlds &middot; {worlds.length}
          </div>
          <div className="h-px flex-1 bg-paper-3" />
        </div>

        {worlds.length === 0 ? (
          <p className="px-6 text-sm text-ink-3">No worlds yet. Create one to get started.</p>
        ) : (
          <div className="flex flex-col gap-3 px-4">
            {worlds.map(w => {
              const timestamp = w.latest_piece_at ?? w.updated_at

              return (
                <button
                  key={w.id}
                  className="relative overflow-hidden rounded-md border border-paper-3 bg-paper px-5 py-4 text-left transition-colors before:absolute before:bottom-6 before:left-0 before:top-6 before:w-0.5 before:rounded-r-sm before:bg-rose before:opacity-0 before:transition-opacity hover:border-ink-4 hover:bg-paper-2 hover:before:opacity-100"
                  onClick={() => navigate(`/worlds/${w.id}`)}
                >
                  <RelativeTimeStatus timestamp={timestamp} prefix="Updated " />
                  <div className="font-serif-zh text-[21px] font-normal leading-snug text-ink">{w.name}</div>
                  {w.summary && (
                    <div className="font-serif-zh mt-2 line-clamp-3 text-sm text-ink-3">
                      {w.summary}
                    </div>
                  )}
                  <div className="mt-4 text-xs text-ink-4">
                    {countLabel(w.prompt_cluster_count, 'prompt')}
                    <span className="px-2">&middot;</span>
                    {countLabel(w.piece_count, 'piece')}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
