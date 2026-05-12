import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useGeneration } from '@/hooks/useGeneration'
import { useTopNavConfig } from '@/components/topNavConfig'
import { entityLabel } from '@/config'
import { useUiText } from '@/i18n'
import { setGenerationModel, useGenerationModel } from '@/preferences/generationModel'
import { useLanguageId } from '@/preferences/language'
import { useReadingFont } from '@/preferences/readingFont'
import { useReadingFontSize } from '@/preferences/readingFontSize'
import {
  setReadingSpeedUnitsPerSecond,
  useReadingSpeedUnitsPerSecond,
} from '@/preferences/readingSpeed'
import PromptCard from './components/PromptCard'
import PieceStrip from './components/PieceStrip'
import OutputPanel from './components/OutputPanel'
import GenerateControls from './components/GenerateControls'
import GenerateVersionsPanel from './components/VersionsPanel'
// import ReadingSettingsButton from './components/ReadingSettingsButton'
import { useGenerateData } from './hooks/useGenerateData'
import { useGeneratePieceSession } from './hooks/useGeneratePieceSession'
import type { ClusterPrompt } from './types'

const GENERATION_TEMPERATURE = 1
const USE_THINKING = false

const headerTextActionClass =
  'inline-flex h-8 shrink-0 items-center justify-center px-1 font-serif-zh text-[14px] italic leading-none text-ink-3 underline decoration-ink-4/50 underline-offset-4 transition-colors duration-200 hover:text-ink hover:decoration-ink-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-4/30 focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:pointer-events-none disabled:opacity-50'

// const navReadingButtonClass =
//   'grid h-9 w-9 place-items-center rounded-full border border-transparent text-ink-3 transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30'

type GenerateTab = 'prompt' | 'versions'

interface VersionDraftState {
  promptText: string
  sourcePromptId: number
  sourceClusterId: number
  versionNumber: number
}

function parseVersionDraft(value: unknown): VersionDraftState | null {
  if (!value || typeof value !== 'object') return null
  const parsed = value as Partial<VersionDraftState>
  if (
    typeof parsed.promptText !== 'string' ||
    typeof parsed.sourcePromptId !== 'number' ||
    typeof parsed.sourceClusterId !== 'number' ||
    typeof parsed.versionNumber !== 'number'
  ) {
    return null
  }

  return {
    promptText: parsed.promptText,
    sourcePromptId: parsed.sourcePromptId,
    sourceClusterId: parsed.sourceClusterId,
    versionNumber: parsed.versionNumber,
  }
}

