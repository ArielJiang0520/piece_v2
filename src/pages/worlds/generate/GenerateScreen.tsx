import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, FastForward, Pause, Play } from 'lucide-react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import ConfirmDialog from '@/components/ConfirmDialog'
import { useToast } from '@/components/Toast'
import { useGeneration } from '@/hooks/useGeneration'
import { useUiText } from '@/i18n'
import { useGenerationModel } from '@/preferences/generationModel'
import { useReadingFont } from '@/preferences/readingFont'
import { useReadingFontSize } from '@/preferences/readingFontSize'
import {
  READING_SPEED_BY_ID,
  READING_SPEED_OPTIONS,
  setReadingSpeed,
  useReadingSpeed,
} from '@/preferences/readingSpeed'
import GenerateOutput from './components/GenerateOutput'
import { useGatedReveal } from './hooks/useGatedReveal'
import { useUnsavedExitGuard } from './hooks/useUnsavedExitGuard'
import { buildExpandPrefix, buildFastForwardPrefix } from './paragraphs'
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
  const routeState = location.state as { prompt?: unknown; versionDraft?: unknown } | null
  const versionDraft = parseVersionDraft(routeState?.versionDraft)
  const statePrompt = typeof routeState?.prompt === 'string' ? routeState.prompt : ''
  const versionSourcePromptId = !lockedMode ? versionDraft?.sourcePromptId ?? null : null

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
      }

  const {
    phase,
    output,
    error: generationError,
    provider,
    generationId,
    displayComplete,
    generate,
    expand,
    continueStory,
    fastForward,
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
  const promptText = statePrompt || promptDetailQuery.data?.prompt.text || ''

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
          body: text,
          model,
          provider: provider || undefined,
          generationId,
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
        error={generationError}
        readingFont={readingFont}
        readingFontSize={readingFontSize}
        mode={resumeMode ? 'resume' : 'generate'}
        initialText={resumeMode ? resumePiece?.body ?? '' : ''}
        onSave={saveNewPiece}
        onSaveOverwrite={saveResume}
        onExit={handleExit}
        onExpand={priorText => expand({ prompt: promptText, model, temperature: GENERATION_TEMPERATURE, useThinking: USE_THINKING, priorText })}
        onContinue={priorText => continueStory({ prompt: promptText, model, temperature: GENERATION_TEMPERATURE, useThinking: USE_THINKING, priorText })}
        onFastForward={priorText => fastForward({ prompt: promptText, model, temperature: GENERATION_TEMPERATURE, useThinking: USE_THINKING, priorText })}
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
  error: string
  readingFont: ReturnType<typeof useReadingFont>
  readingFontSize: ReturnType<typeof useReadingFontSize>
  mode: 'generate' | 'resume'
  initialText: string
  onSave: (text: string) => void
  onSaveOverwrite: (text: string) => void
  onExit: () => void
  onExpand: (priorText: string) => void
  onContinue: (priorText: string) => void
  onFastForward: (priorText: string) => void
}

