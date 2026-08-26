import { useMemo } from 'react'
import { ArrowRight } from 'lucide-react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import { entityLabel } from '@/config'
import { useUiText } from '@/i18n'
import { useLanguageId } from '@/preferences/language'
import ChatScreen, { chatReplyActionClass } from './ChatScreen'
import type { ChatSubject } from './useChatThread'
import {
  PIECE_STRIP_LIMIT,
  parseVersionDraft,
  type ClusterResponse,
  type PromptPiecesResponse,
} from '../shared/types'

// The thread about a prompt — always the cluster the prompt on the route belongs to, whether it
// was opened from a saved prompt or from a version of it being edited.
//
// It saves nothing. An action navigates to the prompt editor with the reply in it, whole — the
// row is still born in pieces.ts when a piece is saved.
export default function PromptChatScreen() {
  const t = useUiText()
  const language = useLanguageId()
  const { id, promptId } = useParams<{ id: string; promptId: string }>()
  const location = useLocation()
  const navigate = useNavigate()

  // The editor's unsaved text, carried in so leaving for the chat doesn't eat it. Its presence
  // is also what says the chat was opened from the editor rather than from a saved prompt.
  const routeState = location.state as { versionDraft?: unknown } | null
  const versionDraft = parseVersionDraft(routeState?.versionDraft)
  const fromEditor = versionDraft !== null

  // Shares its key with the prompt page, so opening the chat from there costs no fetch.
  const promptQuery = useQuery({
    queryKey: ['prompt', id, promptId ?? null, 'generate', PIECE_STRIP_LIMIT],
    queryFn: () =>
      apiFetch(`/api/worlds/${id}/prompts/${encodeURIComponent(promptId!)}?limit=${PIECE_STRIP_LIMIT}`) as Promise<PromptPiecesResponse>,
    enabled: !!id && !!promptId,
  })
  const clusterId = promptQuery.data?.prompt.cluster_id ?? null

  const clusterQuery = useQuery({
    queryKey: ['cluster', id, String(clusterId)],
    queryFn: () => apiFetch(`/api/worlds/${id}/clusters/${clusterId}`) as Promise<ClusterResponse>,
    enabled: !!id && clusterId != null,
  })
  const clusterPrompts = clusterQuery.data?.prompts ?? []
  // A new version is written off the cluster's current text — its latest prompt.
  const latestPrompt = clusterPrompts[clusterPrompts.length - 1] ?? null

  const subject = useMemo<ChatSubject | null>(
    () => (clusterId == null ? null : { kind: 'cluster', clusterId }),
    [clusterId],
  )

  function goBack() {
    if (fromEditor) {
      navigate(`/worlds/${id}/prompt/new`, {
        state: { versionDraft: routeState?.versionDraft },
      })
      return
    }
    navigate(`/worlds/${id}/prompt/${promptId}`)
  }

  function useAsNewPrompt(content: string) {
    navigate(`/worlds/${id}/prompt/new`, { state: { draftPrompt: content } })
  }

  function useAsNewVersion(content: string) {
    if (clusterId == null || !latestPrompt) return
    navigate(`/worlds/${id}/prompt/new`, {
      state: {
        versionDraft: {
          promptText: content,
          sourcePromptId: latestPrompt.id,
          sourceClusterId: clusterId,
          versionNumber: clusterPrompts.length + 1,
        },
      },
    })
  }

  // The whole reply goes to the editor. Nothing is parsed out of it — if it carries more than
  // the writer wants, they trim it in the editor they land in.
  function replyActions(content: string) {
    return (
      <>
        <button
          type="button"
          className={chatReplyActionClass}
          onClick={() => useAsNewVersion(content)}
          disabled={!latestPrompt}
        >
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          {t.chatNewVersion}
        </button>
        <button type="button" className={chatReplyActionClass} onClick={() => useAsNewPrompt(content)}>
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          {t.chatNewEntity(entityLabel('prompt', {}, language))}
        </button>
      </>
    )
  }

  return (
    <ChatScreen
      worldId={id}
      subject={subject}
      title={t.chatTitle}
      emptyHint={t.chatPromptEmpty(entityLabel('prompt', {}, language))}
      onBack={goBack}
      replyActions={replyActions}
    />
  )
}
