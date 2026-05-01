import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { apiFetch } from '../api'

export default function WorldDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    apiFetch(`/api/worlds/${id}`)
      .then(w => { setName(w.name); setBody(w.body) })
      .catch(() => navigate('/'))
      .finally(() => setLoading(false))
  }, [id])

  async function saveName() {
    if (!name.trim()) return
    await apiFetch(`/api/worlds/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: name.trim() }),
    }).catch(console.error)
  }

  async function saveBody() {
    setSaving(true)
    setSaved(false)
    try {
      await apiFetch(`/api/worlds/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ body }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  async function deleteWorld() {
    await apiFetch(`/api/worlds/${id}`, { method: 'DELETE' })
    navigate('/')
  }

  if (loading) return <div className="p-6 text-zinc-400">Loading...</div>

  return (
    <div className="min-h-screen px-4 py-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link to={`/worlds/${id}/pieces`} className="text-violet-400 hover:text-violet-300 text-sm">
          ← Pieces
        </Link>
      </div>

      <div className="mb-6">
        <label className="block text-xs text-zinc-500 mb-1 uppercase tracking-wide">World name</label>
        <input
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 focus:outline-none focus:border-violet-500"
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={saveName}
        />
      </div>

      <div className="mb-4">
        <label className="block text-xs text-zinc-500 mb-1 uppercase tracking-wide">System instruction (world body)</label>
        <textarea
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 font-mono text-sm focus:outline-none focus:border-violet-500 resize-y"
          rows={24}
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Write the world's system instruction here..."
        />
      </div>

      <div className="flex items-center gap-3 mb-12">
        <button
          className="bg-violet-600 hover:bg-violet-500 text-white rounded px-4 py-2 font-medium transition-colors disabled:opacity-50"
          onClick={saveBody}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        {saved && <span className="text-zinc-400 text-sm">Saved</span>}
      </div>

      <div className="border-t border-zinc-800 pt-6">
        {!confirmDelete ? (
          <button
            className="text-rose-400 hover:text-rose-300 text-sm border border-rose-900 hover:border-rose-700 rounded px-4 py-2 transition-colors"
            onClick={() => setConfirmDelete(true)}
          >
            Delete world
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-zinc-400 text-sm">Delete this world and all its pieces?</span>
            <button
              className="bg-rose-700 hover:bg-rose-600 text-white rounded px-4 py-2 text-sm font-medium transition-colors"
              onClick={deleteWorld}
            >
              Yes, delete
            </button>
            <button
              className="text-zinc-400 text-sm hover:text-zinc-200"
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
