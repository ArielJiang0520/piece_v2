import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { apiFetch } from '../api'
import { MODELS, DEFAULT_MODEL_ID } from '../config'

export default function Generate() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [worldName, setWorldName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState(DEFAULT_MODEL_ID)
  const [output, setOutput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [pieceId, setPieceId] = useState<number | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    apiFetch(`/api/worlds/${id}`)
      .then(w => setWorldName(w.name))
      .catch(() => navigate('/'))
  }, [id])

  async function generate() {
    if (!prompt.trim() || streaming) return
    setStreaming(true)
    setOutput('')
    setPieceId(null)
    setError('')

    try {
      const res = await fetch(`/api/worlds/${id}/generate`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, model }),
      })

      if (!res.ok || !res.body) {
        setError('Request failed')
        setStreaming(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() ?? ''

        for (const event of events) {
          const line = event.trim()
          if (!line.startsWith('data: ')) continue
          try {
            const msg = JSON.parse(line.slice(6))
            if (msg.type === 'chunk') {
              setOutput(prev => prev + msg.content)
            } else if (msg.type === 'done') {
              setPieceId(msg.pieceId)
              setStreaming(false)
            } else if (msg.type === 'error') {
              setError(msg.message)
              setStreaming(false)
            }
          } catch {}
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
      setStreaming(false)
    }
  }

  return (
    <div className="min-h-screen px-4 py-6 max-w-2xl mx-auto">
      <div className="mb-4">
        <Link to={`/worlds/${id}/pieces`} className="text-violet-400 hover:text-violet-300 text-sm">
          ← {worldName || 'Pieces'}
        </Link>
      </div>

      <h2 className="text-lg font-semibold text-zinc-100 mb-6">{worldName}</h2>

      <div className="mb-3">
        <select
          className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 focus:outline-none focus:border-violet-500 disabled:opacity-50"
          value={model}
          onChange={e => setModel(e.target.value)}
          disabled={streaming}
        >
          {MODELS.map(m => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </div>

      <div className="mb-4">
        <textarea
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500 resize-y"
          rows={4}
          placeholder="Enter your prompt..."
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          disabled={streaming}
        />
      </div>

      <div className="flex items-center gap-3 mb-6">
        <button
          className="bg-violet-600 hover:bg-violet-500 text-white rounded px-5 py-2 font-medium transition-colors disabled:opacity-50"
          onClick={generate}
          disabled={streaming || !prompt.trim()}
        >
          {streaming ? 'Generating...' : 'Generate'}
        </button>
        {pieceId && (
          <button
            className="border border-violet-500 text-violet-400 hover:text-violet-300 hover:border-violet-400 rounded px-5 py-2 font-medium transition-colors"
            onClick={() => navigate(`/pieces/${pieceId}`)}
          >
            Read
          </button>
        )}
      </div>

      {error && <p className="text-rose-400 text-sm mb-4">{error}</p>}

      {output && (
        <div className="bg-zinc-800 border border-zinc-700 rounded px-4 py-4">
          <p className="text-zinc-100 text-[17px] leading-relaxed whitespace-pre-wrap">{output}</p>
        </div>
      )}
    </div>
  )
}
