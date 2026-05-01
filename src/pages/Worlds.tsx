import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { apiFetch } from '../api'
import { relativeTime } from '../utils/time'

interface World {
  id: number
  name: string
  summary: string
  updated_at: number
}

export default function Worlds() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [worlds, setWorlds] = useState<World[]>([])
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    apiFetch('/api/worlds').then(setWorlds).catch(console.error)
  }, [])

  async function createWorld() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const world = await apiFetch('/api/worlds', {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim() }),
      })
      navigate(`/worlds/${world.id}`)
    } catch (e) {
      console.error(e)
    } finally {
      setCreating(false)
    }
  }

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen px-4 py-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-semibold text-zinc-100">Piece</h1>
        <div className="flex items-center gap-3">
          <span className="text-zinc-400 text-sm">{user?.username}</span>
          <button
            className="text-zinc-400 hover:text-zinc-200 text-sm border border-zinc-700 hover:border-zinc-500 rounded px-3 py-1 transition-colors"
            onClick={handleLogout}
          >
            Log out
          </button>
        </div>
      </div>

      <div className="mb-4">
        {!showNew ? (
          <button
            className="bg-violet-600 hover:bg-violet-500 text-white rounded px-4 py-2 font-medium transition-colors"
            onClick={() => setShowNew(true)}
          >
            New World
          </button>
        ) : (
          <div className="flex gap-2">
            <input
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500"
              placeholder="World name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createWorld()}
              autoFocus
            />
            <button
              className="bg-violet-600 hover:bg-violet-500 text-white rounded px-4 py-2 font-medium transition-colors disabled:opacity-50"
              onClick={createWorld}
              disabled={creating}
            >
              Create
            </button>
            <button
              className="border border-zinc-700 text-zinc-400 rounded px-4 py-2 transition-colors hover:border-zinc-500"
              onClick={() => { setShowNew(false); setNewName('') }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {worlds.length === 0 ? (
        <p className="text-zinc-500 text-sm mt-8">No worlds yet. Create one to get started.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {worlds.map(w => (
            <button
              key={w.id}
              className="text-left bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded px-4 py-3 transition-colors"
              onClick={() => navigate(`/worlds/${w.id}/pieces`)}
            >
              <div className="text-zinc-100 font-medium">{w.name}</div>
              {w.summary && <div className="text-zinc-400 text-sm mt-1">{w.summary}</div>}
              <div className="text-zinc-500 text-xs mt-1">{relativeTime(w.updated_at)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
