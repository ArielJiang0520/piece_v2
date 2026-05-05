import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../api'
import { entityLabel } from '../config'

export interface PromptSummary {
  id: number
  text: string
  piece_count: number
}

interface PromptResponse {
  prompt: PromptSummary
}

interface PromptMatchResponse {
  prompt: PromptSummary | null
}

const DEBOUNCE_MS = 300

export interface UsePromptMatchOptions {
  worldId: string | undefined
  queryPromptId: string | null
}

export function usePromptMatch({ worldId, queryPromptId }: UsePromptMatchOptions) {
  const queryClient = useQueryClient()
  const [prompt, setPrompt] = useState('')
  const [promptMatch, setPromptMatch] = useState<PromptSummary | null>(null)
  const [debouncedPrompt, setDebouncedPrompt] = useState('')
  const [promptError, setPromptError] = useState('')

  const normalizedPrompt = prompt.trim()
  const promptMatchText = promptMatch?.text.trim() ?? ''

  const promptQuery = useQuery({
    queryKey: ['prompt-head', worldId, queryPromptId],
    queryFn: () =>
      apiFetch(`/api/worlds/${worldId}/prompts/${encodeURIComponent(queryPromptId!)}?limit=1`) as Promise<PromptResponse>,
    enabled: !!worldId && !!queryPromptId,
  })

  const promptMatchQuery = useQuery({
    queryKey: ['prompt-match', worldId, debouncedPrompt],
    queryFn: () =>
      apiFetch(`/api/worlds/${worldId}/prompts/match?text=${encodeURIComponent(debouncedPrompt)}`) as Promise<PromptMatchResponse>,
    enabled: !!worldId && !!debouncedPrompt && debouncedPrompt === normalizedPrompt && promptMatchText !== debouncedPrompt,
    staleTime: 15_000,
  })

  useEffect(() => {
    if (!queryPromptId) {
      setPromptMatch(null)
      return
    }
    if (promptQuery.data) {
      setPrompt(promptQuery.data.prompt.text)
      setPromptMatch(promptQuery.data.prompt)
      setPromptError('')
    } else if (promptQuery.isError) {
      setPromptMatch(null)
      setPromptError(`Could not load ${entityLabel('prompt')}`)
    }
  }, [queryPromptId, promptQuery.data, promptQuery.isError])

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedPrompt(normalizedPrompt)
    }, DEBOUNCE_MS)
    return () => clearTimeout(timeout)
  }, [normalizedPrompt])

  useEffect(() => {
    if (!normalizedPrompt) {
      setPromptMatch(null)
      return
    }
    setPromptMatch(current => current && current.text.trim() !== normalizedPrompt ? null : current)
  }, [normalizedPrompt])

  useEffect(() => {
    if (debouncedPrompt !== normalizedPrompt || !promptMatchQuery.data) return
    setPromptMatch(promptMatchQuery.data.prompt)
  }, [debouncedPrompt, normalizedPrompt, promptMatchQuery.data])

  const matchedPrompt = promptMatch && promptMatch.text.trim() === normalizedPrompt ? promptMatch : null
  const promptPieceCount = matchedPrompt?.piece_count ?? 0
  const loadingPrompt = !!queryPromptId && promptQuery.isPending

  function applyPromptSaved(saved: PromptSummary) {
    setPromptMatch(saved)
    queryClient.setQueryData(['prompt-match', worldId, saved.text], { prompt: saved })
  }

  return {
    prompt,
    setPrompt,
    normalizedPrompt,
    matchedPrompt,
    promptPieceCount,
    loadingPrompt,
    promptError,
    applyPromptSaved,
  }
}
