import { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import { useUiText } from '@/i18n'
import { normalizeTag } from '@/tags'
import type { TagCount } from '@/pages/worlds/shared/worldTypes'

interface TagInputProps {
  value: string[]
  onChange: (tags: string[]) => void
}

// Freeform tags: type and press enter (or a comma) to add. While typing, tags already in use that
// contain the text are offered, most used first, so the same idea lands on one spelling. What is
// shown is the normalized form — the same one the server stores.
export default function TagInput({ value, onChange }: TagInputProps) {
  const t = useUiText()
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const typed = normalizeTag(input)

  useEffect(() => {
    const timer = setTimeout(() => setQuery(typed), 200)
    return () => clearTimeout(timer)
  }, [typed])

  const suggestionsQuery = useQuery({
    queryKey: ['tags', query],
    queryFn: () => apiFetch(`/api/tags?q=${encodeURIComponent(query)}`) as Promise<TagCount[]>,
    enabled: query.length > 0,
  })
  const suggestions = typed
    ? (suggestionsQuery.data ?? []).filter(tag => !value.includes(tag.name))
    : []

  function add(raw: string) {
    const tag = normalizeTag(raw)
    setInput('')
    if (!tag || value.includes(tag)) return
    onChange([...value, tag])
  }

  return (
    <div>
      {value.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {value.map(tag => (
            <button
              key={tag}
              type="button"
              onClick={() => onChange(value.filter(existing => existing !== tag))}
              aria-label={t.removeTag(tag)}
              className="chip chip-on pr-2.5"
            >
              <span>{tag}</span>
              <X aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      )}
      <input
        value={input}
        onChange={event => {
          const next = event.target.value
          // A comma (either width) ends a tag, so a pasted "a, b, c" becomes three.
          if (/[,，]/.test(next)) {
            const parts = next.split(/[,，]/)
            const rest = parts.pop() ?? ''
            const added = parts.map(normalizeTag).filter(tag => tag && !value.includes(tag))
            if (added.length > 0) onChange([...value, ...new Set(added)])
            setInput(rest)
            return
          }
          setInput(next)
        }}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            event.preventDefault()
            add(input)
          } else if (event.key === 'Backspace' && input === '' && value.length > 0) {
            onChange(value.slice(0, -1))
          }
        }}
        onBlur={() => add(input)}
        enterKeyHint="done"
        placeholder={t.addTagPlaceholder}
        className="input"
      />
      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {suggestions.map(tag => (
            <button
              key={tag.name}
              type="button"
              // Before the input's blur adds the half-typed text instead.
              onPointerDown={event => {
                event.preventDefault()
                add(tag.name)
              }}
              className="chip"
            >
              <Plus aria-hidden="true" />
              <span>{tag.name}</span>
              <span className="text-[12px] text-ink-4">{tag.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