// The reading surface itself: paced reveal, pause/speed, paragraph-expand, save/exit.
// Ported from the former GenerateOverlay — same behavior, now a real screen.
function GenerateReader({
  output,
  phase,
  displayComplete,
  provider,
  error,
  readingFont,
  readingFontSize,
  mode,
  initialText,
  onSave,
  onSaveOverwrite,
  onExit,
  onExpand,
  onContinue,
  onFastForward,
}: GenerateReaderProps) {
  const t = useUiText()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [paused, setPaused] = useState(false)
  const [frozenText, setFrozenText] = useState<string | null>(null)
  const [selectedParagraphIndex, setSelectedParagraphIndex] = useState<number | null>(null)
  const [revealEpoch, setRevealEpoch] = useState(0)
  const [baselineRevealed, setBaselineRevealed] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const showingSeed = mode === 'resume' && !expanded
  const readingSpeed = useReadingSpeed()
  const speedOption = READING_SPEED_BY_ID[readingSpeed]

  const cycleSpeed = () => {
    const index = READING_SPEED_OPTIONS.findIndex(o => o.id === readingSpeed)
    const next = READING_SPEED_OPTIONS[(index + 1) % READING_SPEED_OPTIONS.length]
    setReadingSpeed(next.id)
  }

  const { revealedText, revealComplete } = useGatedReveal({
    buffer: output,
    backendComplete: displayComplete,
    active: !showingSeed && !paused && !error && frozenText === null,
    unitsPerSecond: speedOption.unitsPerSecond,
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

  // Fast-forward is available whenever something is streaming (initial run, expansion,
  // or continuation) and the reveal is paused: keep the current paragraph, drop the
  // rest of the buffered text, and have the model skip to the next beat.
  const canFastForward = paused && !finished && !error && displayText.length > 0
  const handleFastForward = () => {
    const priorText = buildFastForwardPrefix(output, displayText.length)
    if (!priorText.trim()) return
    setBaselineRevealed(priorText.length)
    setRevealEpoch(epoch => epoch + 1)
    setFrozenText(null)
    setPaused(false)
    setSelectedParagraphIndex(null)
    setExpanded(true)
    onFastForward(priorText)
  }

  useEffect(() => {
    if (paused || finished) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [displayText, paused, finished])

  return createPortal(
    <div
      className="fixed inset-0 z-60 flex flex-col select-none bg-paper [-webkit-touch-callout:none]"
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-6"
      >
        {error ? (
          <p className="mx-auto mt-[30vh] max-w-md rounded-md border border-rose/40 bg-rose-pale px-3 py-2 text-center text-sm text-rose-deep">
            {error}
          </p>
        ) : (
          <GenerateOutput
            output={displayText}
            phase={phase}
            streaming={!finished}
            provider={provider}
            readingFont={readingFont}
            readingFontSize={readingFontSize}
            selectable={canSelect}
            selectedParagraphIndex={selectedParagraphIndex}
            onSelectParagraph={setSelectedParagraphIndex}
            renderParagraphAction={index => (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => handleExpand(index)}
                  className="inline-flex h-8 items-center justify-center rounded-full bg-rose px-3.5 font-serif-zh text-[13px] italic leading-none text-white transition-opacity active:opacity-80"
                >
                  {t.expand}
                </button>
              </div>
            )}
          />
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-rose-line/70 bg-paper px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        {canContinue ? (
          // A finished read keeps the left slot live: the pause control gives way to
          // Continue, which feeds the existing text + prompt back for more story.
          <button
            type="button"
            aria-label={t.continueWriting}
            onClick={handleContinue}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full pr-3 pl-2 font-serif-zh text-[14px] italic leading-none text-ink-3 transition-opacity active:text-ink active:opacity-70"
          >
            <ArrowRight aria-hidden="true" className="h-5 w-5" />
            {t.continueWriting}
          </button>
        ) : (
          <div className={`flex items-center gap-1 ${canPause ? '' : 'pointer-events-none invisible'}`}>
            <button
              type="button"
              aria-label={paused ? t.resume : t.pause}
              onClick={() => setPaused(p => !p)}
              className="inline-flex h-10 w-10 items-center justify-center text-ink-3 transition-opacity active:text-ink active:opacity-70"
            >
              {paused
                ? <Play aria-hidden="true" className="h-5 w-5 fill-current" />
                : <Pause aria-hidden="true" className="h-5 w-5 fill-current" />}
            </button>
            <button
              type="button"
              aria-label={t.fastForward}
              disabled={!canFastForward}
              onClick={handleFastForward}
              className="inline-flex h-10 w-10 items-center justify-center text-ink-3 transition-opacity active:text-ink active:opacity-70 disabled:opacity-30 disabled:active:text-ink-3 disabled:active:opacity-30"
            >
              <FastForward aria-hidden="true" className="h-5 w-5 fill-current" />
            </button>
            <button
              type="button"
              aria-label={`${t.speed}: ${speedOption.label}`}
              onClick={cycleSpeed}
              className="inline-flex h-8 min-w-9 items-center justify-center rounded-full px-2 font-serif-zh text-[14px] italic leading-none text-ink-3 transition-colors active:text-ink active:opacity-70"
            >
              {speedOption.label}
            </button>
          </div>
        )}

        <div className="flex items-center gap-4">
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
    </div>,
    document.body,
  )
}
