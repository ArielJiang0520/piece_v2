import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useUiText } from '@/i18n'
import ChatScreen from './ChatScreen'
import type { ChatSubject } from './useChatThread'

// The thread about a world. It sees the world body and its switched-on additions, nothing else,
// and there is nothing to do with a reply but read it and copy it — the writer edits their
// setting themselves.
export default function WorldChatScreen() {
  const t = useUiText()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const subject = useMemo<ChatSubject>(() => ({ kind: 'world' }), [])

  return (
    <ChatScreen
      worldId={id}
      subject={subject}
      title={t.chatTitle}
      emptyHint={t.chatEmpty}
      onBack={() => navigate(`/worlds/${id}/about`)}
    />
  )
}
