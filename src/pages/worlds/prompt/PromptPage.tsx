import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, ChevronDown, Trash2 } from 'lucide-react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import ConfirmDialog from '@/components/ConfirmDialog'
import CountIndicator from '@/components/CountIndicator'
import { useTopNavConfig } from '@/components/topNavConfig'
import { entityLabel, formatEntityCount } from '@/config'
import { useUiText } from '@/i18n'
import { setGenerationModel, useGenerationModel } from '@/preferences/generationModel'
import { useLanguageId } from '@/preferences/language'
import { relativeTime } from '@/utils/time'
import { useReadingFont } from '@/preferences/readingFont'
import { useReadingFontSize } from '@/preferences/readingFontSize'
import PromptCard from './components/PromptCard'
import PieceStrip from './components/PieceStrip'
import PieceView from './components/PieceView'
import GenerateControls from './components/GenerateControls'
import GenerateVersionsPanel from './components/VersionsPanel'
import MoreLikeThisPanel from './components/MoreLikeThisPanel'
import ReworkSheet from './components/ReworkSheet'
import { useGenerateData } from './hooks/useGenerateData'
import { useSavedPiece } from './hooks/useSavedPiece'
import { parseVersionDraft, type ClusterPrompt } from '../shared/types'

const headerTextActionClass =
  'inline-flex h-8 shrink-0 items-center justify-center px-1 font-serif-zh text-[14px] italic leading-none text-ink-3 underline decoration-ink-4/50 underline-offset-4 transition-colors duration-200 hover:text-ink hover:decoration-ink-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-4/30 focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:pointer-events-none disabled:opacity-50'

type GenerateTab = 'prompt' | 'similar'

