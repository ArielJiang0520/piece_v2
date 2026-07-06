import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, Check, Copy } from 'lucide-react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import { useTopNavConfig } from '@/components/topNavConfig'
import { entityLabel } from '@/config'
import { useUiText } from '@/i18n'
import { setGenerationModel, useGenerationModel } from '@/preferences/generationModel'
import { useLanguageId } from '@/preferences/language'
import { useReadingFont } from '@/preferences/readingFont'
import { useReadingFontSize } from '@/preferences/readingFontSize'
import PromptCard from './components/PromptCard'
import PieceStrip from './components/PieceStrip'
import PieceView from './components/PieceView'
import GenerateControls from './components/GenerateControls'
import GenerateVersionsPanel from './components/VersionsPanel'
import MoreLikeThisPanel from './components/MoreLikeThisPanel'
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
  const [showVersionDiff, setShowVersionDiff] = useState(false)
  const [prompt, setPrompt] = useState(draftPrompt)
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
    clusterLoading,
    promptDetailsLoading,
    promptDetailsError,
  } = useGenerateData({
    worldId: id,
    queryPromptId: promptId ?? null,
    lockedMode,
    versionSourceClusterId,
  })

  const activePromptPieceCount = activePrompt?.piece_count ?? promptPieces.length
  // Set when this prompt was spun off another via "More like this"; FK nulls out if the parent
  // is deleted, so a non-null value is a live prompt we can redirect to.
  const parentPromptId = lockedMode ? activePrompt?.similar_to_prompt_id ?? null : null

  const {
    selectedPieceId,
    selectPiece,
    body,
    complete,
    pieceNumber,
    metaLabel,
    modelLabel,
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
  const inspiredCount = inspiredCountQuery.data?.children.length ?? 0
  const visibleActiveTab: GenerateTab =
    activeTab === 'similar' && !showSimilarTab ? 'prompt' : activeTab
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

  useTopNavConfig({ backHref, bottomSlot: generateTabs })

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

  const promptError = promptDetailsError ? t.couldNotLoad(entityLabel('prompt', {}, language)) : ''
  const generateDisabled = promptDetailsLoading || !normalizedPrompt

  const genBase = promptId ? `/worlds/${id}/prompt/${promptId}/generate` : `/worlds/${id}/prompt/new/generate`

  function handleGenerate() {
    if (generateDisabled) return
    navigate(genBase, { state: { prompt, versionDraft: routeState?.versionDraft, similarToPromptId, generated } })
  }

  function handleResume() {
    if (selectedPieceId === null) return
    navigate(`${genBase}?resume=${selectedPieceId}`)
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

  const [promptCopied, setPromptCopied] = useState(false)
  const promptCopyResetRef = useRef<number | null>(null)
  useEffect(() => () => {
    if (promptCopyResetRef.current != null) window.clearTimeout(promptCopyResetRef.current)
  }, [])

  async function handleCopyPrompt() {
    if (!prompt) return
    try {
      await navigator.clipboard.writeText(prompt)
    } catch {
      const fallback = document.createElement('textarea')
      fallback.value = prompt
      fallback.setAttribute('readonly', '')
      fallback.style.position = 'fixed'
      fallback.style.opacity = '0'
      document.body.appendChild(fallback)
      fallback.select()
      try { document.execCommand('copy') } catch { /* noop */ }
      document.body.removeChild(fallback)
    }
    setPromptCopied(true)
    if (promptCopyResetRef.current != null) window.clearTimeout(promptCopyResetRef.current)
    promptCopyResetRef.current = window.setTimeout(() => setPromptCopied(false), 1500)
  }

  return (
    <div className={`page-fade-in min-h-screen page-width px-4 ${visibleActiveTab === 'prompt' ? 'pt-6' : 'pt-0'} ${needsFirstTakeScrollRoom ? 'pb-48' : 'pb-32'}`}>
      {visibleActiveTab === 'prompt' ? (
        <>
          {parentPromptId != null && (
            <div className="-mx-4 -mt-6 mb-1 flex w-[calc(100%+2rem)] justify-center border-b border-rose-line/70 bg-paper-2/40 px-4 py-4">
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
            {showHeaderRow && (
              <div className="flex items-center justify-between gap-3 px-2 pt-4">
                {headerLabel && (
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
                )}
                {!headerLabel && (
                  <span aria-hidden="true" className="h-px flex-1 bg-paper-3/70" />
                )}
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    aria-label={promptCopied ? t.copied : t.copy}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-ink-3 transition-opacity active:text-ink active:opacity-70 disabled:pointer-events-none disabled:opacity-40"
                    onClick={handleCopyPrompt}
                    disabled={!prompt}
                  >
                    {promptCopied
                      ? <Check aria-hidden="true" className="h-4 w-4" />
                      : <Copy aria-hidden="true" className="h-4 w-4" />}
                  </button>
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
                    <button
                      type="button"
                      className={headerTextActionClass}
                      onClick={handleCancelVersionDraft}
                    >
                      {t.cancel}
                    </button>
                  )}
                </div>
              </div>
            )}

            <PromptCard
              prompt={prompt}
              onPromptChange={setPrompt}
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
              complete={complete}
              pieceMetaLabel={metaLabel}
              pieceModelLabel={modelLabel}
              pieceFooterStatsLabel={footerStatsLabel}
              pieceNumber={pieceNumber}
              readingFont={readingFont}
              readingFontSize={readingFontSize}
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
          />
        </div>
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
