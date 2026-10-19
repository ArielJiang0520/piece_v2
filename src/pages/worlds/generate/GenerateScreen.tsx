import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, Check, FastForward, Pause, Play, Rewind, SkipForward } from 'lucide-react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
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
import MarkerRail, { revealMarker } from '../shared/MarkerRail'
import { useGatedReveal } from './hooks/useGatedReveal'
import { useUnsavedExitGuard } from './hooks/useUnsavedExitGuard'
import { buildExpandPrefix, splitParagraphs } from './paragraphs'
import {
  STORY_STRIP_LIMIT,
  type StoryDetail,
  type SceneStoriesResponse,
  type SaveResponse,
} from '../shared/types'
import { fetchScene, sceneQueryKey } from '../scene/hooks/useGenerateData'
import {
  segmentStartOffsets,
  serializeStructure,
  type StoryAction,
  type StoryStructure,
} from '../shared/storyStructure'

const GENERATION_TEMPERATURE = 1
const USE_THINKING = false

// The generate/stream/edit/explore screen. Its own route — entered by navigating from
// the static scene page — so generation state lives here, never on the scene page.
// Saving creates (or overwrites) a story and navigates back to the scene page.
export default function GenerateScreen() {
  const { id, sceneId } = useParams<{ id: string; sceneId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const t = useUiText()
  const queryClient = useQueryClient()
  const toast = useToast()
  const model = useGenerationModel()
  const readingFont = useReadingFont()
  const readingFontSize = useReadingFontSize()

  const resumeParam = searchParams.get('resume')
  const resumeStoryId = resumeParam ? Number(resumeParam) : null
  const resumeMode = resumeStoryId !== null && Number.isFinite(resumeStoryId)
  // The paragraph the reader left off on (from the story view); the seed opens there.
  const resumeAtParam = searchParams.get('at')
  const resumeParagraphIndex =
    resumeMode && resumeAtParam !== null && Number.isFinite(Number(resumeAtParam))
      ? Number(resumeAtParam)
      : null

  const backHref = `/worlds/${id}/scenes/${sceneId}`

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

  // Resume seeds the reader with an already-saved story.
  const resumeStoryQuery = useQuery({
    queryKey: ['story', resumeStoryId],
    queryFn: () => apiFetch(`/api/stories/${resumeStoryId}`) as Promise<StoryDetail>,
    enabled: resumeMode,
  })
  const resumeStory = resumeStoryQuery.data ?? null

  // A fresh generation reads the scene text off the scene the URL names (usually already
  // cached by the scene page this was entered from).
  const needSceneFetch = !resumeMode
  const sceneDetailQuery = useQuery({
    queryKey: sceneQueryKey(id, sceneId),
    queryFn: () => fetchScene(id, sceneId),
    enabled: needSceneFetch,
  })
  // The server looks up the scene's instruction from its id: the reader never has it. An outdated
  // story can't be resumed (the scene page doesn't offer it, and the server refuses the save), so
  // a resume continues toward the instruction it was written from.
  const generationSceneId = resumeMode ? resumeStory?.scene_id ?? null : sceneDetailQuery.data?.scene.id ?? null
  const generationInput = { sceneId: generationSceneId ?? undefined, model, temperature: GENERATION_TEMPERATURE, useThinking: USE_THINKING }

  const startedRef = useRef(false)
  useEffect(() => {
    if (resumeMode || startedRef.current) return
    if (generationSceneId === null) {
      // Nothing to generate and nothing to wait for — bounce back to the scene page.
      if (!needSceneFetch) navigate(backHref, { replace: true })
      return
    }
    startedRef.current = true
    generate(generationInput)
    // Reset the guard on cleanup so StrictMode's mount→unmount→mount in dev re-issues
    // the run instead of leaving the aborted first one stranded. runGeneration aborts
    // the prior controller and gates the stale run by generationId, so the replaced
    // run stays silent.
    return () => {
      startedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeMode, generationSceneId, needSceneFetch])

  const [saving, setSaving] = useState(false)
  const readerUnsaved = output.length > 0 && !saving
  const { confirmOpen, confirmLeave, confirmStay } = useUnsavedExitGuard(readerUnsaved)

  async function saveNewStory(text: string, structure: StoryStructure) {
    if (!id || !text || saving) return
    setSaving(true)
    try {
      const result = await apiFetch(`/api/worlds/${id}/stories`, {
        method: 'POST',
        body: JSON.stringify({
          sceneId: Number(sceneId),
          body: text,
          structure: serializeStructure(structure),
          model,
          provider: provider || undefined,
        }),
      }) as SaveResponse
      stop()
      queryClient.setQueryData<StoryDetail>(['story', result.storyId], {
        id: result.storyId,
        scene_id: result.sceneId,
        outdated: false,
        body: text,
        structure,
        model,
        provider: provider || null,
        created_at: Date.now(),
        updated_at: Date.now(),
      })
      // Prepend the new story to the cached list so the scene page (which remounts on
      // the stale-while-revalidate cache) already shows it as the latest and selects it
      // by default, instead of sticking on the previously-latest story until refetch.
      queryClient.setQueryData<SceneStoriesResponse>(
        sceneQueryKey(id, result.sceneId),
        prev =>
          !prev || prev.stories.some(p => p.id === result.storyId)
            ? prev
            : {
              ...prev,
              scene: { ...prev.scene, story_count: prev.scene.story_count + 1 },
              stories: [{ id: result.storyId, created_at: Date.now(), updated_at: Date.now(), outdated: false }, ...prev.stories].slice(0, STORY_STRIP_LIMIT),
            },
      )
      queryClient.invalidateQueries({ queryKey: ['scene', id, String(result.sceneId)] })
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

  async function saveResume(text: string, structure: StoryStructure) {
    if (resumeStoryId === null || !id || !text.trim() || saving) return
    setSaving(true)
    stop()
    try {
      const result = await apiFetch(`/api/stories/${resumeStoryId}`, {
        method: 'PATCH',
        body: JSON.stringify({ body: text, structure: serializeStructure(structure), model, provider: provider || undefined }),
      }) as StoryDetail
      queryClient.setQueryData<StoryDetail>(['story', resumeStoryId], result)
      queryClient.invalidateQueries({ queryKey: ['scene', id] })
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
    navigate(backHref, { replace: true })
  }

  return (
    <>
      <GenerateReader
        output={output}
        phase={phase}
        displayComplete={displayComplete}
        provider={provider}
        modelLabel={MODELS.find(m => m.id === model)?.label ?? model}
        seedProvider={resumeStory?.provider ?? ''}
        seedModelLabel={
          resumeStory?.model ? MODELS.find(m => m.id === resumeStory.model)?.label ?? resumeStory.model : ''
        }
        error={generationError}
        errorDetail={generationErrorDetail}
        notice={generationNotice}
        readingFont={readingFont}
        readingFontSize={readingFontSize}
        mode={resumeMode ? 'resume' : 'generate'}
        initialText={resumeMode ? resumeStory?.body ?? '' : ''}
        initialStructure={resumeMode ? resumeStory?.structure ?? null : null}
        initialParagraphIndex={resumeParagraphIndex}
        onSave={saveNewStory}
        onSaveOverwrite={saveResume}
        onExit={handleExit}
        onExpand={(priorText, direction) => expand({ ...generationInput, priorText, direction })}
        onContinue={(priorText, direction) => continueStory({ ...generationInput, priorText, direction })}
        onRegenerate={(priorText, direction) => regenerate({ ...generationInput, priorText, direction })}
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

export interface GenerateReaderProps {
  output: string
  phase: ReturnType<typeof useGeneration>['phase']
  displayComplete: boolean
  provider: string
  modelLabel: string
  // Saved provider/model of a resumed story, shown until a fresh generation takes over.
  seedProvider: string
  seedModelLabel: string
  error: string
  errorDetail: ReturnType<typeof useGeneration>['errorDetail']
  notice: string
  readingFont: ReturnType<typeof useReadingFont>
  readingFontSize: ReturnType<typeof useReadingFontSize>
  mode: 'generate' | 'resume'
  initialText: string
  // Recorded action history of a resumed story (null for fresh generation or legacy stories).
  initialStructure: StoryStructure | null
  // Paragraph to open the resumed seed on, matching where the reader was on the story view.
  initialParagraphIndex: number | null
  // Absent on a creator center test run, which is never saved: the reader then offers only Done.
  onSave?: (text: string, structure: StoryStructure) => void
  onSaveOverwrite?: (text: string, structure: StoryStructure) => void
  onExit: () => void
  onExpand: (priorText: string, direction: string) => void
  onContinue: (priorText: string, direction: string) => void
  onRegenerate: (priorText: string, direction: string) => void
}

// The reading surface itself: paced reveal, pause/speed, paragraph-expand, save/exit.
// Ported from the former GenerateOverlay — same behavior, now a real screen. Also the creator center's
// test screen (CreatorTestScreen), which passes no save handlers.
export function GenerateReader({
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
  initialStructure,
  initialParagraphIndex,
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
  // The whole-story Continue's optional steer, typed in the field above the bottom bar.
  const [continueDirection, setContinueDirection] = useState('')
  const [continueFieldFocused, setContinueFieldFocused] = useState(false)
  // A field inside the docked paragraph controls (the expand/continue steer) is
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

  // The action history for the story being built. Each entry is where one action's output
  // begins (char offset in the final text) plus what it was. The origin ('fresh') segment
  // before the first offset is implicit. Seeded from a resumed story's structure; new
  // actions append, and acting mid-story drops the entries below the cut (replace-downstream).
  const [actionLog, setActionLog] = useState<{ offset: number; action: StoryAction; direction: string }[]>([])
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

  const recordAction = (offset: number, action: StoryAction, direction: string) => {
    setActionLog(log => [...log.filter(entry => entry.offset < offset), { offset, action, direction }])
  }

  // Slice the final text at the logged offsets into segments; the first slice is the origin.
  // `dropEmpty` (save path) discards empty later segments; the live render keeps them so a
  // just-fired action's marker shows immediately, before its first token streams in.
  const buildStructure = (finalText: string, dropEmpty = true): StoryStructure => {
    const boundaries = [0, ...actionLog.map(entry => entry.offset)]
    const segments = boundaries
      .map((start, i) => {
        const end = i + 1 < boundaries.length ? boundaries[i + 1] : finalText.length
        const meta = i === 0 ? { action: 'fresh' as StoryAction, direction: '' } : actionLog[i - 1]
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
  // Memoized on its only real inputs: a fresh array identity every render would re-slice the
  // whole text here and, worse, defeat GenerateOutput's own memo — which would then re-split
  // the story into paragraphs on every arriving SSE chunk, even while paused.
  const liveSegments = useMemo(
    () => buildStructure(displayText, false).segments,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [displayText, actionLog],
  )
  const canPause = !showingSeed && !finished && !error
  const canContinue = finished && !error && displayText.length > 0
  const canSave = (paused || finished) && !error && displayText.length > 0 && (mode !== 'resume' || expanded)
  const canSelect = (paused || finished) && !error && displayText.length > 0

  useEffect(() => {
    if (!canSelect) setSelectedParagraphIndex(null)
  }, [canSelect])

  // The paragraph the docked controls act on: the expand/continue seed. When one is selected,
  // the docked switch (Expand · Continue)
  // takes over the bar and the whole-story transport/Continue is hidden so there's never a
  // double set of controls.
  // Split once per laid-out text rather than on every render — while streaming this is the
  // whole story being re-split, and chunks re-render far faster than the text changes. Stays
  // gated on `canSelect` so a running reveal never pays for it at all.
  const displayParagraphs = useMemo(
    () => (canSelect ? splitParagraphs(displayText) : []),
    [canSelect, displayText],
  )
  const selectedParagraph =
    selectedParagraphIndex != null
      ? displayParagraphs.find(p => p.index === selectedParagraphIndex) ?? null
      : null
  const paragraphSelected = selectedParagraph !== null

  // The marker rail only appears once the read is paused/finished (so the markers are
  // rendered as tappable chips) and the story actually has boundaries to navigate.
  const railVisible = canSelect && liveSegments.length > 1
  const markerLabel = (action: StoryAction) =>
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
  const startAction = (priorText: string, action: StoryAction, direction: string) => {
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
  // system scene, same original scene, same continuation instruction — the only
  // difference is that the prior text is cut at this paragraph rather than the whole story.
  const handleContinueFrom = (paragraphIndex: number, direction: string) => {
    startAction(buildExpandPrefix(displayText, paragraphIndex), 'regenerate', direction)
  }

  // Continue picks up from the full existing text (not a single paragraph) and resumes
  // the story toward the original scene; new prose streams in as a fresh paragraph.
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

  // Open the resumed seed at the paragraph the reader left off on (carried from the story
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
      className="fixed inset-0 z-60 flex flex-col select-none bg-surface [-webkit-touch-callout:none]"
      role="dialog"
      aria-modal="true"
    >
      {/* Thin pinned meta bar: the model in play, and the resolved provider once it
          arrives. While a resumed story's seed is on screen it shows that story's saved
          model/provider; a fresh generation then takes over. */}
      <div className="t-meta flex shrink-0 items-center justify-center gap-2 border-b border-line bg-surface px-4 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))]">
        {notice && !error ? (
          <span className="text-rose-deep">{notice}</span>
        ) : (
          <>
            <span className="font-semibold text-ink-2">{showingSeed ? seedModelLabel || modelLabel : modelLabel}</span>
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
          <div className="error-box mx-auto mt-[30vh] max-w-md text-center">
            <p className="font-semibold">{error}</p>
            {errorDetail && (
              <dl className="mt-2 space-y-0.5 text-left text-xs opacity-85">
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
        className="shrink-0 border-t border-line bg-surface pb-[calc(0.5rem+env(safe-area-inset-bottom))] transition-transform"
        style={keyboardInset ? { transform: `translateY(-${keyboardInset}px)` } : undefined}
      >
        {/* A tapped paragraph swaps the whole-story transport for its own docked controls:
            a switch between Expand / Continue, each revealing its own steer field. */}
        {paragraphSelected && selectedParagraph && (
          <ParagraphActionDock
            key={selectedParagraph.index}
            onExpand={direction => handleExpand(selectedParagraph.index, direction)}
            onContinue={direction => handleContinueFrom(selectedParagraph.index, direction)}
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
            className="h-1 w-full bg-paper-3"
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
              className="input h-10 rounded-full bg-paper-2 px-4 text-[15px]"
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
                className="btn btn-secondary btn-sm"
              >
                <ArrowRight aria-hidden="true" />
                {t.continueWriting}
              </button>
            ) : !error && canPause ? (
              <>
                <button
                  type="button"
                  aria-label={t.slower}
                  disabled={readingSpeed <= READING_SPEED_MIN}
                  onClick={slower}
                  className="icon-btn bg-paper-2"
                >
                  <Rewind aria-hidden="true" className="h-4.5! w-4.5! fill-current" />
                </button>
                <button
                  type="button"
                  aria-label={paused ? t.resume : t.pause}
                  onClick={togglePause}
                  className="icon-btn h-12 w-12 bg-rose text-white active:bg-rose active:opacity-85"
                >
                  {paused
                    ? <Play aria-hidden="true" className="fill-current" />
                    : <Pause aria-hidden="true" className="fill-current" />}
                </button>
                <button
                  type="button"
                  aria-label={t.faster}
                  disabled={readingSpeed >= READING_SPEED_MAX}
                  onClick={faster}
                  className="icon-btn bg-paper-2"
                >
                  <FastForward aria-hidden="true" className="h-4.5! w-4.5! fill-current" />
                </button>
                {/* Dump the rest of the buffer on screen at once. The text arrives well ahead
                    of the paced reveal, so this only lights up once the stream itself is
                    done — until then there's no "rest" to show, just more of the same wait. */}
                <button
                  type="button"
                  aria-label={t.skipToEnd}
                  disabled={!displayComplete}
                  onClick={skipToEnd}
                  className="icon-btn bg-paper-2"
                >
                  <SkipForward aria-hidden="true" className="h-4.5! w-4.5! fill-current" />
                </button>
              </>
            ) : null}
          </div>

          {/* Right: discard and save & exit, always reachable. */}
          <div className="flex items-center gap-1.5">
            {onSave ? (
              <>
                <button
                  type="button"
                  onClick={onExit}
                  className="btn btn-ghost btn-sm px-2.5 text-ink-3"
                >
                  {t.exitWithoutSaving}
                </button>
                <button
                  type="button"
                  disabled={!canSave}
                  onClick={() => {
                    const structure = buildStructure(displayText)
                    if (mode === 'resume') onSaveOverwrite?.(displayText, structure)
                    else onSave(displayText, structure)
                  }}
                  className="btn btn-primary btn-sm"
                >
                  <Check aria-hidden="true" />
                  {t.saveAndExit}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onExit}
                className="btn btn-primary btn-sm"
              >
                {t.done}
              </button>
            )}
          </div>
        </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

// The docked controls for a tapped paragraph, sitting just above the bottom action row.
// A two-way switch (Expand · Continue) picks the intent; both are a steer field + send.
type DockTab = 'expand' | 'continue'

function ParagraphActionDock({
  onExpand,
  onContinue,
  onFieldFocusChange,
}: {
  onExpand: (direction: string) => void
  onContinue: (direction: string) => void
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
  ]

  return (
    // Focus of the steer field lifts the bar above the keyboard; blur only counts when focus
    // actually leaves the dock, not when it moves between the dock's own controls.
    <div
      className="px-4 pb-3 pt-3"
      onFocus={() => onFieldFocusChange(true)}
      onBlur={e => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onFieldFocusChange(false)
      }}
    >
      <div className="segmented">
        {pills.map(pill => (
          <button
            key={pill.key}
            type="button"
            aria-pressed={tab === pill.key}
            onClick={() => setTab(pill.key)}
          >
            {pill.label}
          </button>
        ))}
      </div>

      <div className="mt-2.5 flex items-center gap-2">
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
          className="input h-10 flex-1 rounded-full bg-paper-2 px-4 text-[15px]"
        />
        <button
          type="button"
          aria-label={tab === 'continue' ? t.continueWriting : t.expand}
          onClick={steer}
          className="icon-btn bg-rose text-white active:bg-rose active:opacity-85"
        >
          <ArrowRight aria-hidden="true" className="h-5! w-5!" />
        </button>
      </div>
    </div>
  )
}
