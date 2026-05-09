import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ChevronRight, GitBranch, LockKeyhole, Pencil } from 'lucide-react'
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
import GenerateVersionsDrawer from './VersionsDrawer'
import { useGenerateData } from './useGenerateData'
import { useGeneratePieceSession } from './useGeneratePieceSession'
import type { ClusterPrompt } from './generateTypes'

const GENERATION_TEMPERATURE = 1
const USE_THINKING = false

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
  const draftVersionNumber = !lockedMode ? versionDraft?.versionNumber ?? null : null
  const versionSourcePromptId = !lockedMode ? versionDraft?.sourcePromptId ?? null : null
  const versionSourceClusterId = !lockedMode ? versionDraft?.sourceClusterId ?? null : null
  const [versionsOpen, setVersionsOpen] = useState(false)
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
  const showVersionsButton = activeClusterId != null
  const currentVersionNumber = queryPromptId
    ? clusterPrompts.findIndex((clusterPrompt: { id: any }) => String(clusterPrompt.id) === queryPromptId) + 1
    : 0
  const versionsLabel = draftVersionNumber !== null
    ? `Draft version ${draftVersionNumber}`
    : currentVersionNumber > 0
      ? `Version ${currentVersionNumber}`
      : 'Versions'
  const activePromptPieceCount = activePrompt?.piece_count ?? promptPieces.length
  const showPieceStrip = lockedMode && (activePromptPieceCount > 0 || pendingPieceNumber !== null)
  const PromptStateIcon = lockedMode ? LockKeyhole : Pencil
  const promptStateTitle = lockedMode ? `Saved ${entityLabel('prompt')}` : `Draft ${entityLabel('prompt')}`
  const promptStateLabel = lockedMode ? 'Read-only' : 'Editable'

  useTopNavConfig({ backHref, secondaryTitle: entityLabel('prompt') })

  useEffect(() => {
    if (queryPromptId) return
    setPrompt(draftPrompt)
  }, [draftPrompt, queryPromptId, setPrompt])

  useEffect(() => {
    if (!queryPromptId) return
    if (activePrompt) setPrompt(activePrompt.text)
  }, [activePrompt, queryPromptId])

  useEffect(() => {
    if (!showVersionsButton) setVersionsOpen(false)
  }, [showVersionsButton])

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
    setVersionsOpen(false)
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

  return (
    <>
      <div className="page-fade-in min-h-screen page-width px-4 pb-32 pt-6">
        <div className={`${viewingSavedPiece && !streaming ? 'mb-1' : ''} border-b border-rose-line/70 bg-paper/95 pb-1`}>
          {showVersionsButton && (
            <div className="border-y border-rose-line/70 px-2 py-2">
              <button
                type="button"
                className="flex w-full items-center gap-3 text-left transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30"
                aria-label="Open versions"
                title="Open versions"
                aria-expanded={versionsOpen}
                onClick={() => setVersionsOpen(true)}
              >
                <GitBranch aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-ink-3" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-serif-zh text-sm italic leading-5 text-ink">
                    {versionsLabel}
                  </span>
                  <span className="t-meta block sm:hidden">
                    Open to edit this {entityLabel('prompt')}
                  </span>
                </span>
                <span className="t-eyebrow hidden shrink-0 sm:inline-flex">Versions</span>
                <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-3" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-2 px-2 pt-4 text-ink-3">
            <PromptStateIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            <span className="t-eyebrow min-w-0 truncate text-ink-3">{promptStateTitle}</span>
            <span aria-hidden="true" className="h-px w-5 shrink-0 bg-rose-line" />
            <span className="t-meta shrink-0" style={lockedMode ? undefined : { color: 'var(--color-rose-deep)' }}>{promptStateLabel}</span>
          </div>

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
            readingFont={readingFont}
            readingFontSize={readingFontSize}
          />
        </section>
      </div>

      <GenerateVersionsDrawer
        open={versionsOpen}
        worldId={id}
        currentPromptId={queryPromptId}
        prompts={clusterPrompts}
        loading={clusterLoading || promptDetailsLoading}
        streaming={streaming}
        onClose={() => setVersionsOpen(false)}
        onEditFromPrompt={handleEditFromPrompt}
      />
    </>
  )
}
