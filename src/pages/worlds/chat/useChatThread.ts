import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import { readServerSentEvents } from '@/utils/sse'
import { useWorldAdditions } from '../shared/useWorldAdditions'

export interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  created_at: number
}

// What the thread is about, and so what its bot can see. Every one of them gets the world and
// its switched-on additions; what differs is whether a prompt is on the table, and which one.
// The world version is never sent — the server takes the world's checked-out one.
export type ChatSubject =
  | { kind: 'world' }
  | { kind: 'new-prompt' }
  | { kind: 'cluster'; clusterId: number }

// Optimistic turns have no server id yet; they get real ones when the query refetches.
const PENDING_ID = -1

interface SendOptions {
  replaceFromId?: number
}

function subjectPath(subject: ChatSubject) {
  if (subject.kind === 'cluster') return `/cluster/${subject.clusterId}`
  if (subject.kind === 'new-prompt') return '/new-prompt'
  return ''
}

function subjectKey(subject: ChatSubject) {
  return subject.kind === 'cluster' ? `cluster:${subject.clusterId}` : subject.kind
}

// `subject` is null while what the thread is about is still being resolved (a cluster chat
// opened by prompt id has to read the prompt first); the thread simply isn't there yet.
export function useChatThread(worldId: string | undefined, subject: ChatSubject | null) {
  const queryClient = useQueryClient()
  const controllerRef = useRef<AbortController | null>(null)
  // Read through a ref so `send` keeps a stable identity — the switched-on set changes as the
  // reader toggles additions, and every send should use the current one regardless.
  const { activeIds } = useWorldAdditions(worldId)
  const additionIdsRef = useRef<number[]>(activeIds)
  additionIdsRef.current = activeIds
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState('')
  // While a turn is in flight this holds the whole thread (server rows + the streaming
  // turns); the query is the source of truth the rest of the time.
  const [localThread, setLocalThread] = useState<ChatMessage[] | null>(null)

  const endpoint = subject ? `/api/worlds/${worldId}/chat${subjectPath(subject)}` : ''
  const queryKey = useMemo(
    () => ['world-chat', worldId, subject ? subjectKey(subject) : null],
    [worldId, subject],
  )

  const threadQuery = useQuery({
    queryKey,
    queryFn: () => apiFetch(endpoint) as Promise<ChatMessage[]>,
    enabled: !!worldId && !!subject,
  })

  const messages = localThread ?? threadQuery.data ?? []

  useEffect(() => () => controllerRef.current?.abort(), [])

  const send = useCallback(async (text: string, options: SendOptions = {}) => {
    const message = text.trim()
    if (!message || !worldId || !subject || controllerRef.current) return

    const base = queryClient.getQueryData<ChatMessage[]>(queryKey) ?? []
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
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ message, replace_from_id: options.replaceFromId, additionIds: additionIdsRef.current }),
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
              queryClient.setQueryData(queryKey, event.messages)
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
        await queryClient.invalidateQueries({ queryKey })
      }
      // Only now drop the optimistic view: the query cache holds the real rows (with the real
      // ids that edit/regenerate need).
      setLocalThread(null)
    }
  }, [endpoint, queryClient, queryKey, subject, worldId])

  const stop = useCallback(() => {
    controllerRef.current?.abort()
  }, [])

  const clearMutation = useMutation({
    mutationFn: () => apiFetch(endpoint, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.setQueryData(queryKey, [])
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