// The static prompt page: shows a prompt (or a new/version draft), its saved pieces, and
// the controls to start generating. Generating or resuming navigates to the separate
// generate screen — this page never streams or holds unsaved output.
export default function PromptPage() {
  const language = useLanguageId()
  const t = useUiText()
  const { id, promptId } = useParams<{ id: string; promptId?: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const lockedMode = !!promptId
  const routeState = location.state as { draftPrompt?: unknown; versionDraft?: unknown; similarToPromptId?: unknown; generated?: unknown } | null
  const versionDraft = parseVersionDraft(routeState?.versionDraft)
  const draftPrompt = versionDraft?.promptText ?? (typeof routeState?.draftPrompt === 'string' ? routeState.draftPrompt : '')
  // Carried forward from the "Similar prompts" page so ancestry is recorded when this fresh
  // prompt is first saved. Only meaningful for a fresh draft (not a locked/existing prompt).
  const similarToPromptId = !lockedMode && typeof routeState?.similarToPromptId === 'number'
    ? routeState.similarToPromptId
    : null
  // A fresh prompt picked from AI ideas ("Spark ideas") — carried through so it earns the
  // "Generated" tag when saved. Only meaningful for a fresh draft.
  const generated = !lockedMode && routeState?.generated === true
  const versionSourceClusterId = !lockedMode ? versionDraft?.sourceClusterId ?? null : null
  const [activeTab, setActiveTab] = useState<GenerateTab>('prompt')
  const [versionsOpen, setVersionsOpen] = useState(false)
  const [inspiredOpen, setInspiredOpen] = useState(false)
  const [showVersionDiff, setShowVersionDiff] = useState(false)
  const [reworkOpen, setReworkOpen] = useState(false)
  const [prompt, setPrompt] = useState(draftPrompt)
  // What the prompt said before each rework pass, newest last. Emptied the moment the writer types,
  // so a step back never takes their own words with it — it only ever undoes a pass that nothing
  // has happened since.
  const [revertStack, setRevertStack] = useState<string[]>([])
  const normalizedPrompt = prompt.trim()
  const readingFont = useReadingFont()
  const readingFontSize = useReadingFontSize()
  const model = useGenerationModel()
  const backHref = id ? `/worlds/${id}` : '/worlds'

  const {
    activePrompt,
    promptPieces,
    activeClusterId,
    clusterPrompts,
    clusterVersion,
    clusterLoading,
    promptDetailsLoading,
    promptDetailsError,
  } = useGenerateData({
    worldId: id,
    queryPromptId: promptId ?? null,
    lockedMode,
    versionSourceClusterId,
  })

  // A cluster lives in exactly one world version. The header's version switcher isn't offered on
  // this screen, but history can still land here from before a switch — a back navigation, a
  // restored return state, a second tab. The prompt on screen would then belong to a version the
  // world has moved off, and every action on it would write against the new one, so leave.
  const currentWorldQuery = useQuery({
    queryKey: ['world', id],
    queryFn: () => apiFetch(`/api/worlds/${id}`) as Promise<{ current_version_id: number | null }>,
    enabled: !!id,
  })
  const currentWorldVersionId = currentWorldQuery.data?.current_version_id ?? null
  const clusterIsForeign = lockedMode
    && clusterVersion?.world_version_id != null
    && currentWorldVersionId != null
    && clusterVersion.world_version_id !== currentWorldVersionId
  useEffect(() => {
    if (clusterIsForeign) navigate(backHref, { replace: true })
  }, [clusterIsForeign, navigate, backHref])

  const activePromptPieceCount = activePrompt?.piece_count ?? promptPieces.length
  // Set when this prompt was spun off another via "More like this"; FK nulls out if the parent
  // is deleted, so a non-null value is a live prompt we can redirect to.
  const parentPromptId = lockedMode ? activePrompt?.similar_to_prompt_id ?? null : null

  const {
    selectedPieceId,
    selectPiece,
    body,
    structure,
    complete,
    pieceNumber,
    metaLabel,
    modelLabel,
    tasteLabel,
    footerStatsLabel,
  } = useSavedPiece({
    lockedMode,
    resetKey: promptId ?? 'new',
    promptPieces,
    activePromptPieceCount,
  })

  const nextVersionNumber = clusterPrompts.length + 1
  const activeVersionIndex = activePrompt
    ? clusterPrompts.findIndex(p => p.id === activePrompt.id)
    : -1
  const activeVersionNumber = activeVersionIndex >= 0 ? activeVersionIndex + 1 : null
  const hasMultipleVersions = clusterPrompts.length > 1
  // "More like this" riffs on a saved prompt, so it only exists for an existing (locked) prompt.
  const showSimilarTab = lockedMode && !!promptId
  // Count of prompts already spun off this one, shown as a bubble on the tab. Shares the query key
  // with MoreLikeThisPanel so the two never double-fetch.
  const inspiredCountQuery = useQuery({
    queryKey: ['prompt-inspired', id, Number(promptId)],
    queryFn: () =>
      apiFetch(`/api/worlds/${id}/similar/${Number(promptId)}/children`) as Promise<{ children: ClusterPrompt[] }>,
    enabled: showSimilarTab && !!id,
  })
  const inspired = inspiredCountQuery.data?.children ?? []
  const inspiredCount = inspired.length
  // The bar that opens the inspired-prompts sheet lives on the prompt tab, so it only makes sense
  // once this prompt has actually spun something off.
  const showInspiredBar = showSimilarTab && inspiredCount > 0
  const visibleActiveTab: GenerateTab =
    activeTab === 'similar' && !showSimilarTab ? 'prompt' : activeTab

  // Deleting the cluster from here removes the whole prompt — every version and every piece —
  // not just the version currently on screen (that lives in the versions sheet).
  const queryClient = useQueryClient()
  const [confirmDeleteCluster, setConfirmDeleteCluster] = useState(false)
  const [deleteClusterError, setDeleteClusterError] = useState('')
  const canDeleteCluster = lockedMode && activeClusterId != null
  const clusterPieceCount = clusterPrompts.reduce((total, p) => total + (p.piece_count ?? 0), 0)
  const deleteClusterMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/worlds/${id}/clusters/${activeClusterId}`, { method: 'DELETE' }) as Promise<{ ok: true }>,
    onSuccess: () => {
      setConfirmDeleteCluster(false)
      setDeleteClusterError('')
      queryClient.invalidateQueries({ queryKey: ['worlds'] })
      queryClient.invalidateQueries({ queryKey: ['world', id] })
      queryClient.invalidateQueries({ queryKey: ['world-clusters', id] })
      queryClient.invalidateQueries({ queryKey: ['world-clusters-count', id] })
      queryClient.invalidateQueries({ queryKey: ['world-clusters-search', id] })
      queryClient.removeQueries({ queryKey: ['cluster', id, String(activeClusterId)] })
      if (promptId) queryClient.removeQueries({ queryKey: ['prompt', id, promptId] })
      navigate(id ? `/worlds/${id}` : '/worlds', { replace: true })
    },
    onError: error => {
      setDeleteClusterError(error instanceof Error ? error.message : t.couldNotDelete(entityLabel('prompt', {}, language)))
    },
  })
  const deleteClusterAction = useMemo(() => {
    if (!canDeleteCluster) return undefined
    return (
      <button
        type="button"
        className="grid h-9 w-9 place-items-center rounded-full text-ink-3 transition-colors active:text-signal-red"
        aria-label={t.deleteThis(entityLabel('prompt', {}, language))}
        onClick={() => {
          setDeleteClusterError('')
          setConfirmDeleteCluster(true)
        }}
      >
        <Trash2 aria-hidden="true" className="h-5 w-5" />
      </button>
    )
  }, [canDeleteCluster, language, t])
  const showGenerateTabs = !lockedMode || activeClusterId != null
  const needsFirstTakeScrollRoom = lockedMode && activePromptPieceCount === 0
  const showPieceStrip = lockedMode && activePromptPieceCount > 0
  const showHeaderRow = (lockedMode && !!activePrompt) || (!lockedMode && !!versionDraft)
  const headerLabel = lockedMode
    ? hasMultipleVersions && activeVersionNumber != null ? t.versionOf(activeVersionNumber, clusterPrompts.length) : ''
    : t.editingPromptNewVersion
  const showPromptTab = useCallback(() => {
    setActiveTab('prompt')
    requestAnimationFrame(() => window.scrollTo({ top: 0 }))
  }, [])
  const generateTabs = useMemo(() => {
    if (!showGenerateTabs) return undefined

    const gridColsClass = showSimilarTab ? 'grid-cols-2' : 'grid-cols-1'

    return (
      <nav
        className="page-width border-b border-rose-line/80"
        aria-label={t.generateView}
      >
        <div
          className={`grid px-4 ${gridColsClass}`}
          role="tablist"
          aria-label={t.generateView}
        >
          <GenerateTabButton
            active={visibleActiveTab === 'prompt'}
            onClick={showPromptTab}
          >
            {entityLabel('prompt', {}, language)}
          </GenerateTabButton>
          {showSimilarTab && (
            <GenerateTabButton
              active={visibleActiveTab === 'similar'}
              onClick={() => setActiveTab('similar')}
            >
              <span className="inline-flex items-center gap-3">
                <span>{t.moreLikeThis}</span>
                {inspiredCount > 0 && (
                  <span className="inline-flex min-w-4 justify-center rounded-full bg-paper-2 px-1.5 py-0.5 font-sans text-[10px] font-semibold leading-none tracking-normal text-ink-3 ring-1 ring-paper-3/70">
                    {inspiredCount}
                  </span>
                )}
              </span>
            </GenerateTabButton>
          )}
        </div>
      </nav>
    )
  }, [language, showGenerateTabs, showSimilarTab, showPromptTab, t, visibleActiveTab, inspiredCount])

  useTopNavConfig({ backHref, rightAction: deleteClusterAction, bottomSlot: generateTabs })

  useEffect(() => {
    if (promptId) return
    setPrompt(draftPrompt)
  }, [draftPrompt, promptId])

  useEffect(() => {
    if (!promptId) return
    if (activePrompt) setPrompt(activePrompt.text)
  }, [activePrompt, promptId])

  useEffect(() => {
    if (!showGenerateTabs) setActiveTab('prompt')
    else if (activeTab === 'similar' && !showSimilarTab) setActiveTab('prompt')
  }, [activeTab, showGenerateTabs, showSimilarTab])

  // Rework acts on the prompt in the editor, so it only exists where that editor is: the prompt
  // tab, unlocked. Switch tabs, or leave the edit for the saved prompt, and the text it was working
  // on is no longer on screen — the sheet closes rather than hanging over whatever replaced it.
  useEffect(() => {
    if (lockedMode || visibleActiveTab !== 'prompt') setReworkOpen(false)
  }, [lockedMode, visibleActiveTab])
  const reworkVisible = reworkOpen && !lockedMode && visibleActiveTab === 'prompt'

  // Close the versions sheet if there's nothing left to show (e.g. after deleting versions).
  useEffect(() => {
    if (!hasMultipleVersions) setVersionsOpen(false)
  }, [hasMultipleVersions])

  // Lock background scroll while the versions sheet is open.
  useEffect(() => {
    if (!versionsOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [versionsOpen])

  // Lock background scroll while the inspired-prompts sheet is open.
  useEffect(() => {
    if (!inspiredOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [inspiredOpen])

  const promptError = promptDetailsError ? t.couldNotLoad(entityLabel('prompt', {}, language)) : ''
  const generateDisabled = promptDetailsLoading || !normalizedPrompt

  const genBase = promptId ? `/worlds/${id}/prompt/${promptId}/generate` : `/worlds/${id}/prompt/new/generate`

  function handleGenerate() {
    if (generateDisabled) return
    navigate(genBase, { state: { prompt, versionDraft: routeState?.versionDraft, similarToPromptId, generated } })
  }

  // The paragraph the reader is currently on: the topmost one still below the sticky chrome
  // (nav + docked CTA). Read live from the DOM so either Resume button — the piece-view one
  // or the docked controls one — resumes at the same place the screen was showing.
  function currentReadingParagraphIndex(): number | null {
    const threshold = (showGenerateTabs ? 92 : 48) + 48 + 4
    for (const el of document.querySelectorAll<HTMLElement>('[data-paragraph-index]')) {
      if (el.getBoundingClientRect().bottom > threshold) {
        return Number(el.dataset.paragraphIndex)
      }
    }
    return null
  }

  function handleResume() {
    if (selectedPieceId === null) return
    const idx = currentReadingParagraphIndex()
    const at = idx != null ? `&at=${idx}` : ''
    navigate(`${genBase}?resume=${selectedPieceId}${at}`)
  }

  function handleEditFromPrompt(sourcePrompt: ClusterPrompt) {
    if (!id || activeClusterId == null) return
    showPromptTab()
    navigate(`/worlds/${id}/prompt/new`, {
      state: {
        versionDraft: {
          promptText: sourcePrompt.text,
          sourcePromptId: sourcePrompt.id,
          sourceClusterId: activeClusterId,
          versionNumber: nextVersionNumber,
        },
      },
    })
  }

  function handleEditActivePrompt() {
    if (!activePrompt) return
    handleEditFromPrompt(activePrompt)
  }

  function handleCancelVersionDraft() {
    if (!id || !versionDraft) return
    navigate(`/worlds/${id}/prompt/${versionDraft.sourcePromptId}`, { replace: true })
  }

  // AI help on the prompt being edited — the counterpart to "More like this", which builds a
  // separate prompt instead. It is a sheet over this screen rather than a screen of its own: the
  // text being worked on stays in view, and a pass is written into the editor here.
  function handlePromptEdited(value: string) {
    setPrompt(value)
    if (revertStack.length > 0) setRevertStack([])
  }

  function handleReworkPass(draft: string) {
    setRevertStack(stack => [...stack, prompt])
    setPrompt(draft)
  }

  // The same ask run again stands in place of the pass it repeats, so the two are one step back.
  function handleReworkTryAgain(draft: string) {
    setPrompt(draft)
  }

  function handleRevert() {
    const previous = revertStack[revertStack.length - 1]
    if (previous === undefined) return
    setPrompt(previous)
    setRevertStack(stack => stack.slice(0, -1))
  }

  return (
    // The rework sheet is docked to the bottom rather than floating over the page, so the page
    // makes room for it instead of letting it sit on top of the generate controls.
    <div className={`page-fade-in min-h-screen page-width px-4 ${visibleActiveTab === 'prompt' ? `pt-6 ${reworkVisible ? 'pb-[22rem]' : needsFirstTakeScrollRoom ? 'pb-48' : 'pb-32'}` : 'pt-0'}`}>
      {visibleActiveTab === 'prompt' ? (
        <>
          {showInspiredBar && (
            <button
              type="button"
              onClick={() => setInspiredOpen(true)}
              className="-mx-4 -mt-6 mb-1 flex w-[calc(100%+2rem)] items-center justify-center gap-1.5 border-b border-rose-line/70 bg-paper-2/40 px-4 py-4 font-serif-zh text-[13px] italic leading-none text-ink-3 transition-colors active:text-ink"
            >
              <span>{t.inspiredPromptsLabel(formatEntityCount(inspiredCount, 'prompt', language), entityLabel('prompt', {}, language))}</span>
              <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            </button>
          )}

          {parentPromptId != null && (
            <div className={`-mx-4 ${showInspiredBar ? '' : '-mt-6'} mb-1 flex w-[calc(100%+2rem)] justify-center border-b border-rose-line/70 bg-paper-2/40 px-4 py-4`}>
              <button
                type="button"
                onClick={() => navigate(`/worlds/${id}/prompt/${parentPromptId}`)}
                className="inline-flex items-center gap-1 font-serif-zh text-[13px] italic leading-none text-ink-3 transition-colors active:text-ink"
              >
                <span>{t.inspiredByParent(entityLabel('prompt', {}, language))}</span>
                <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              </button>
            </div>
          )}

          <div className={`${complete ? 'mb-1' : ''} bg-paper/95 pb-1`}>
            {/* One row: what you're editing on the left, what you can do with it on the right. The
                label is kept short enough to share the line — on a phone, splitting the two apart
                just leaves two half-empty rows. */}
            {showHeaderRow && (
              <div className="flex items-center justify-between gap-3 px-2 pt-4">
                {headerLabel ? (
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="t-meta truncate text-ink-3">{headerLabel}</span>
                    {lockedMode && hasMultipleVersions && (
                      <button
                        type="button"
                        onClick={() => setVersionsOpen(true)}
                        className="inline-flex shrink-0 items-center rounded-full bg-paper-2 px-2 py-0.5 font-sans text-[11px] font-semibold leading-none text-ink-3 ring-1 ring-paper-3/70 transition-colors active:bg-paper-3"
                      >
                        {t.seeAllVersions}
                      </button>
                    )}
                  </div>
                ) : (
                  <span aria-hidden="true" className="h-px flex-1 bg-paper-3/70" />
                )}
                <div className="flex shrink-0 items-center gap-3">
                  {lockedMode ? (
                    <button
                      type="button"
                      className={headerTextActionClass}
                      onClick={handleEditActivePrompt}
                      disabled={activeClusterId == null}
                    >
                      {t.edit}
                    </button>
                  ) : (
                    <>
                      {revertStack.length > 0 && (
                        <button
                          type="button"
                          className={headerTextActionClass}
                          onClick={handleRevert}
                        >
                          {t.revert}
                        </button>
                      )}
                      <button
                        type="button"
                        aria-pressed={reworkOpen}
                        className={`${headerTextActionClass} ${reworkOpen ? 'text-ink! decoration-ink-3!' : ''}`}
                        onClick={() => setReworkOpen(open => !open)}
                        disabled={!normalizedPrompt}
                      >
                        {t.rework}
                      </button>
                      <button
                        type="button"
                        className={headerTextActionClass}
                        onClick={handleCancelVersionDraft}
                      >
                        {t.cancel}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            <PromptCard
              prompt={prompt}
              onPromptChange={handlePromptEdited}
              loading={promptDetailsLoading}
              error={promptError}
              locked={lockedMode}
            />
          </div>

          <GenerateControls
            disabled={generateDisabled}
            hasExistingPieces={activePromptPieceCount > 0}
            model={model}
            onModelChange={setGenerationModel}
            onGenerate={handleGenerate}
            onResume={complete && body ? handleResume : undefined}
            stickyTopOffset={showGenerateTabs ? 92 : 48}
          />

          <section className="mt-2 border-t border-rose-line/70 bg-paper/60">
            {showPieceStrip && (
              <PieceStrip
                pieces={promptPieces}
                promptPieceCount={activePromptPieceCount}
                selectedPieceId={selectedPieceId}
                onSelectPiece={selectPiece}
              />
            )}

            <PieceView
              body={body}
              structure={structure}
              complete={complete}
              pieceMetaLabel={metaLabel}
              pieceModelLabel={modelLabel}
              pieceTasteLabel={tasteLabel}
              pieceFooterStatsLabel={footerStatsLabel}
              pieceNumber={pieceNumber}
              readingFont={readingFont}
              readingFontSize={readingFontSize}
              // Below the sticky nav/tabs (48 or 92) plus the docked generate CTA (h-12),
              // which sits at the top of the reading area while a piece is scrolled into view.
              railTopOffset={(showGenerateTabs ? 92 : 48) + 48}
              onResume={complete && body ? handleResume : undefined}
            />
          </section>
        </>
      ) : (
        // Full-bleed: MoreLikeThisPanel manages its own page padding and fixed action bar.
        <div className="-mx-4">
          <MoreLikeThisPanel
            worldId={id}
            sourcePromptId={Number(promptId)}
            sourceText={activePrompt?.text ?? prompt}
            worldVersionId={currentWorldVersionId}
          />
        </div>
      )}

      {reworkVisible && (
        <ReworkSheet
          worldId={id}
          text={prompt}
          onPass={handleReworkPass}
          onTryAgain={handleReworkTryAgain}
          onClose={() => setReworkOpen(false)}
        />
      )}

      {versionsOpen && createPortal(
        <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={t.versions}>
          <button
            type="button"
            aria-label={t.close}
            className="sheet-backdrop-in absolute inset-0 bg-ink/35"
            onClick={() => setVersionsOpen(false)}
          />
          <div className="sheet-slide-up relative flex h-[85vh] flex-col rounded-t-2xl border-t border-rose-line bg-paper shadow-[0_-24px_70px_rgba(26,18,16,0.22)]">
            <div className="flex items-center justify-between gap-3 border-b border-rose-line/70 px-5 pb-3 pt-4">
              <div className="flex items-center gap-2">
                <span className="t-eyebrow">{t.versions}</span>
                <span className="inline-flex min-w-5 justify-center rounded-full bg-paper-2 px-1.5 py-0.5 font-sans text-[11px] font-semibold leading-none tracking-normal text-ink-3 ring-1 ring-paper-3/70">
                  {clusterPrompts.length}
                </span>
              </div>
              <button type="button" className={headerTextActionClass} onClick={() => setVersionsOpen(false)}>
                {t.close}
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
              <GenerateVersionsPanel
                worldId={id}
                currentPromptId={promptId ?? null}
                prompts={clusterPrompts}
                loading={clusterLoading || promptDetailsLoading}
                showDiff={showVersionDiff}
                onShowDiffChange={setShowVersionDiff}
                onViewPrompt={() => setVersionsOpen(false)}
              />
            </div>
          </div>
        </div>,
        document.body,
      )}

      {inspiredOpen && createPortal(
        <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={t.inspiredPrompts}>
          <button
            type="button"
            aria-label={t.close}
            className="sheet-backdrop-in absolute inset-0 bg-ink/35"
            onClick={() => setInspiredOpen(false)}
          />
          <div className="sheet-slide-up relative flex h-[85vh] flex-col rounded-t-2xl border-t border-rose-line bg-paper shadow-[0_-24px_70px_rgba(26,18,16,0.22)]">
            <div className="flex items-center justify-between gap-3 border-b border-rose-line/70 px-5 pb-3 pt-4">
              <div className="flex items-center gap-2">
                <span className="t-eyebrow">{t.inspiredPrompts}</span>
                <span className="inline-flex min-w-5 justify-center rounded-full bg-paper-2 px-1.5 py-0.5 font-sans text-[11px] font-semibold leading-none tracking-normal text-ink-3 ring-1 ring-paper-3/70">
                  {inspiredCount}
                </span>
              </div>
              <button type="button" className={headerTextActionClass} onClick={() => setInspiredOpen(false)}>
                {t.close}
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
              <ul className="hairline-list flex flex-col">
                {inspired.map(child => (
                  <li key={child.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setInspiredOpen(false)
                        navigate(`/worlds/${id}/prompt/${child.id}`)
                      }}
                      className="block w-full py-6 text-left transition-transform duration-150 active:scale-[0.99]"
                    >
                      <div className="t-meta flex items-center justify-between gap-3">
                        <span className="truncate not-italic text-ink-3">{relativeTime(child.updated_at, language)}</span>
                        <CountIndicator count={child.piece_count} className="shrink-0 justify-end gap-x-2" />
                      </div>
                      <p className="mt-3 whitespace-pre-wrap font-serif-zh text-[16px] leading-7 text-ink-2">{child.text}</p>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>,
        document.body,
      )}

      <ConfirmDialog
        open={confirmDeleteCluster}
        title={t.deleteThisTitle(entityLabel('prompt', {}, language))}
        description={t.deleteClusterDescription(
          entityLabel('prompt', {}, language),
          t.versionCount(clusterPrompts.length),
          formatEntityCount(clusterPieceCount, 'piece', language),
        )}
        confirmLabel={t.yesDelete}
        pendingLabel={t.deleting}
        isPending={deleteClusterMutation.isPending}
        error={deleteClusterError}
        onConfirm={() => {
          if (deleteClusterMutation.isPending) return
          setDeleteClusterError('')
          deleteClusterMutation.mutate()
        }}
        onClose={() => {
          if (deleteClusterMutation.isPending) return
          setConfirmDeleteCluster(false)
          setDeleteClusterError('')
        }}
      />
    </div>
  )
}

interface GenerateTabButtonProps {
  active: boolean
  children: ReactNode
  onClick: () => void
}

function GenerateTabButton({ active, children, onClick }: GenerateTabButtonProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`-mb-px inline-flex h-11 min-w-0 items-center justify-center gap-2 border-b-2 px-1 t-eyebrow leading-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30 focus-visible:ring-offset-4 focus-visible:ring-offset-paper ${active
        ? 'border-rose text-ink!'
        : 'border-transparent text-ink-3! hover:text-ink!'
        }`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
