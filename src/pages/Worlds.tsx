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
        <h1 className="font-serif-zh text-2xl font-normal text-ink">Piece</h1>
        <div className="flex items-center gap-3">
          <span className="text-ink-3 text-sm">{user?.username}</span>
          <button
            className="text-ink-3 hover:text-ink text-sm border border-paper-3 hover:border-ink-4 rounded-sm px-3 py-1 transition-colors"
            onClick={handleLogout}
          >
            Log out
          </button>
        </div>
      </div>

      <div className="mb-4">
        {!showNew ? (
          <button
            className="bg-rose hover:bg-rose-deep text-white rounded-sm px-4 py-2 font-medium transition-colors"
            onClick={() => setShowNew(true)}
          >
            New World
          </button>
        ) : (
          <div className="flex gap-2">
            <input
              className="flex-1 bg-paper-2 border border-paper-3 rounded-sm px-3 py-2 text-ink placeholder-ink-3 focus:outline-none focus:border-rose"
              placeholder="World name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createWorld()}
              autoFocus
            />
            <button
              className="bg-rose hover:bg-rose-deep text-white rounded-sm px-4 py-2 font-medium transition-colors disabled:opacity-50"
              onClick={createWorld}
              disabled={creating}
            >
              Create
            </button>
            <button
              className="border border-paper-3 text-ink-3 rounded-sm px-4 py-2 transition-colors hover:border-ink-4 hover:text-ink"
              onClick={() => { setShowNew(false); setNewName('') }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {worlds.length === 0 ? (
        <p className="text-ink-3 text-sm mt-8">No worlds yet. Create one to get started.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {worlds.map(w => (
            <button
              key={w.id}
              className="text-left bg-paper hover:bg-paper-2 border border-paper-3 rounded-md px-4 py-3 transition-colors"
              onClick={() => navigate(`/worlds/${w.id}`)}
            >
              <div className="font-serif-zh text-ink font-normal">{w.name}</div>
              {w.summary && <div className="text-ink-2 text-sm mt-1">{w.summary}</div>}
              <div className="text-ink-3 text-xs mt-1">{relativeTime(w.updated_at)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
