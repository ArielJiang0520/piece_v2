import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowUp } from 'lucide-react'
import { useGeneration } from '@/hooks/useGeneration'
import { usePromptMatch } from '@/hooks/usePromptMatch'
import { useTopNavConfig } from '@/components/topNavConfig'
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
import GeneratePromptActions from './GeneratePromptActions'
import GenerateSettingsDialog from './GenerateSettingsDialog'
import { useGenerateData } from './useGenerateData'
import { useGeneratePieceSession } from './useGeneratePieceSession'
import { useScrollTopButton } from './useScrollTopButton'

const GENERATION_TEMPERATURE = 1
const USE_THINKING = false

export default function Generate() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const queryPromptId = searchParams.get('promptId')
  const lockedMode = !!queryPromptId
  const routeState = location.state as { draftPrompt?: unknown } | null
  const draftPrompt = typeof routeState?.draftPrompt === 'string' ? routeState.draftPrompt : ''

  const {
    prompt,
    setPrompt,
    normalizedPrompt,
    matchedPrompt,
    promptPieceCount,
    loadingPrompt,
    promptError,
    loadedPrompt,
    applyPromptSaved,
  } = usePromptMatch({ worldId: id, queryPromptId })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const readingSpeed = useReadingSpeedUnitsPerSecond()
  const readingFont = useReadingFont()
  const readingFontSize = useReadingFontSize()
  const model = useGenerationModel()
  const backHref = id ? `/worlds/${id}` : '/worlds'
  useTopNavConfig({ backHref, secondaryTitle: 'scene' })

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
    promptCardPieceCount,
    promptDetailsLoading,
    variationNumber,
    showHistoryLink,
  } = useGenerateData({
    worldId: id,
    queryPromptId,
    lockedMode,
    loadedPrompt,
    promptPieceCount,
  })

  const {
    saveState,
    selectedPieceId,
    setSelectedPieceId,
    viewingSavedPiece,
    displayedOutput,
    outputDisplayComplete,
    displayedPieceMetaLabel,
    prepareGeneration,
  } = useGeneratePieceSession({
    worldId: id,
    queryPromptId,
    lockedMode,
    prompt,
    normalizedPrompt,
    matchedPrompt,
    output,
    model,
    streaming,
    displayComplete,
    completion,
    generationError,
    resetGeneration: reset,
    applyPromptSaved,
  })
  const { topSentinelRef, showScrollTop, scrollToTop } = useScrollTopButton()

  useEffect(() => {
    if (queryPromptId || !draftPrompt) return
    setPrompt(draftPrompt)
  }, [draftPrompt, queryPromptId, setPrompt])

  const error = generationError || promptError
  const generateDisabled =
    streaming ||
    saveState === 'saving' ||
    loadingPrompt ||
    promptDetailsLoading ||
    !normalizedPrompt ||
    settingsOpen

  function handleGenerate() {
    if (generateDisabled) return
    prepareGeneration()
    generate({
      prompt,
      promptId: lockedMode && queryPromptId ? Number(queryPromptId) : matchedPrompt?.id,
      model,
      temperature: GENERATION_TEMPERATURE,
      useThinking: USE_THINKING,
    })
  }

  function handleCopyEdit() {
    if (!id || !queryPromptId || streaming) return
    navigate(`/worlds/${id}/generate`, { state: { draftPrompt: prompt } })
  }

  return (
    <>
      <div className="page-fade-in min-h-screen page-width px-4 pb-32 pt-6">
        <div ref={topSentinelRef} className="h-px" aria-hidden="true" />
        <div className={`${viewingSavedPiece && !streaming ? 'mb-1' : 'mb-8'} bg-paper/95`}>
          {lockedMode && (
            <GeneratePromptActions
              worldId={id}
              promptId={queryPromptId}
              activeClusterId={activeClusterId}
              showHistoryLink={showHistoryLink}
              variationNumber={variationNumber}
              streaming={streaming}
              onCopyEdit={handleCopyEdit}
            />
          )}

          <PromptCard
            prompt={prompt}
            onPromptChange={setPrompt}
            loading={loadingPrompt || promptDetailsLoading}
            streaming={streaming}
            promptPieceCount={promptCardPieceCount}
            error={error}
            locked={lockedMode}
          />

          {lockedMode && (
            <PieceStrip
              pieces={promptPieces}
              promptPieceCount={activePrompt?.piece_count ?? promptPieces.length}
              selectedPieceId={selectedPieceId}
              disabled={streaming}
              onSelectNew={() => setSelectedPieceId(null)}
              onSelectPiece={pieceId => setSelectedPieceId(pieceId)}
            />
          )}

          <GenerateControls
            phase={phase}
            streaming={streaming}
            settingsOpen={settingsOpen}
            viewingSavedPiece={viewingSavedPiece}
            disabled={generateDisabled}
            onGenerate={handleGenerate}
            onToggleSettings={() => setSettingsOpen(open => !open)}
            onStop={stop}
          />
        </div>

        <OutputPanel
          output={displayedOutput}
          streaming={streaming}
          displayComplete={outputDisplayComplete}
          pieceMetaLabel={displayedPieceMetaLabel}
          readingFont={readingFont}
          readingFontSize={readingFontSize}
        />
      </div>

      {showScrollTop && (
        <button
          type="button"
          onClick={scrollToTop}
          className="fixed bottom-7 left-1/2 z-40 grid h-14 w-14 -translate-x-1/2 place-items-center rounded-full bg-paper text-ink shadow-(--shadow-feather) transition-all hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-ink-4/20"
          aria-label="Scroll to top"
          title="Scroll to top"
        >
          <ArrowUp aria-hidden="true" className="h-6 w-6" />
        </button>
      )}

      <GenerateSettingsDialog
        open={settingsOpen}
        disabled={streaming}
        model={model}
        onModelChange={setGenerationModel}
        readingSpeed={readingSpeed}
        onReadingSpeedChange={setReadingSpeedUnitsPerSecond}
        readingFont={readingFont}
        onReadingFontChange={setReadingFont}
        readingFontSize={readingFontSize}
        onReadingFontSizeChange={setReadingFontSize}
        onClose={() => setSettingsOpen(false)}
      />
    </>
  )
}
