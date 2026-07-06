import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, FastForward, Pause, Play, Rewind } from 'lucide-react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import ConfirmDialog from '@/components/ConfirmDialog'
import Skeleton from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { useGeneration } from '@/hooks/useGeneration'
import { useUiText } from '@/i18n'
import { MODELS, useGenerationModel } from '@/preferences/generationModel'
import { useReadingFont } from '@/preferences/readingFont'
import { useReadingFontSize } from '@/preferences/readingFontSize'
import {
  READING_SPEED_MAX,
  READING_SPEED_MIN,
  setReadingSpeed,
  useReadingSpeed,
} from '@/preferences/readingSpeed'
import GenerateOutput from './components/GenerateOutput'
import { useGatedReveal } from './hooks/useGatedReveal'
import { useUnsavedExitGuard } from './hooks/useUnsavedExitGuard'
import { buildExpandPrefix } from './paragraphs'
import {
  PIECE_STRIP_LIMIT,
  parseVersionDraft,
  type OverwritePieceResponse,
  type PieceDetail,
  type PromptPiecesResponse,
  type SaveResponse,
} from '../shared/types'

const GENERATION_TEMPERATURE = 1
const USE_THINKING = false

// The generate/stream/edit/explore screen. Its own route — entered by navigating from
// the static prompt page — so generation state lives here, never on the prompt page.
// Saving creates (or overwrites) a piece and navigates back to the prompt page.
export default function GenerateScreen() {
  const { id, promptId } = useParams<{ id: string; promptId?: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const t = useUiText()
  const queryClient = useQueryClient()
  const toast = useToast()
  const model = useGenerationModel()
  const readingFont = useReadingFont()
  const readingFontSize = useReadingFontSize()

  const lockedMode = !!promptId
  const routeState = location.state as { prompt?: unknown; versionDraft?: unknown; similarToPromptId?: unknown; generated?: unknown } | null
  const versionDraft = parseVersionDraft(routeState?.versionDraft)
  const statePrompt = typeof routeState?.prompt === 'string' ? routeState.prompt : ''
  const versionSourcePromptId = !lockedMode ? versionDraft?.sourcePromptId ?? null : null
  // Ancestry seed from the "Similar prompts" page — only meaningful for a fresh prompt.
  const similarToPromptId = !lockedMode && typeof routeState?.similarToPromptId === 'number'
    ? routeState.similarToPromptId
    : null
  // A fresh prompt picked from AI ideas ("Spark ideas") — earns the "Generated" tag on save.
  const generated = !lockedMode && routeState?.generated === true

  const resumeParam = searchParams.get('resume')
  const resumePieceId = resumeParam ? Number(resumeParam) : null
  const resumeMode = resumePieceId !== null && Number.isFinite(resumePieceId)

  const backHref = lockedMode ? `/worlds/${id}/prompt/${promptId}` : `/worlds/${id}/prompt/new`
  // Returning to a fresh/version draft restores what the user typed (not the original
  // source text), so the draft page comes back exactly as they left it.
  const exitState = lockedMode
    ? undefined
    : {
        draftPrompt: statePrompt,
        versionDraft: versionDraft ? { ...versionDraft, promptText: statePrompt } : undefined,
        similarToPromptId,
        generated,
      }

  const {
    phase,
    output,
    error: generationError,
    errorDetail: generationErrorDetail,
    notice: generationNotice,
    provider,
    displayComplete,
    generate,
    expand,
    continueStory,
    regenerate,
    stop,
  } = useGeneration({ worldId: id })

  // Resume seeds the reader with an already-saved piece.
  const resumePieceQuery = useQuery({
    queryKey: ['piece', resumePieceId],
    queryFn: () => apiFetch(`/api/pieces/${resumePieceId}`) as Promise<PieceDetail>,
    enabled: resumeMode,
  })
  const resumePiece = resumePieceQuery.data ?? null

  // For an existing prompt the text comes off the URL; for a fresh/version draft the
  // prompt page hands it over in router state. Fall back to fetching when state is lost.
  const needPromptFetch = !resumeMode && !statePrompt && lockedMode
  const promptDetailQuery = useQuery({
    queryKey: ['prompt', id, promptId, 'generate', PIECE_STRIP_LIMIT],
    queryFn: () =>
      apiFetch(`/api/worlds/${id}/prompts/${encodeURIComponent(promptId!)}?limit=${PIECE_STRIP_LIMIT}`) as Promise<PromptPiecesResponse>,
    enabled: needPromptFetch,
  })
  // Resume carries no router state, so the prompt comes off the resumed piece itself —
  // without it, every continuation in resume mode would POST an empty prompt and 400.
  const promptText = statePrompt || resumePiece?.prompt || promptDetailQuery.data?.prompt.text || ''

  const startedRef = useRef(false)
  useEffect(() => {
    if (resumeMode || startedRef.current) return
    if (!promptText) {
      // Nothing to generate and nothing to wait for — bounce back to the prompt page.
      if (!needPromptFetch) navigate(backHref, { replace: true, state: exitState })
      return
    }
    startedRef.current = true
    generate({ prompt: promptText, model, temperature: GENERATION_TEMPERATURE, useThinking: USE_THINKING })
    // Reset the guard on cleanup so StrictMode's mount→unmount→mount in dev re-issues
    // the run instead of leaving the aborted first one stranded. runGeneration aborts
    // the prior controller and gates the stale run by generationId, so the replaced
    // run stays silent.
    return () => {
      startedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeMode, promptText, needPromptFetch])

  const [saving, setSaving] = useState(false)
  const readerUnsaved = output.length > 0 && !saving
  const { confirmOpen, confirmLeave, confirmStay } = useUnsavedExitGuard(readerUnsaved)

  async function saveNewPiece(text: string) {
    if (!id || !text || saving) return
    setSaving(true)
    try {
      const result = await apiFetch(`/api/worlds/${id}/pieces`, {
        method: 'POST',
        body: JSON.stringify({
          prompt: promptText,
          promptId: lockedMode && promptId ? Number(promptId) : undefined,
          versionSourcePromptId,
          similarToPromptId: similarToPromptId ?? undefined,
          generated: generated || undefined,
          body: text,
          model,
          provider: provider || undefined,
        }),
      }) as SaveResponse
      stop()
      queryClient.setQueryData(['piece', result.pieceId], {
        id: result.pieceId,
        body: text,
        model,
        provider: provider || null,
        created_at: Date.now(),
      })
      // Prepend the new piece to the cached list so the prompt page (which remounts on
      // the stale-while-revalidate cache) already shows it as the latest and selects it
      // by default, instead of sticking on the previously-latest piece until refetch.
      queryClient.setQueryData<PromptPiecesResponse>(
        ['prompt', id, String(result.promptId), 'generate', PIECE_STRIP_LIMIT],
        prev =>
          !prev || prev.pieces.some(p => p.id === result.pieceId)
            ? prev
            : {
                prompt: { ...prev.prompt, piece_count: result.pieceCount },
                pieces: [{ id: result.pieceId }, ...prev.pieces].slice(0, PIECE_STRIP_LIMIT),
              },
      )
      queryClient.invalidateQueries({ queryKey: ['prompt', id, String(result.promptId)] })
      queryClient.invalidateQueries({ queryKey: ['world', id] })
      queryClient.invalidateQueries({ queryKey: ['world-clusters', id] })
      queryClient.invalidateQueries({ queryKey: ['cluster', id] })
      navigate(`/worlds/${id}/prompt/${result.promptId}`, { replace: true })
    } catch (err) {
      setSaving(false)
      toast.show({
        kind: 'error',
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  async function saveResume(text: string) {
    if (resumePieceId === null || !id || !text.trim() || saving) return
    setSaving(true)
    stop()
    try {
      const result = await apiFetch(`/api/pieces/${resumePieceId}`, {
        method: 'PATCH',
        body: JSON.stringify({ body: text, model, provider: provider || undefined }),
      }) as OverwritePieceResponse
      queryClient.setQueryData(['piece', resumePieceId], {
        id: resumePieceId,
        body: result.body,
        model: result.model,
        provider: result.provider,
        created_at: result.created_at,
      })
      queryClient.invalidateQueries({ queryKey: ['piece', resumePieceId] })
      queryClient.invalidateQueries({ queryKey: ['prompt', id] })
      queryClient.invalidateQueries({ queryKey: ['world', id] })
      queryClient.invalidateQueries({ queryKey: ['world-clusters', id] })
      queryClient.invalidateQueries({ queryKey: ['cluster', id] })
      navigate(backHref, { replace: true })
    } catch (err) {
      setSaving(false)
      toast.show({
        kind: 'error',
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  function handleExit() {
    stop()
    navigate(backHref, { replace: true, state: exitState })
  }

  return (
    <>
      <GenerateReader
        output={output}
        phase={phase}
        displayComplete={displayComplete}
        provider={provider}
        modelLabel={MODELS.find(m => m.id === model)?.label ?? model}
        seedProvider={resumePiece?.provider ?? ''}
        seedModelLabel={
          resumePiece?.model ? MODELS.find(m => m.id === resumePiece.model)?.label ?? resumePiece.model : ''
        }
        error={generationError}
        errorDetail={generationErrorDetail}
        notice={generationNotice}
        readingFont={readingFont}
        readingFontSize={readingFontSize}
        mode={resumeMode ? 'resume' : 'generate'}
        initialText={resumeMode ? resumePiece?.body ?? '' : ''}
        onSave={saveNewPiece}
        onSaveOverwrite={saveResume}
        onExit={handleExit}
        onExpand={priorText => expand({ prompt: promptText, model, temperature: GENERATION_TEMPERATURE, useThinking: USE_THINKING, priorText })}
        onContinue={priorText => continueStory({ prompt: promptText, model, temperature: GENERATION_TEMPERATURE, useThinking: USE_THINKING, priorText })}
        onRegenerate={priorText => regenerate({ prompt: promptText, model, temperature: GENERATION_TEMPERATURE, useThinking: USE_THINKING, priorText })}
      />
      <ConfirmDialog
        open={confirmOpen}
        zClass="z-70"
        title={t.unsavedExitTitle}
        description={t.unsavedExitBody}
        confirmLabel={t.unsavedLeave}
        cancelLabel={t.unsavedStay}
        // Leaving via the back/swipe guard discards the unsaved read, so cancel any
        // still-running generation (the Discard button already does this via stop()).
        onConfirm={() => {
          stop()
          confirmLeave()
        }}
        onClose={confirmStay}
      />
    </>
  )
}

interface GenerateReaderProps {
  output: string
  phase: ReturnType<typeof useGeneration>['phase']
  displayComplete: boolean
  provider: string
  modelLabel: string
  // Saved provider/model of a resumed piece, shown until a fresh generation takes over.
  seedProvider: string
  seedModelLabel: string
  error: string
  errorDetail: ReturnType<typeof useGeneration>['errorDetail']
  notice: string
  readingFont: ReturnType<typeof useReadingFont>
  readingFontSize: ReturnType<typeof useReadingFontSize>
  mode: 'generate' | 'resume'
  initialText: string
  onSave: (text: string) => void
  onSaveOverwrite: (text: string) => void
  onExit: () => void
  onExpand: (priorText: string) => void
  onContinue: (priorText: string) => void
  onRegenerate: (priorText: string) => void
}

// The reading surface itself: paced reveal, pause/speed, paragraph-expand, save/exit.
// Ported from the former GenerateOverlay — same behavior, now a real screen.
function GenerateReader({
  output,
  phase,
  displayComplete,
  provider,
  modelLabel,
  seedProvider,
  seedModelLabel,
  error,
  errorDetail,
  notice,
  readingFont,
  readingFontSize,
  mode,
  initialText,
  onSave,
  onSaveOverwrite,
  onExit,
  onExpand,
  onContinue,
  onRegenerate,
}: GenerateReaderProps) {
  const t = useUiText()
  const scrollRef = useRef<HTMLDivElement>(null)
  // Auto-follow the stream only while the reader is sitting near the bottom. Scrolling up
  // to re-read an earlier paragraph flips this off so the reveal stops yanking them down;
  // scrolling back to the bottom re-arms it.
  const stickToBottomRef = useRef(true)
  const [paused, setPaused] = useState(false)
  const [frozenText, setFrozenText] = useState<string | null>(null)
  const [selectedParagraphIndex, setSelectedParagraphIndex] = useState<number | null>(null)
  const [revealEpoch, setRevealEpoch] = useState(0)
  const [baselineRevealed, setBaselineRevealed] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const showingSeed = mode === 'resume' && !expanded
  const readingSpeed = useReadingSpeed()
  const speedRatio = (readingSpeed - READING_SPEED_MIN) / (READING_SPEED_MAX - READING_SPEED_MIN)
  // The slower/faster buttons step in coarser jumps than the underlying snap step so the
  // full range is a few comfortable taps, not dozens.
  const SPEED_BUTTON_STEP = 5
  const slower = () => setReadingSpeed(Math.max(READING_SPEED_MIN, readingSpeed - SPEED_BUTTON_STEP))
  const faster = () => setReadingSpeed(Math.min(READING_SPEED_MAX, readingSpeed + SPEED_BUTTON_STEP))

  const { revealedText, revealComplete } = useGatedReveal({
    buffer: output,
    backendComplete: displayComplete,
    active: !showingSeed && !paused && !error && frozenText === null,
    unitsPerSecond: readingSpeed,
    revealEpoch,
    baselineRevealed,
  })
  const revealedTextRef = useRef('')
  revealedTextRef.current = revealedText

  useEffect(() => {
    if (revealComplete && frozenText === null) {
      setFrozenText(revealedTextRef.current)
    }
  }, [revealComplete, frozenText])

  const finished = showingSeed || frozenText !== null
  const displayText = showingSeed ? initialText : frozenText ?? revealedText
  const canPause = !showingSeed && !finished && !error
  const canContinue = finished && !error && displayText.length > 0
  const canSave = (paused || finished) && !error && displayText.length > 0 && (mode !== 'resume' || expanded)
  const canSelect = (paused || finished) && !error && displayText.length > 0

  useEffect(() => {
    if (!canSelect) setSelectedParagraphIndex(null)
  }, [canSelect])

  const handleExpand = (paragraphIndex: number) => {
    const priorText = buildExpandPrefix(displayText, paragraphIndex)
    setBaselineRevealed(priorText.length)
    setRevealEpoch(epoch => epoch + 1)
    setFrozenText(null)
    setPaused(false)
    setSelectedParagraphIndex(null)
    setExpanded(true)
    onExpand(priorText)
  }

  // Per-paragraph continue: keep everything through the tapped paragraph, drop all the
  // text below it, and regenerate from there. Uses the regenerate path (system + prompt +
  // kept text as an assistant prefill, no special instruction) so the model just picks
  // up the story from that cut point.
  const handleContinueFrom = (paragraphIndex: number) => {
    const priorText = buildExpandPrefix(displayText, paragraphIndex)
    setBaselineRevealed(priorText.length)
    setRevealEpoch(epoch => epoch + 1)
    setFrozenText(null)
    setPaused(false)
    setSelectedParagraphIndex(null)
    setExpanded(true)
    onRegenerate(priorText)
  }

  // Continue picks up from the full existing text (not a single paragraph) and resumes
  // the story toward the original prompt; new prose streams in as a fresh paragraph.
  const handleContinue = () => {
    const priorText = `${displayText.replace(/\s+$/, '')}\n\n`
    setBaselineRevealed(priorText.length)
    setRevealEpoch(epoch => epoch + 1)
    setFrozenText(null)
    setPaused(false)
    setSelectedParagraphIndex(null)
    setExpanded(true)
    onContinue(priorText)
  }

  const togglePause = () => {
    setPaused(p => !p)
  }

  useEffect(() => {
    if (paused || finished) return
    const el = scrollRef.current
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight
  }, [displayText, paused, finished])

  // A new run (expand/continue/regenerate, or the initial generation) re-arms auto-follow
  // so the fresh stream tracks again even if the reader had scrolled up.
  useEffect(() => {
    stickToBottomRef.current = true
  }, [revealEpoch])

  return createPortal(
    <div
      className="fixed inset-0 z-60 flex flex-col select-none bg-paper [-webkit-touch-callout:none]"
      role="dialog"
      aria-modal="true"
    >
      {/* Thin pinned meta bar: the model in play, and the resolved provider once it
          arrives. While a resumed piece's seed is on screen it shows that piece's saved
          model/provider; a fresh generation then takes over. */}
      <div className="flex shrink-0 items-center justify-center gap-2 border-b border-rose-line/70 bg-paper px-4 py-1.5 pt-[calc(0.375rem+env(safe-area-inset-top))] t-meta">
        {notice && !error ? (
          <span className="text-rose-deep">{notice}</span>
        ) : (
          <>
            <span className="text-ink-2">{showingSeed ? seedModelLabel || modelLabel : modelLabel}</span>
            {(showingSeed ? seedProvider : provider) ? (
              <>
                <span aria-hidden="true" className="text-ink-4">·</span>
                <span>{showingSeed ? seedProvider : provider}</span>
              </>
            ) : phase !== 'idle' ? (
              // Provider isn't resolved until the stream opens (notably after an
              // expand/continue, which restarts the OpenRouter session). Hold its slot
              // with a pulsing placeholder so the wait is visible.
              <>
                <span aria-hidden="true" className="text-ink-4">·</span>
                <Skeleton className="h-3 w-16" />
              </>
            ) : null}
          </>
        )}
      </div>

      <div
        ref={scrollRef}
        onScroll={() => {
          const el = scrollRef.current
          if (!el) return
          stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
        }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4"
      >
        {error ? (
          <div className="mx-auto mt-[30vh] max-w-md rounded-md border border-rose/40 bg-rose-pale px-3 py-2 text-center text-sm text-rose-deep">
            <p>{error}</p>
            {errorDetail && (
              <dl className="mt-2 space-y-0.5 text-left text-xs text-rose-deep/80">
                {errorDetail.status != null && (
                  <div className="flex gap-1.5">
                    <dt className="shrink-0 font-medium">Status</dt>
                    <dd className="break-words">{errorDetail.status}{errorDetail.errorType ? ` · ${errorDetail.errorType}` : ''}</dd>
                  </div>
                )}
                {errorDetail.providerName && (
                  <div className="flex gap-1.5">
                    <dt className="shrink-0 font-medium">Provider</dt>
                    <dd className="break-words">{errorDetail.providerName}</dd>
                  </div>
                )}
                {errorDetail.retryAfterSeconds != null && (
                  <div className="flex gap-1.5">
                    <dt className="shrink-0 font-medium">Retry after</dt>
                    <dd>{errorDetail.retryAfterSeconds}s</dd>
                  </div>
                )}
                {errorDetail.raw && (
                  <div className="flex gap-1.5">
                    <dt className="shrink-0 font-medium">Upstream</dt>
                    <dd className="break-words font-mono">{errorDetail.raw}</dd>
                  </div>
                )}
              </dl>
            )}
          </div>
        ) : (
          <GenerateOutput
            output={displayText}
            phase={phase}
            streaming={!finished}
            readingFont={readingFont}
            readingFontSize={readingFontSize}
            selectable={canSelect}
            selectedParagraphIndex={selectedParagraphIndex}
            onSelectParagraph={setSelectedParagraphIndex}
            renderParagraphAction={index => (
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => handleExpand(index)}
                  className="inline-flex h-8 items-center justify-center rounded-full bg-paper-2 px-3.5 font-serif-zh text-[13px] italic leading-none text-rose-deep transition-colors active:bg-paper-3"
                >
                  {t.expand}
                </button>
                <button
                  type="button"
                  onClick={() => handleContinueFrom(index)}
                  className="inline-flex h-8 items-center justify-center rounded-full bg-paper-2 px-3.5 font-serif-zh text-[13px] italic leading-none text-rose-deep transition-colors active:bg-paper-3"
                >
                  {t.continueWriting}
                </button>
              </div>
            )}
          />
        )}
      </div>

      {/* One control bar for everything: transport (or Continue) sits on the left for the
          thumb; the exit actions stay anchored on the right. */}
      <div className="shrink-0 border-t border-rose-line/70 bg-paper pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
        {/* Current reading speed as a thin fill bar, only while text is still revealing. */}
        {!error && canPause && (
          <div
            role="slider"
            aria-label={t.speed}
            aria-valuemin={READING_SPEED_MIN}
            aria-valuemax={READING_SPEED_MAX}
            aria-valuenow={readingSpeed}
            className="h-0.5 w-full bg-rose-line"
          >
            <div className="h-full bg-rose transition-[width]" style={{ width: `${speedRatio * 100}%` }} />
          </div>
        )}

        <div className="flex items-center justify-between px-4 py-3">
          {/* Left: speed steppers + pause while revealing, or Continue once finished. */}
          <div className="flex items-center gap-2">
            {!error && canContinue ? (
              // A finished read swaps the transport for Continue, which feeds the existing
              // text + prompt back for more story.
              <button
                type="button"
                aria-label={t.continueWriting}
                onClick={handleContinue}
                className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full pr-3 pl-2 font-serif-zh text-[14px] italic leading-none text-ink-3 transition-opacity active:text-ink active:opacity-70"
              >
                <ArrowRight aria-hidden="true" className="h-5 w-5" />
                {t.continueWriting}
              </button>
            ) : !error && canPause ? (
              <>
                <button
                  type="button"
                  aria-label={t.slower}
                  disabled={readingSpeed <= READING_SPEED_MIN}
                  onClick={slower}
                  className="inline-flex h-11 w-11 items-center justify-center text-ink-3 transition-opacity disabled:opacity-30 active:text-ink active:opacity-70"
                >
                  <Rewind aria-hidden="true" className="h-5 w-5 fill-current" />
                </button>
                <button
                  type="button"
                  aria-label={paused ? t.resume : t.pause}
                  onClick={togglePause}
                  className="inline-flex h-11 w-11 items-center justify-center text-ink-3 transition-opacity active:text-ink active:opacity-70"
                >
                  {paused
                    ? <Play aria-hidden="true" className="h-6 w-6 fill-current" />
                    : <Pause aria-hidden="true" className="h-6 w-6 fill-current" />}
                </button>
                <button
                  type="button"
                  aria-label={t.faster}
                  disabled={readingSpeed >= READING_SPEED_MAX}
                  onClick={faster}
                  className="inline-flex h-11 w-11 items-center justify-center text-ink-3 transition-opacity disabled:opacity-30 active:text-ink active:opacity-70"
                >
                  <FastForward aria-hidden="true" className="h-5 w-5 fill-current" />
                </button>
              </>
            ) : null}
          </div>

          {/* Right: discard and save & exit, always reachable. */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onExit}
              className="font-serif-zh text-[13px] italic leading-none text-ink-3 underline decoration-ink-4/50 underline-offset-4 transition-colors active:text-ink active:opacity-70"
            >
              {t.exitWithoutSaving}
            </button>
            <button
              type="button"
              disabled={!canSave}
              onClick={() => (mode === 'resume' ? onSaveOverwrite(displayText) : onSave(displayText))}
              className="inline-flex h-9 items-center justify-center rounded-full bg-rose px-4 font-serif-zh text-[14px] italic leading-none text-white transition-opacity disabled:opacity-30 active:opacity-80"
            >
              {t.saveAndExit}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