export default function Generate() {
  const language = useLanguageId()
  const t = useUiText()
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const queryPromptId = searchParams.get('promptId')
  const lockedMode = !!queryPromptId
  const routeState = location.state as { draftPrompt?: unknown; versionDraft?: unknown } | null
  const versionDraft = parseVersionDraft(routeState?.versionDraft)
  const draftPrompt = versionDraft?.promptText ?? (typeof routeState?.draftPrompt === 'string' ? routeState.draftPrompt : '')
  const versionSourcePromptId = !lockedMode ? versionDraft?.sourcePromptId ?? null : null
  const versionSourceClusterId = !lockedMode ? versionDraft?.sourceClusterId ?? null : null
  const [activeTab, setActiveTab] = useState<GenerateTab>('prompt')
  const [showVersionDiff, setShowVersionDiff] = useState(false)
  const [prompt, setPrompt] = useState(draftPrompt)
  const normalizedPrompt = prompt.trim()
  const readingSpeed = useReadingSpeedUnitsPerSecond()
  const readingFont = useReadingFont()
  const readingFontSize = useReadingFontSize()
  const model = useGenerationModel()
  const backHref = id ? `/worlds/${id}` : '/worlds'

  const {
    phase,
    output,
    error: generationError,
    completion,
    generationId,
    displayComplete,
    streaming,
    generate,
    stop,
    reset,
  } = useGeneration({ worldId: id })

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
    queryPromptId,
    lockedMode,
    versionSourceClusterId,
  })

  const {
    saveState,
    selectedPieceId,
    selectPiece,
    selectPendingPiece,
    viewingPendingPiece,
    viewingSavedPiece,
    pendingPieceNumber,
    displayedOutput,
    outputDisplayComplete,
    displayedPieceMetaLabel,
    displayedPieceFooterStatsLabel,
    prepareGeneration,
    cancelPendingGeneration,
  } = useGeneratePieceSession({
    worldId: id,
    queryPromptId,
    lockedMode,
    prompt,
    normalizedPrompt,
    output,
    model,
    generationId,
    streaming,
    displayComplete,
    completion,
    generationError,
    versionSourcePromptId,
    promptPieces,
    resetGeneration: reset,
  })
  const nextVersionNumber = clusterPrompts.length + 1
  const activeVersionIndex = activePrompt
    ? clusterPrompts.findIndex(p => p.id === activePrompt.id)
    : -1
  const activeVersionNumber = activeVersionIndex >= 0 ? activeVersionIndex + 1 : null
  const hasMultipleVersions = clusterPrompts.length > 1
  const visibleActiveTab: GenerateTab = hasMultipleVersions ? activeTab : 'prompt'
  const showGenerateTabs = !lockedMode || activeClusterId != null
  const activePromptPieceCount = activePrompt?.piece_count ?? promptPieces.length
  const selectedPieceIndex = selectedPieceId === null
    ? -1
    : promptPieces.findIndex(piece => piece.id === selectedPieceId)
  const displayedPieceNumber = viewingPendingPiece
    ? pendingPieceNumber
    : selectedPieceIndex >= 0
      ? Math.max(1, activePromptPieceCount - selectedPieceIndex)
      : null
  const needsFirstTakeScrollRoom = lockedMode && activePromptPieceCount === 0 && pendingPieceNumber === null
  const showPieceStrip = lockedMode && (activePromptPieceCount > 0 || pendingPieceNumber !== null)
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

    return (
      <nav
        className="page-width border-b border-rose-line/80"
        aria-label={t.generateView}
      >
        <div
          className={`grid px-4 ${hasMultipleVersions ? 'grid-cols-2' : 'grid-cols-1'}`}
          role="tablist"
          aria-label={t.generateView}
        >
          <GenerateTabButton
            active={visibleActiveTab === 'prompt'}
            onClick={showPromptTab}
          >
            {entityLabel('prompt', {}, language)}
          </GenerateTabButton>
          {hasMultipleVersions && (
            <GenerateTabButton
              active={visibleActiveTab === 'versions'}
              onClick={() => setActiveTab('versions')}
            >
              <span>{t.versions}</span>
              <span className="inline-flex min-w-5 justify-center rounded-full bg-paper-2 px-1.5 py-0.5 font-sans text-[11px] font-semibold leading-none tracking-normal text-ink-3 ring-1 ring-paper-3/70">
                {clusterPrompts.length}
              </span>
            </GenerateTabButton>
          )}
        </div>
      </nav>
    )
  }, [clusterPrompts.length, hasMultipleVersions, language, showGenerateTabs, showPromptTab, t, visibleActiveTab])
  // const readingSettingsAction = useMemo(() => (
  //   <ReadingSettingsButton
  //     className={navReadingButtonClass}
  //     readingFont={readingFont}
  //     onReadingFontChange={setReadingFont}
  //     readingFontSize={readingFontSize}
  //     onReadingFontSizeChange={setReadingFontSize}
  //   />
  // ), [readingFont, readingFontSize])

  useTopNavConfig({ backHref, bottomSlot: generateTabs })

  useEffect(() => {
    if (queryPromptId) return
    setPrompt(draftPrompt)
  }, [draftPrompt, queryPromptId, setPrompt])

  useEffect(() => {
    if (!queryPromptId) return
    if (activePrompt) setPrompt(activePrompt.text)
  }, [activePrompt, queryPromptId])

  useEffect(() => {
    if (!showGenerateTabs || !hasMultipleVersions) setActiveTab('prompt')
  }, [hasMultipleVersions, showGenerateTabs])

  const promptError = promptDetailsError ? t.couldNotLoad(entityLabel('prompt', {}, language)) : ''
  const error = generationError || promptError
  const generateDisabled =
    streaming ||
    saveState === 'saving' ||
    promptDetailsLoading ||
    !normalizedPrompt

  function handleGenerate() {
    if (generateDisabled) return
    prepareGeneration(activePromptPieceCount)
    generate({
      prompt,
      model,
      temperature: GENERATION_TEMPERATURE,
      useThinking: USE_THINKING,
    })
  }

  function handleStop() {
    stop()
    cancelPendingGeneration()
  }

  function handleEditFromPrompt(sourcePrompt: ClusterPrompt) {
    if (!id || activeClusterId == null || streaming) return
    showPromptTab()
    navigate(`/worlds/${id}/generate`, {
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
    navigate(`/worlds/${id}/generate?promptId=${versionDraft.sourcePromptId}`, { replace: true })
  }

  return (
    <div className={`page-fade-in min-h-screen page-width px-4 ${visibleActiveTab === 'versions' ? 'pt-0' : 'pt-6'} ${needsFirstTakeScrollRoom ? 'pb-48' : 'pb-32'}`}>
      {visibleActiveTab === 'prompt' ? (
        <>
          <div className={`${viewingSavedPiece && !streaming ? 'mb-1' : ''} bg-paper/95 pb-1`}>
            {showHeaderRow && (
              <div className="flex items-center justify-between gap-3 px-2 pt-4">
                {headerLabel && (
                  <span className="t-meta flex min-w-0 items-center gap-1.5 truncate text-ink-3">
                    {headerLabel}
                  </span>
                )}
                {!headerLabel && (
                  <span aria-hidden="true" className="h-px flex-1 bg-paper-3/70" />
                )}
                {lockedMode ? (
                  <button
                    type="button"
                    className={headerTextActionClass}
                    onClick={handleEditActivePrompt}
                    disabled={streaming || activeClusterId == null}
                  >
                    {t.edit}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={headerTextActionClass}
                    onClick={handleCancelVersionDraft}
                    disabled={streaming}
                  >
                    {t.cancel}
                  </button>
                )}
              </div>
            )}

            <PromptCard
              prompt={prompt}
              onPromptChange={setPrompt}
              loading={promptDetailsLoading}
              streaming={streaming}
              error={error}
              locked={lockedMode}
            />
          </div>

          <GenerateControls
            phase={phase}
            streaming={streaming}
            disabled={generateDisabled}
            hasExistingPieces={activePromptPieceCount > 0}
            model={model}
            readingSpeed={readingSpeed}
            onModelChange={setGenerationModel}
            onReadingSpeedChange={setReadingSpeedUnitsPerSecond}
            onGenerate={handleGenerate}
            onStop={handleStop}
            stickyTopOffset={showGenerateTabs ? 92 : 48}
          />

          <section className="mt-2 border-t border-rose-line/70 bg-paper/60">
            {showPieceStrip && (
              <PieceStrip
                pieces={promptPieces}
                promptPieceCount={activePromptPieceCount}
                selectedPieceId={selectedPieceId}
                pendingPieceNumber={pendingPieceNumber}
                pendingSelected={viewingPendingPiece}
                disabled={streaming}
                onSelectPending={selectPendingPiece}
                onSelectPiece={selectPiece}
              />
            )}

            <OutputPanel
              output={displayedOutput}
              phase={phase}
              streaming={streaming}
              displayComplete={outputDisplayComplete}
              pieceMetaLabel={displayedPieceMetaLabel}
              pieceFooterStatsLabel={displayedPieceFooterStatsLabel}
              pieceNumber={displayedPieceNumber}
              readingFont={readingFont}
              readingFontSize={readingFontSize}
            />
          </section>
        </>
      ) : (
        <section className="bg-paper/95 pb-6">
          <GenerateVersionsPanel
            worldId={id}
            currentPromptId={queryPromptId}
            prompts={clusterPrompts}
            loading={clusterLoading || promptDetailsLoading}
            showDiff={showVersionDiff}
            onShowDiffChange={setShowVersionDiff}
            onViewPrompt={showPromptTab}
          />
        </section>
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
