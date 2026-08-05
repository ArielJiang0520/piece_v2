import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, FastForward, Heart, Pause, Play, Rewind, SkipForward } from 'lucide-react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import ConfirmDialog from '@/components/ConfirmDialog'
import Skeleton from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { useGeneration } from '@/hooks/useGeneration'
import { useUiText } from '@/i18n'
import { MODELS, useGenerationModel } from '@/preferences/generationModel'
import { useTasteProfileEnabled } from '@/preferences/tasteProfileEnabled'
import { useReadingFont } from '@/preferences/readingFont'
import { useReadingFontSize } from '@/preferences/readingFontSize'
import {
  READING_SPEED_MAX,
  READING_SPEED_MIN,
  setReadingSpeed,
  useReadingSpeed,
} from '@/preferences/readingSpeed'
import GenerateOutput from './components/GenerateOutput'
import ParagraphLikePanel from '../taste/ParagraphLikePanel'
import MarkerRail, { revealMarker } from '../shared/MarkerRail'
import AdditionsIndicator from '../shared/AdditionsIndicator'
import { useWorldAdditions, type WorldAddition } from '../shared/useWorldAdditions'
import { useGatedReveal } from './hooks/useGatedReveal'
import { useUnsavedExitGuard } from './hooks/useUnsavedExitGuard'
import { buildExpandPrefix, buildLikeContext, splitParagraphs } from './paragraphs'
import {
  PIECE_STRIP_LIMIT,
  parseVersionDraft,
  type OverwritePieceResponse,
  type PieceDetail,
  type PromptPiecesResponse,
  type SaveResponse,
} from '../shared/types'
import {
  segmentStartOffsets,
  serializeStructure,
  type PieceAction,
  type PieceStructure,
} from '../shared/pieceStructure'

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
  const useTaste = useTasteProfileEnabled()
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
  // The paragraph the reader left off on (from the piece view); the seed opens there.
  const resumeAtParam = searchParams.get('at')
  const resumeParagraphIndex =
    resumeMode && resumeAtParam !== null && Number.isFinite(Number(resumeAtParam))
      ? Number(resumeAtParam)
      : null

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

  // A resumed piece keeps the additions it was written with; a fresh one takes whatever the
  // reader has switched on. Continuing a story must not change the world underneath it.
  const { activeIds, additions, ready: additionsReady } = useWorldAdditions(id)
  const additionIds = resumeMode ? resumePiece?.addition_ids ?? [] : activeIds

  const startedRef = useRef(false)
  useEffect(() => {
    if (resumeMode || startedRef.current) return
    // The active set is derived from the checked-out version, so starting before the world has
    // resolved would generate against the bare body and then save that as the piece's stamp.
    if (!additionsReady) return
    if (!promptText) {
      // Nothing to generate and nothing to wait for — bounce back to the prompt page.
      if (!needPromptFetch) navigate(backHref, { replace: true, state: exitState })
      return
    }
    startedRef.current = true
    generate({ prompt: promptText, model, temperature: GENERATION_TEMPERATURE, useThinking: USE_THINKING, useTaste, additionIds })
    // Reset the guard on cleanup so StrictMode's mount→unmount→mount in dev re-issues
    // the run instead of leaving the aborted first one stranded. runGeneration aborts
    // the prior controller and gates the stale run by generationId, so the replaced
    // run stays silent.
    return () => {
      startedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeMode, promptText, needPromptFetch, additionsReady])

  const [saving, setSaving] = useState(false)
  const readerUnsaved = output.length > 0 && !saving
  const { confirmOpen, confirmLeave, confirmStay } = useUnsavedExitGuard(readerUnsaved)

  async function saveNewPiece(text: string, structure: PieceStructure) {
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
          structure: serializeStructure(structure),
          model,
          provider: provider || undefined,
          useTaste,
          additionIds,
        }),
      }) as SaveResponse
      stop()
      queryClient.setQueryData(['piece', result.pieceId], {
        id: result.pieceId,
        body: text,
        structure,
        model,
        provider: provider || null,
        used_taste: result.usedTaste,
        addition_ids: additionIds,
        created_at: Date.now(),
        updated_at: Date.now(),
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
              pieces: [{ id: result.pieceId, created_at: Date.now(), updated_at: Date.now() }, ...prev.pieces].slice(0, PIECE_STRIP_LIMIT),
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

  async function saveResume(text: string, structure: PieceStructure) {
    if (resumePieceId === null || !id || !text.trim() || saving) return
    setSaving(true)
    stop()
    try {
      const result = await apiFetch(`/api/pieces/${resumePieceId}`, {
        method: 'PATCH',
        body: JSON.stringify({ body: text, structure: serializeStructure(structure), model, provider: provider || undefined, useTaste }),
      }) as OverwritePieceResponse
      queryClient.setQueryData(['piece', resumePieceId], {
        id: resumePieceId,
        body: result.body,
        structure: result.structure,
        model: result.model,
        provider: result.provider,
        used_taste: result.used_taste,
        // Never rewritten on a resume — the piece keeps the set it was born with, which is what
        // the PATCH leaves alone server-side.
        addition_ids: result.addition_ids,
        created_at: result.created_at,
        updated_at: result.updated_at,
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
        worldId={id}
        pieceId={resumeMode ? resumePieceId : null}
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
        initialStructure={resumeMode ? resumePiece?.structure ?? null : null}
        initialParagraphIndex={resumeParagraphIndex}
        additions={additions}
        additionIds={additionIds}
        onSave={saveNewPiece}
        onSaveOverwrite={saveResume}
        onExit={handleExit}
        onExpand={(priorText, direction) => expand({ prompt: promptText, model, temperature: GENERATION_TEMPERATURE, useThinking: USE_THINKING, useTaste, additionIds, priorText, direction })}
        onContinue={(priorText, direction) => continueStory({ prompt: promptText, model, temperature: GENERATION_TEMPERATURE, useThinking: USE_THINKING, useTaste, additionIds, priorText, direction })}
        onRegenerate={(priorText, direction) => regenerate({ prompt: promptText, model, temperature: GENERATION_TEMPERATURE, useThinking: USE_THINKING, useTaste, additionIds, priorText, direction })}
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
  // World route id and, when resuming a saved piece, its id — both used to record a
  // paragraph "like" (a fresh, unsaved generation likes against the world alone).
  worldId?: string
  pieceId: number | null
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
  // Recorded action history of a resumed piece (null for fresh generation or legacy pieces).
  initialStructure: PieceStructure | null
  // Paragraph to open the resumed seed on, matching where the reader was on the piece view.
  initialParagraphIndex: number | null
  // The world's additions, and the ones this run is writing with — the reader's switched-on set
  // for a fresh generation, the piece's own stamp when resuming.
  additions: WorldAddition[]
  additionIds: number[]
  onSave: (text: string, structure: PieceStructure) => void
  onSaveOverwrite: (text: string, structure: PieceStructure) => void
  onExit: () => void
  onExpand: (priorText: string, direction: string) => void
  onContinue: (priorText: string, direction: string) => void
  onRegenerate: (priorText: string, direction: string) => void
}

// The reading surface itself: paced reveal, pause/speed, paragraph-expand, save/exit.
// Ported from the former GenerateOverlay — same behavior, now a real screen.
function GenerateReader({
  output,
  worldId,
  pieceId,
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
  initialStructure,
  initialParagraphIndex,
  additions,
  additionIds,
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
  // Paragraphs liked this session (trimmed text). A like never needs a saved piece — it's
  // recorded against the world (and the resumed piece id when present) — so the reader can
  // mark loved paragraphs right here in the generate flow.
  const [likedSnippets, setLikedSnippets] = useState<Set<string>>(new Set())
  // The whole-story Continue's optional steer, typed in the field above the bottom bar.
  const [continueDirection, setContinueDirection] = useState('')
  const [continueFieldFocused, setContinueFieldFocused] = useState(false)
  // A field inside the docked paragraph controls (expand/continue steer or the like note) is
  // focused — folded together with the whole-story field to lift the bar above the keyboard.
  const [dockFieldFocused, setDockFieldFocused] = useState(false)
  const [revealEpoch, setRevealEpoch] = useState(0)
  const [baselineRevealed, setBaselineRevealed] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const showingSeed = mode === 'resume' && !expanded
  // Marker-rail bookkeeping: one tick per action boundary (measured from the laid-out
  // marker chips), plus the visible viewport as a fraction of the scroll content so the
  // reader sees where they are among the branch points.
  const [railTicks, setRailTicks] = useState<{ segmentIndex: number; label: string; fraction: number }[]>([])
  const [railView, setRailView] = useState({ top: 0, height: 1 })

  // The action history for the piece being built. Each entry is where one action's output
  // begins (char offset in the final text) plus what it was. The origin ('fresh') segment
  // before the first offset is implicit. Seeded from a resumed piece's structure; new
  // actions append, and acting mid-piece drops the entries below the cut (replace-downstream).
  const [actionLog, setActionLog] = useState<{ offset: number; action: PieceAction; direction: string }[]>([])
  useEffect(() => {
    if (!initialStructure) {
      setActionLog([])
      return
    }
    const offsets = segmentStartOffsets(initialStructure.segments)
    setActionLog(
      initialStructure.segments
        .slice(1)
        .map((seg, i) => ({ offset: offsets[i + 1], action: seg.action, direction: seg.direction })),
    )
  }, [initialStructure])

  const recordAction = (offset: number, action: PieceAction, direction: string) => {
    setActionLog(log => [...log.filter(entry => entry.offset < offset), { offset, action, direction }])
  }

  // Slice the final text at the logged offsets into segments; the first slice is the origin.
  // `dropEmpty` (save path) discards empty later segments; the live render keeps them so a
  // just-fired action's marker shows immediately, before its first token streams in.
  const buildStructure = (finalText: string, dropEmpty = true): PieceStructure => {
    const boundaries = [0, ...actionLog.map(entry => entry.offset)]
    const segments = boundaries
      .map((start, i) => {
        const end = i + 1 < boundaries.length ? boundaries[i + 1] : finalText.length
        const meta = i === 0 ? { action: 'fresh' as PieceAction, direction: '' } : actionLog[i - 1]
        return { action: meta.action, direction: meta.direction, text: finalText.slice(start, end) }
      })
      // Empty slices don't affect the concat, so dropping them keeps the invariant intact.
      .filter((seg, i) => i === 0 || !dropEmpty || seg.text.length > 0)
    return { v: 1, segments }
  }
  const readingSpeed = useReadingSpeed()
  const speedRatio = (readingSpeed - READING_SPEED_MIN) / (READING_SPEED_MAX - READING_SPEED_MIN)
  // The slower/faster buttons step in coarser jumps than the underlying snap step so the
  // full range is a few comfortable taps, not dozens.
  const SPEED_BUTTON_STEP = 2
  const slower = () => setReadingSpeed(Math.max(READING_SPEED_MIN, readingSpeed - SPEED_BUTTON_STEP))
  const faster = () => setReadingSpeed(Math.min(READING_SPEED_MAX, readingSpeed + SPEED_BUTTON_STEP))

  const { revealedText, revealComplete, skipToEnd } = useGatedReveal({
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
  // Live decomposition of what's on screen, so action markers render at each boundary in
  // real time (empty trailing segment kept so a just-fired action's marker appears at once).
  const liveSegments = buildStructure(displayText, false).segments
  const canPause = !showingSeed && !finished && !error
  const canContinue = finished && !error && displayText.length > 0
  const canSave = (paused || finished) && !error && displayText.length > 0 && (mode !== 'resume' || expanded)
  const canSelect = (paused || finished) && !error && displayText.length > 0

  useEffect(() => {
    if (!canSelect) setSelectedParagraphIndex(null)
  }, [canSelect])

  // The paragraph the docked controls act on: its text is the like snippet and the
  // expand/continue seed. When one is selected, the docked switch (Expand · Continue · Like)
  // takes over the bar and the whole-story transport/Continue is hidden so there's never a
  // double set of controls.
  const selectedParagraph =
    canSelect && selectedParagraphIndex != null
      ? splitParagraphs(displayText).find(p => p.index === selectedParagraphIndex) ?? null
      : null
  const paragraphSelected = selectedParagraph !== null

  // The marker rail only appears once the read is paused/finished (so the markers are
  // rendered as tappable chips) and the piece actually has boundaries to navigate.
  const railVisible = canSelect && liveSegments.length > 1
  const markerLabel = (action: PieceAction) =>
    action === 'expand' ? t.markerExpanded : action === 'regenerate' ? t.markerContinuedFrom : t.markerContinued

  // Measure each marker chip's position within the scroll content into a tick fraction.
  // Runs synchronously after layout (before paint) whenever the rail is shown or the laid-out
  // text/size changes, so ticks are placed against the real rendered positions, not char
  // offsets (which drift from vertical position on uneven paragraphs).
  useLayoutEffect(() => {
    const sc = scrollRef.current
    if (!railVisible || !sc) {
      setRailTicks([])
      return
    }
    const measure = () => {
      const total = sc.scrollHeight || 1
      const scTop = sc.getBoundingClientRect().top
      const els = Array.from(sc.querySelectorAll<HTMLElement>('[data-marker-index]'))
      setRailTicks(
        els.map(el => {
          const segmentIndex = Number(el.dataset.markerIndex)
          const top = el.getBoundingClientRect().top - scTop + sc.scrollTop
          return {
            segmentIndex,
            label: markerLabel(liveSegments[segmentIndex]?.action ?? 'continue'),
            fraction: Math.min(1, Math.max(0, top / total)),
          }
        }),
      )
      setRailView({ top: sc.scrollTop / total, height: Math.min(1, sc.clientHeight / total) })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [railVisible, displayText, readingFontSize, readingFont])

  // Tapping a tick glides that marker to the middle of the reader and gives it a brief rose
  // outline — navigation only; the chip keeps its own tap for re-running the action.
  const jumpToMarker = (segmentIndex: number) => {
    const sc = scrollRef.current
    const el = sc?.querySelector<HTMLElement>(`[data-marker-index="${segmentIndex}"]`)
    if (el) revealMarker(el)
  }

  // Shared reveal/seed bookkeeping for every story action: reset the paced reveal to treat
  // `priorText` as already-read, record the action in the history, then fire it.
  const startAction = (priorText: string, action: PieceAction, direction: string) => {
    setBaselineRevealed(priorText.length)
    setRevealEpoch(epoch => epoch + 1)
    setFrozenText(null)
    setPaused(false)
    setSelectedParagraphIndex(null)
    setExpanded(true)
    recordAction(priorText.length, action, direction)
    if (action === 'expand') onExpand(priorText, direction)
    else if (action === 'regenerate') onRegenerate(priorText, direction)
    else onContinue(priorText, direction)
  }

  const handleExpand = (paragraphIndex: number, direction: string) => {
    startAction(buildExpandPrefix(displayText, paragraphIndex), 'expand', direction)
  }

  // Per-paragraph continue: keep everything through the tapped paragraph, drop all the
  // text below it, and regenerate from there. Identical to Continue on the server — same
  // system prompt, same original prompt, same continuation instruction — the only
  // difference is that the prior text is cut at this paragraph rather than the whole story.
  const handleContinueFrom = (paragraphIndex: number, direction: string) => {
    startAction(buildExpandPrefix(displayText, paragraphIndex), 'regenerate', direction)
  }

  // Continue picks up from the full existing text (not a single paragraph) and resumes
  // the story toward the original prompt; new prose streams in as a fresh paragraph.
  const handleContinue = (direction: string) => {
    setContinueDirection('')
    startAction(`${displayText.replace(/\s+$/, '')}\n\n`, 'continue', direction)
  }

  // Tapping a boundary marker re-runs that action: seed from the segments before it and fire
  // the same action + direction again, replacing everything downstream.
  const rerunSegment = (segmentIndex: number) => {
    if (segmentIndex < 1 || segmentIndex >= liveSegments.length) return
    const priorText = liveSegments.slice(0, segmentIndex).map(seg => seg.text).join('')
    const seg = liveSegments[segmentIndex]
    startAction(priorText, seg.action, seg.direction)
  }

  const togglePause = () => {
    setPaused(p => !p)
  }

  // The bottom control bar sits at the bottom of a full-screen fixed reader, so the
  // on-screen keyboard would cover the whole-story direction field. While it's focused,
  // lift the bar by the keyboard's height (tracked via the VisualViewport API). The
  // per-paragraph fields live inside the scroll region and don't need this.
  const [keyboardInset, setKeyboardInset] = useState(0)
  const keyboardFieldOpen = continueFieldFocused || dockFieldFocused
  useEffect(() => {
    const vv = window.visualViewport
    if (!keyboardFieldOpen || !vv) {
      setKeyboardInset(0)
      return
    }
    const update = () => setKeyboardInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop))
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [keyboardFieldOpen])

  // Open the resumed seed at the paragraph the reader left off on (carried from the piece
  // view), placed before paint so there's no visible jump from the top. Runs once, only
  // while the seed is showing; the moment the reader acts (expands/continues) it stops
  // applying. `initialText` is a dep because the resumed body arrives async.
  const didSeedScrollRef = useRef(false)
  useLayoutEffect(() => {
    if (didSeedScrollRef.current || initialParagraphIndex == null) return
    if (mode !== 'resume' || !showingSeed) return
    const sc = scrollRef.current
    if (!sc || !initialText) return
    const el = sc.querySelector<HTMLElement>(`[data-paragraph-index="${initialParagraphIndex}"]`)
    if (!el) return
    const top = el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop
    sc.scrollTop = Math.max(0, top - 8)
    didSeedScrollRef.current = true
  }, [initialParagraphIndex, showingSeed, mode, initialText])

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

      {/* What the world carries for this run. On a resume these are the piece's own additions,
          not whatever is switched on now, so the line matches the story being continued. */}
      <AdditionsIndicator additions={additions} activeIds={additionIds} className="shrink-0" />

      <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={() => {
          const el = scrollRef.current
          if (!el) return
          stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
          if (railVisible) {
            const total = el.scrollHeight || 1
            setRailView({ top: el.scrollTop / total, height: Math.min(1, el.clientHeight / total) })
          }
        }}
        className="h-full overflow-y-auto overscroll-contain px-4 pt-4"
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
            segments={liveSegments}
            onRerunSegment={rerunSegment}
            phase={phase}
            streaming={!finished}
            readingFont={readingFont}
            readingFontSize={readingFontSize}
            selectable={canSelect}
            selectedParagraphIndex={selectedParagraphIndex}
            onSelectParagraph={setSelectedParagraphIndex}
            likedSnippets={likedSnippets}
          />
        )}
      </div>
        {railVisible && railTicks.length > 0 && (
          <MarkerRail ticks={railTicks} view={railView} onJump={jumpToMarker} />
        )}
      </div>

      {/* One control bar for everything: transport (or Continue) sits on the left for the
          thumb; the exit actions stay anchored on the right. */}
      <div
        className="shrink-0 border-t border-rose-line/70 bg-paper pb-[calc(0.5rem+env(safe-area-inset-bottom))] transition-transform"
        style={keyboardInset ? { transform: `translateY(-${keyboardInset}px)` } : undefined}
      >
        {/* A tapped paragraph swaps the whole-story transport for its own docked controls:
            a switch between Expand / Continue / Like, each revealing just its own inputs. */}
        {paragraphSelected && selectedParagraph && (
          <ParagraphActionDock
            key={selectedParagraph.index}
            worldId={worldId}
            pieceId={pieceId}
            snippet={selectedParagraph.text}
            context={buildLikeContext(displayText, selectedParagraph.index)}
            liked={likedSnippets.has(selectedParagraph.text.trim())}
            onExpand={direction => handleExpand(selectedParagraph.index, direction)}
            onContinue={direction => handleContinueFrom(selectedParagraph.index, direction)}
            onLiked={snippet => {
              setLikedSnippets(prev => new Set(prev).add(snippet.trim()))
              setSelectedParagraphIndex(null)
            }}
            onClose={() => setSelectedParagraphIndex(null)}
            onFieldFocusChange={setDockFieldFocused}
          />
        )}

        {/* Current reading speed as a thin fill bar, only while text is still revealing. */}
        {!error && canPause && !paragraphSelected && (
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

        {/* Whole-story Continue with an optional steer: the field sits above the button, so
            the reader can type a direction (or not) before continuing from the full text. */}
        {!error && canContinue && !paragraphSelected && (
          <div className="px-4 pt-3">
            <input
              value={continueDirection}
              onChange={e => setContinueDirection(e.target.value)}
              onFocus={() => setContinueFieldFocused(true)}
              onBlur={() => setContinueFieldFocused(false)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleContinue(continueDirection.trim())
                }
              }}
              placeholder={t.directionPlaceholder}
              enterKeyHint="send"
              className="h-9 w-full rounded-full bg-paper-2 px-4 font-serif-zh text-[13px] italic leading-none text-ink placeholder:text-ink-4 focus:outline-none"
            />
          </div>
        )}

        {/* The whole-story action row (transport/Continue + discard/save) is replaced
            entirely while a paragraph is selected — its docked controls own the bar, so
            there's never a second control bar beneath them. */}
        {!paragraphSelected && (
        <div className="flex items-center justify-between px-4 py-3">
          {/* Left: speed steppers + pause while revealing, or Continue once finished. */}
          <div className="flex items-center gap-2">
            {!error && canContinue ? (
              // A finished read swaps the transport for Continue, which feeds the existing
              // text (plus any typed direction) back for more story.
              <button
                type="button"
                aria-label={t.continueWriting}
                onClick={() => handleContinue(continueDirection.trim())}
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
                {/* Dump the rest of the buffer on screen at once. The text arrives well ahead
                    of the paced reveal, so this only lights up once the stream itself is
                    done — until then there's no "rest" to show, just more of the same wait. */}
                <button
                  type="button"
                  aria-label={t.skipToEnd}
                  disabled={!displayComplete}
                  onClick={skipToEnd}
                  className="inline-flex h-11 w-11 items-center justify-center text-ink-3 transition-opacity disabled:opacity-30 active:text-ink active:opacity-70"
                >
                  <SkipForward aria-hidden="true" className="h-5 w-5 fill-current" />
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
              onClick={() => {
                const structure = buildStructure(displayText)
                if (mode === 'resume') onSaveOverwrite(displayText, structure)
                else onSave(displayText, structure)
              }}
              className="inline-flex h-9 items-center justify-center rounded-full bg-rose px-4 font-serif-zh text-[14px] italic leading-none text-white transition-opacity disabled:opacity-30 active:opacity-80"
            >
              {t.saveAndExit}
            </button>
          </div>
        </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

// The docked controls for a tapped paragraph, sitting just above the bottom action row.
// A three-way switch (Expand · Continue · Like) reveals only the chosen intent's controls:
// Expand/Continue are a steer field + send; Like is the full reason panel. Steer and react
// stay one tap apart without crowding the surface — the resting state is just three pills.
type DockTab = 'expand' | 'continue' | 'like'

function ParagraphActionDock({
  worldId,
  pieceId,
  snippet,
  context,
  liked,
  onExpand,
  onContinue,
  onLiked,
  onClose,
  onFieldFocusChange,
}: {
  worldId?: string
  pieceId: number | null
  snippet: string
  context: string
  liked: boolean
  onExpand: (direction: string) => void
  onContinue: (direction: string) => void
  onLiked: (snippet: string) => void
  onClose: () => void
  onFieldFocusChange: (focused: boolean) => void
}) {
  const t = useUiText()
  const [tab, setTab] = useState<DockTab>('expand')
  const [direction, setDirection] = useState('')

  const steer = () => {
    const value = direction.trim()
    if (tab === 'continue') onContinue(value)
    else onExpand(value)
    setDirection('')
  }

  const pills: { key: DockTab; label: string }[] = [
    { key: 'expand', label: t.expand },
    { key: 'continue', label: t.continueWriting },
    { key: 'like', label: t.tasteLike },
  ]

  return (
    // Focus of any descendant field (steer input or the like note) lifts the bar above the
    // keyboard; blur only counts when focus actually leaves the dock, not when it moves
    // between the dock's own controls.
    <div
      className="px-4 pb-3 pt-3"
      onFocus={() => onFieldFocusChange(true)}
      onBlur={e => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onFieldFocusChange(false)
      }}
    >
      <div className="flex gap-1.5">
        {pills.map(pill => {
          const on = tab === pill.key
          return (
            <button
              key={pill.key}
              type="button"
              aria-pressed={on}
              onClick={() => setTab(pill.key)}
              className={`inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 font-serif-zh text-[13px] italic leading-none transition-colors ${on ? 'bg-rose-pale text-rose-deep' : 'bg-paper-2 text-ink-3 active:bg-paper-3'}`}
            >
              {pill.key === 'like' && <Heart aria-hidden="true" className={`h-3 w-3 ${liked ? 'fill-current' : ''}`} />}
              {pill.label}
            </button>
          )
        })}
      </div>

      {tab === 'like' ? (
        liked ? (
          <div className="mt-2 flex items-center gap-1.5 px-1 py-3 text-ink-3">
            <Heart aria-hidden="true" className="h-3.5 w-3.5 fill-current" />
            <span className="t-meta">{t.tasteYouLiked}</span>
          </div>
        ) : (
          <ParagraphLikePanel
            worldId={worldId ?? ''}
            pieceId={pieceId}
            snippet={snippet}
            context={context}
            onLiked={onLiked}
            onClose={onClose}
          />
        )
      ) : (
        <div className="mt-2 flex items-center gap-2">
          <input
            value={direction}
            onChange={e => setDirection(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                steer()
              }
            }}
            placeholder={t.directionPlaceholder}
            enterKeyHint="send"
            className="h-9 flex-1 rounded-full bg-paper-2 px-4 font-serif-zh text-[13px] italic leading-none text-ink placeholder:text-ink-4 focus:outline-none"
          />
          <button
            type="button"
            aria-label={tab === 'continue' ? t.continueWriting : t.expand}
            onClick={steer}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose text-white transition-opacity active:opacity-80"
          >
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}
