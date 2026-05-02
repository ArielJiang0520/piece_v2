import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../api'

interface SuggestionsResponse {
  prompts: string[]
}

export default function CreatePrompt() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [worldName, setWorldName] = useState('')
  const [direction, setDirection] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [previousPrompts, setPreviousPrompts] = useState<string[]>([])
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    apiFetch(`/api/worlds/${id}`)
      .then(w => setWorldName(w.name))
      .catch(() => navigate('/'))
  }, [id, navigate])

  async function generateSuggestions() {
    if (generating) return

    setGenerating(true)
    setError('')

    try {
      const response = await apiFetch(`/api/worlds/${id}/prompts/suggestions`, {
        method: 'POST',
        body: JSON.stringify({
          direction: direction.trim(),
          previousPrompts,
        }),
      }) as SuggestionsResponse

      setSuggestions(response.prompts)
      setPreviousPrompts(prev => [...prev, ...response.prompts])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate prompts')
    } finally {
      setGenerating(false)
    }
  }

  function choosePrompt(prompt: string) {
    navigate(`/worlds/${id}/generate`, { state: { promptDraft: prompt } })
  }

  return (
    <div className="min-h-screen page-width px-4 py-6">
      <div className="mb-4">
        <Link to={`/worlds/${id}`} className="text-rose hover:text-rose-deep text-sm">
          Back to {worldName || 'Pieces'}
        </Link>
      </div>

      <h1 className="font-serif-zh text-2xl font-normal text-ink mb-6">Create a prompt</h1>

      <div className="mb-4">
        <label htmlFor="prompt-direction" className="block text-sm font-medium text-ink-3 mb-2">
          Optional direction
        </label>
        <textarea
          id="prompt-direction"
          className="w-full bg-paper-2 border border-paper-3 rounded-sm px-3 py-2 text-ink placeholder-ink-3 focus:outline-none focus:border-rose resize-y disabled:opacity-50"
          rows={4}
          placeholder="What kind of prompt do you want?"
          value={direction}
          onChange={e => setDirection(e.target.value)}
          disabled={generating}
        />
      </div>

      <div className="flex items-center gap-3 mb-6">
        <button
          className="bg-rose hover:bg-rose-deep text-white rounded-sm px-5 py-2 font-medium transition-colors disabled:opacity-50"
          onClick={generateSuggestions}
          disabled={generating}
        >
          {generating ? 'Generating...' : suggestions.length > 0 ? 'Regenerate' : 'Generate prompts'}
        </button>
        {error && <p className="text-rose-deep text-sm">{error}</p>}
      </div>

      {suggestions.length > 0 && (
        <div className="flex flex-col gap-3">
          {suggestions.map((prompt, index) => (
            <button
              key={`${index}-${prompt}`}
              type="button"
              className="w-full text-left bg-paper border border-paper-3 rounded-md px-4 py-3 font-serif-zh text-ink leading-7 transition-colors hover:bg-paper-2 hover:border-ink-4 focus:outline-none focus:border-rose disabled:opacity-50"
              onClick={() => choosePrompt(prompt)}
              disabled={generating}
            >
              {prompt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
