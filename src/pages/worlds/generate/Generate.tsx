import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Pencil } from 'lucide-react'
import { useGeneration } from '@/hooks/useGeneration'
import { useTopNavConfig } from '@/components/topNavConfig'
import { entityLabel } from '@/config'
import { setGenerationModel, useGenerationModel } from '@/preferences/generationModel'
import { setReadingFont, useReadingFont } from '@/preferences/readingFont'
import { setReadingFontSize, useReadingFontSize } from '@/preferences/readingFontSize'
import {
  setReadingSpeedUnitsPerSecond,
  useReadingSpeedUnitsPerSecond,
} from '@/preferences/readingSpeed'
import PromptCard from './PromptCard'
import PieceStrip from './PieceStrip'
import OutputPanel from './OutputPanel'
import GenerateControls from './GenerateControls'
import GenerateVersionsPanel from './VersionsPanel'
import { useGenerateData } from './useGenerateData'
import { useGeneratePieceSession } from './useGeneratePieceSession'
import type { ClusterPrompt } from './generateTypes'

const GENERATION_TEMPERATURE = 1
const USE_THINKING = false

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
  const [prompt, setPrompt] = useState(draftPrompt)
  const normalizedPrompt = prompt.trim()
  const [settingsOpen, setSettingsOpen] = useState(false)
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
    streaming,
    displayComplete,
    completion,
    generationError,
    versionSourcePromptId,
    promptPieces,
    resetGeneration: reset,
  })
  const nextVersionNumber = clusterPrompts.length + 1
  const showGenerateTabs = activeClusterId != null
  const activePromptPieceCount = activePrompt?.piece_count ?? promptPieces.length
  const selectedPieceIndex = selectedPieceId === null
    ? -1
    : promptPieces.findIndex(piece => piece.id === selectedPieceId)
  const displayedPieceNumber = viewingPendingPiece
    ? pendingPieceNumber
    : selectedPieceIndex >= 0
      ? Math.max(1, activePromptPieceCount - selectedPieceIndex)
      : null
  const pulseGenerateCta = lockedMode && !promptDetailsLoading && activePromptPieceCount === 0
  const showPieceStrip = lockedMode && (activePromptPieceCount > 0 || pendingPieceNumber !== null)
  const promptStateTitle = `Draft ${entityLabel('prompt')}`
  const promptStateLabel = 'Editable'
  const generateTabs = useMemo(() => {
    if (!showGenerateTabs) return undefined

    return (
      <nav
        className="page-width border-b border-rose-line/80"
        aria-label="Generate view"
      >
        <div
          className="grid grid-cols-2 px-4"
          role="tablist"
          aria-label="Generate view"
        >
          <GenerateTabButton
            active={activeTab === 'prompt'}
            onClick={() => setActiveTab('prompt')}
          >
            {entityLabel('prompt')}
          </GenerateTabButton>
          <GenerateTabButton
            active={activeTab === 'versions'}
            onClick={() => setActiveTab('versions')}
          >
            <span>Versions</span>
            <span className="inline-flex min-w-5 justify-center rounded-full bg-paper-2 px-1.5 py-0.5 font-sans text-[11px] font-semibold leading-none tracking-normal text-ink-3 ring-1 ring-paper-3/70">
              {clusterPrompts.length}
            </span>
          </GenerateTabButton>
        </div>
      </nav>
    )
  }, [activeTab, clusterPrompts.length, showGenerateTabs])

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
    if (!showGenerateTabs) setActiveTab('prompt')
  }, [showGenerateTabs])

  const promptError = promptDetailsError ? `Could not load ${entityLabel('prompt')}` : ''
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
    setActiveTab('prompt')
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
    <div className="page-fade-in min-h-screen page-width px-4 pb-32 pt-6">
      {activeTab === 'prompt' ? (
        <>
          <div className={`${viewingSavedPiece && !streaming ? 'mb-1' : ''} bg-paper/95 pb-1`}>
            {lockedMode && activePrompt && (
              <div className="flex justify-end px-2 pt-4">
                <button
                  type="button"
                  className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-full border border-rose-line bg-paper px-4 font-serif-zh text-[14px] italic leading-none text-rose-deep transition-[background-color,border-color,transform] duration-200 hover:-translate-y-px hover:border-rose/40 hover:bg-rose-pale focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30 disabled:pointer-events-none disabled:opacity-50"
                  onClick={handleEditActivePrompt}
                  disabled={streaming || activeClusterId == null}
                >
                  <Pencil aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 truncate">Edit</span>
                </button>
              </div>
            )}

            {!lockedMode && versionDraft && (
              <div className="flex items-center justify-between gap-3 px-2 pt-4">
                <span className="t-meta min-w-0 truncate text-ink-3">Creating a new version</span>
                <button
                  type="button"
                  className="t-meta shrink-0 text-ink-3 underline decoration-rose-line underline-offset-4 transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30"
                  onClick={handleCancelVersionDraft}
                  disabled={streaming}
                >
                  Cancel
                </button>
              </div>
            )}

            {!showGenerateTabs && !lockedMode && !versionDraft && (
              <div className="flex items-center gap-2 px-2 pt-4 text-ink-3">
                <Pencil aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                <span className="t-eyebrow min-w-0 truncate text-ink-3">{promptStateTitle}</span>
                <span aria-hidden="true" className="h-px w-5 shrink-0 bg-rose-line" />
                <span className="t-meta shrink-0" style={{ color: 'var(--color-rose-deep)' }}>{promptStateLabel}</span>
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
            settingsOpen={settingsOpen}
            disabled={generateDisabled}
            hasExistingPieces={activePromptPieceCount > 0}
            pulseCta={pulseGenerateCta}
            model={model}
            onModelChange={setGenerationModel}
            readingSpeed={readingSpeed}
            onReadingSpeedChange={setReadingSpeedUnitsPerSecond}
            readingFont={readingFont}
            onReadingFontChange={setReadingFont}
            readingFontSize={readingFontSize}
            onReadingFontSizeChange={setReadingFontSize}
            onGenerate={handleGenerate}
            onToggleSettings={() => setSettingsOpen(open => !open)}
            onCloseSettings={() => setSettingsOpen(false)}
            onStop={handleStop}
            stickyTopOffset={showGenerateTabs ? 92 : 64}
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
              pieceNumber={displayedPieceNumber}
              readingFont={readingFont}
              readingFontSize={readingFontSize}
            />
          </section>
        </>
      ) : (
        <section className="bg-paper/95 pb-6 pt-1">
          <GenerateVersionsPanel
            worldId={id}
            currentPromptId={queryPromptId}
            prompts={clusterPrompts}
            loading={clusterLoading || promptDetailsLoading}
            onViewPrompt={() => setActiveTab('prompt')}
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
