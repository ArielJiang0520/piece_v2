import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import ConfirmDialog from '@/components/ConfirmDialog'
import { SkeletonText } from '@/components/Skeleton'
import { useUiText } from '@/i18n'
import { useVisualViewport } from '@/hooks/useVisualViewport'
import { useWorldChat } from './useWorldChat'

const MAX_COMPOSER_HEIGHT = 140

// A full-screen conversation about one world. Deliberately its own route rather than a panel
// over the About screen: on a phone the keyboard has to be able to take half the screen, and
// only a surface that owns the whole viewport can keep the composer sitting on top of it.
//
// It never writes to the world — the writer reads the reply and edits their setting themselves.
export default function WorldChatScreen() {
  const t = useUiText()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  // Auto-scrolling is only ever welcome when the reader is already following the tail. Scroll
  // up to reread — or tap an older message to edit it — and nothing should yank you back down.
  const followingTailRef = useRef(true)

  const viewport = useVisualViewport()
  const { messages, isLoading, streaming, error, send, stop, clear, isClearing } = useWorldChat(id)
  const lastIndex = messages.length - 1

  // Nothing behind this surface should scroll while it is up.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])

  function handleScroll() {
    const node = scrollRef.current
    if (!node) return
    followingTailRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80
  }

  function scrollToTail() {
    const node = scrollRef.current
    if (node && followingTailRef.current) node.scrollTop = node.scrollHeight
  }

  useEffect(scrollToTail, [messages])

  // The keyboard opening shrinks the viewport; hold the tail in view for whoever was reading
  // it, but leave anyone who has scrolled away where they are.
  useEffect(scrollToTail, [viewport?.height])

  useLayoutEffect(() => {
    const node = composerRef.current
    if (!node) return
    node.style.height = 'auto'
    node.style.height = `${Math.min(node.scrollHeight, MAX_COMPOSER_HEIGHT)}px`
  }, [draft])

  function submitDraft() {
    if (streaming || !draft.trim()) return
    const text = draft
    setDraft('')
    setEditingId(null)
    send(text)
  }

  function startEditing(messageId: number, content: string) {
    if (streaming || messageId < 0) return
    setEditingId(messageId)
    setEditDraft(content)
  }

  function submitEdit(messageId: number) {
    if (!editDraft.trim()) return
    setEditingId(null)
    send(editDraft, { replaceFromId: messageId })
  }

  function regenerate(assistantIndex: number) {
    const previous = messages[assistantIndex - 1]
    if (!previous || previous.role !== 'user' || previous.id < 0) return
    send(previous.content, { replaceFromId: previous.id })
  }

  return (
    <div
      className="fixed inset-x-0 z-40 flex flex-col bg-paper"
      style={{
        top: viewport ? `${viewport.offsetTop}px` : 0,
        height: viewport ? `${viewport.height}px` : '100dvh',
      }}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-rose-line/80 px-2 py-2">
        <button
          type="button"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-3 transition-colors active:bg-paper-2 active:text-ink"
          aria-label={t.back}
          onClick={() => navigate(`/worlds/${id}/about`)}
        >
          <ArrowLeft aria-hidden="true" className="h-5 w-5" />
        </button>
        <span className="t-eyebrow shrink-0 leading-none">{t.chatTitle}</span>
        <div className="min-w-0 flex-1" />
        <button
          type="button"
          className="shrink-0 rounded-full px-2.5 py-1.5 font-serif-zh text-[14px] italic leading-none text-ink-3 transition-colors active:bg-paper-2 active:text-ink disabled:opacity-40"
          onClick={() => setConfirmClear(true)}
          disabled={messages.length === 0 || streaming}
        >
          {t.chatClear}
        </button>
      </header>

      <div ref={scrollRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {isLoading ? (
          <SkeletonText lineClassName="h-4" lines={3} />
        ) : messages.length === 0 ? (
          <p className="t-meta pt-12 text-center text-ink-3">{t.chatEmpty}</p>
        ) : (
          <div className="flex flex-col gap-6">
            {messages.map((message, index) => {
              if (message.role === 'user') {
                if (editingId === message.id) {
                  return (
                    <div key={`${message.id}-${index}`} className="flex flex-col items-end gap-2">
                      <textarea
                        value={editDraft}
                        onChange={event => setEditDraft(event.target.value)}
                        autoFocus
                        rows={3}
                        className="w-full resize-none rounded-2xl bg-paper-2 px-3.5 py-2.5 font-serif-zh text-[15px] leading-7 text-ink focus:outline-none"
                      />
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="rounded-full px-3 py-1.5 font-serif-zh text-[14px] italic leading-none text-ink-3 transition-colors active:bg-paper-2"
                          onClick={() => setEditingId(null)}
                        >
                          {t.cancel}
                        </button>
                        <button
                          type="button"
                          className="rounded-full bg-rose px-3.5 py-1.5 font-serif-zh text-[14px] italic leading-none text-white shadow-(--shadow-cta) transition-transform active:translate-y-px disabled:opacity-50"
                          onClick={() => submitEdit(message.id)}
                          disabled={!editDraft.trim()}
                        >
                          {t.chatResend}
                        </button>
                      </div>
                    </div>
                  )
                }
                return (
                  <div key={`${message.id}-${index}`} className="flex justify-end">
                    <button
                      type="button"
                      className="max-w-[85%] rounded-2xl bg-paper-2 px-3.5 py-2.5 text-left font-serif-zh text-[15px] leading-7 whitespace-pre-wrap text-ink transition-colors active:bg-paper-3/70"
                      onClick={() => startEditing(message.id, message.content)}
                    >
                      {message.content}
                    </button>
                  </div>
                )
              }

              const isLast = index === lastIndex
              const waiting = isLast && streaming && message.content.length === 0
              return (
                <div key={`${message.id}-${index}`}>
                  {waiting ? (
                    <SkeletonText lineClassName="h-4" lines={2} />
                  ) : (
                    <p className="font-serif-zh text-[16px] leading-7 whitespace-pre-wrap text-ink-2">
                      {message.content}
                    </p>
                  )}
                  {isLast && !streaming && message.content.length > 0 && (
                    <button
                      type="button"
                      className="mt-2.5 inline-flex items-center gap-1.5 font-serif-zh text-[13px] italic leading-none text-ink-3 transition-colors active:text-ink"
                      onClick={() => regenerate(index)}
                    >
                      <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
                      {t.chatRegenerate}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {error && (
          <p className="mt-5 rounded-md border border-rose/40 bg-rose-pale px-3 py-2 text-sm text-rose-deep">
            {error || t.chatFailed}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-end gap-2 border-t border-rose-line/80 px-3 pb-[calc(0.625rem+env(safe-area-inset-bottom))] pt-2.5">
        <textarea
          ref={composerRef}
          value={draft}
          onChange={event => setDraft(event.target.value)}
          placeholder={t.chatPlaceholder}
          rows={1}
          className="min-h-11 flex-1 resize-none rounded-2xl bg-paper-2 px-3.5 py-2.5 font-serif-zh text-[15px] leading-7 text-ink placeholder:text-ink-4 focus:outline-none"
        />
        {streaming ? (
          <button
            type="button"
            className="h-11 shrink-0 rounded-full border border-rose-line px-4 font-serif-zh text-[14px] italic leading-none text-ink-3 transition-transform active:translate-y-px"
            onClick={stop}
          >
            {t.chatStop}
          </button>
        ) : (
          <button
            type="button"
            className="h-11 shrink-0 rounded-full bg-rose px-4 font-serif-zh text-[14px] italic leading-none text-white shadow-(--shadow-cta) transition-transform active:translate-y-px disabled:opacity-50"
            onClick={submitDraft}
            disabled={!draft.trim()}
          >
            {t.chatSend}
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmClear}
        title={t.chatClearTitle}
        description={t.chatClearDescription}
        confirmLabel={t.chatClear}
        pendingLabel={t.deleting}
        isPending={isClearing}
        onConfirm={() => {
          clear()
          setConfirmClear(false)
        }}
        onClose={() => setConfirmClear(false)}
      />
    </div>
  )
}
