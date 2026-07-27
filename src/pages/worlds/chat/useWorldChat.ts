import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import { readServerSentEvents } from '@/utils/sse'

export interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  created_at: number
}

// Optimistic turns have no server id yet; they get real ones when the query refetches.
const PENDING_ID = -1

interface SendOptions {
  replaceFromId?: number
}

export function useWorldChat(worldId: string | undefined) {
  const queryClient = useQueryClient()
  const controllerRef = useRef<AbortController | null>(null)
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState('')
  // While a turn is in flight this holds the whole thread (server rows + the streaming
  // turns); the query is the source of truth the rest of the time.
  const [localThread, setLocalThread] = useState<ChatMessage[] | null>(null)

  const threadQuery = useQuery({
    queryKey: ['world-chat', worldId],
    queryFn: () => apiFetch(`/api/worlds/${worldId}/chat`) as Promise<ChatMessage[]>,
    enabled: !!worldId,
  })

  const messages = localThread ?? threadQuery.data ?? []

  useEffect(() => () => controllerRef.current?.abort(), [])

  const send = useCallback(async (text: string, options: SendOptions = {}) => {
    const message = text.trim()
    if (!message || !worldId || controllerRef.current) return

    const base = queryClient.getQueryData<ChatMessage[]>(['world-chat', worldId]) ?? []
    // Editing or regenerating drops the replaced turn and everything after it — no branches.
    const kept = options.replaceFromId != null
      ? base.slice(0, base.findIndex(turn => turn.id === options.replaceFromId))
      : base
    const now = Date.now()
    setLocalThread([
      ...kept,
      { id: PENDING_ID, role: 'user', content: message, created_at: now },
      { id: PENDING_ID, role: 'assistant', content: '', created_at: now },
    ])

    const controller = new AbortController()
    controllerRef.current = controller
    setStreaming(true)
    setError('')

    let failed = ''
    // Set once the server has handed us the persisted thread, so we can swap straight to it
    // instead of refetching.
    let synced = false
    try {
      const response = await fetch(`/api/worlds/${worldId}/chat`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ message, replace_from_id: options.replaceFromId }),
      })

      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => null)
        failed = body?.error ?? response.statusText
      } else {
        for await (const data of readServerSentEvents(response.body)) {
          const event = JSON.parse(data)
          if (event.type === 'chunk') {
            setLocalThread(thread => {
              if (!thread) return thread
              const next = thread.slice()
              const last = next[next.length - 1]
              next[next.length - 1] = { ...last, content: last.content + event.content }
              return next
            })
          } else if (event.type === 'error') {
            failed = event.message ?? ''
            break
          } else if (event.type === 'done') {
            // `done` only arrives once the turn is on disk and carries the thread with it —
            // adopt it directly rather than refetching, which would race that write.
            if (Array.isArray(event.messages)) {
              queryClient.setQueryData(['world-chat', worldId], event.messages)
              synced = true
            }
            break
          }
        }
      }
    } catch (err) {
      // A turn the reader stopped is not an error.
      if (!controller.signal.aborted) failed = err instanceof Error ? err.message : ''
    } finally {
      controllerRef.current = null
      setStreaming(false)
      if (failed) setError(failed)
      if (!synced) {
        // No `done` payload — the turn was stopped or errored. The server still persists what
        // it had, but it does that as its own request unwinds, so give it a beat before asking.
        await new Promise(resolve => setTimeout(resolve, 300))
        await queryClient.invalidateQueries({ queryKey: ['world-chat', worldId] })
      }
      // Only now drop the optimistic view: the query cache holds the real rows (with the real
      // ids that edit/regenerate need).
      setLocalThread(null)
    }
  }, [queryClient, worldId])

  const stop = useCallback(() => {
    controllerRef.current?.abort()
  }, [])

  const clearMutation = useMutation({
    mutationFn: () => apiFetch(`/api/worlds/${worldId}/chat`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.setQueryData(['world-chat', worldId], [])
      setLocalThread(null)
      setError('')
    },
  })

  return {
    messages,
    isLoading: threadQuery.isLoading,
    streaming,
    error,
    send,
    stop,
    clear: clearMutation.mutate,
    isClearing: clearMutation.isPending,
  }
}
