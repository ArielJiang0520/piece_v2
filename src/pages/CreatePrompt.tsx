import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../api'

interface CreatedPrompt {
  id: number
}

export default function CreatePrompt() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [worldName, setWorldName] = useState('')
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    apiFetch(`/api/worlds/${id}`)
      .then(w => setWorldName(w.name))
      .catch(() => navigate('/'))
  }, [id, navigate])

  async function createPrompt() {
    const trimmed = text.trim()
    if (!trimmed || saving) return

    setSaving(true)
    setError('')

    try {
      const prompt = await apiFetch(`/api/worlds/${id}/prompts`, {
        method: 'POST',
        body: JSON.stringify({ text: trimmed }),
      }) as CreatedPrompt
      navigate(`/worlds/${id}/prompts/${prompt.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create prompt')
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen px-4 py-6 max-w-2xl mx-auto">
      <div className="mb-4">
        <Link to={`/worlds/${id}/pieces`} className="text-violet-400 hover:text-violet-300 text-sm">
          Back to {worldName || 'Pieces'}
        </Link>
      </div>

      <h1 className="text-lg font-semibold text-zinc-100 mb-6">Create a prompt</h1>

      <div className="mb-4">
        <textarea
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500 resize-y"
          rows={6}
          placeholder="Enter your prompt..."
          value={text}
          onChange={e => setText(e.target.value)}
          disabled={saving}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          className="bg-violet-600 hover:bg-violet-500 text-white rounded px-5 py-2 font-medium transition-colors disabled:opacity-50"
          onClick={createPrompt}
          disabled={saving || !text.trim()}
        >
          {saving ? 'Creating...' : 'Create prompt'}
        </button>
        {error && <p className="text-rose-400 text-sm">{error}</p>}
      </div>
    </div>
  )
}
