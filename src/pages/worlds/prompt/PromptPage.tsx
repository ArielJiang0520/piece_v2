import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, Copy } from 'lucide-react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
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
import { useGenerateData } from './hooks/useGenerateData'
import { useSavedPiece } from './hooks/useSavedPiece'
import { parseVersionDraft, type ClusterPrompt } from '../shared/types'

const headerTextActionClass =
  'inline-flex h-8 shrink-0 items-center justify-center px-1 font-serif-zh text-[14px] italic leading-none text-ink-3 underline decoration-ink-4/50 underline-offset-4 transition-colors duration-200 hover:text-ink hover:decoration-ink-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-4/30 focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:pointer-events-none disabled:opacity-50'

type GenerateTab = 'prompt' | 'versions'

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
  const routeState = location.state as { draftPrompt?: unknown; versionDraft?: unknown } | null
  const versionDraft = parseVersionDraft(routeState?.versionDraft)
  const draftPrompt = versionDraft?.promptText ?? (typeof routeState?.draftPrompt === 'string' ? routeState.draftPrompt : '')
  const versionSourceClusterId = !lockedMode ? versionDraft?.sourceClusterId ?? null : null
  const [activeTab, setActiveTab] = useState<GenerateTab>('prompt')
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
  const visibleActiveTab: GenerateTab = hasMultipleVersions ? activeTab : 'prompt'
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
    if (!showGenerateTabs || !hasMultipleVersions) setActiveTab('prompt')
  }, [hasMultipleVersions, showGenerateTabs])

  const promptError = promptDetailsError ? t.couldNotLoad(entityLabel('prompt', {}, language)) : ''
  const generateDisabled = promptDetailsLoading || !normalizedPrompt

  const genBase = promptId ? `/worlds/${id}/prompt/${promptId}/generate` : `/worlds/${id}/prompt/new/generate`

  function handleGenerate() {
    if (generateDisabled) return
    navigate(genBase, { state: { prompt, versionDraft: routeState?.versionDraft } })
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
    <div className={`page-fade-in min-h-screen page-width px-4 ${visibleActiveTab === 'versions' ? 'pt-0' : 'pt-6'} ${needsFirstTakeScrollRoom ? 'pb-48' : 'pb-32'}`}>
      {visibleActiveTab === 'prompt' ? (
        <>
          <div className={`${complete ? 'mb-1' : ''} bg-paper/95 pb-1`}>
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
              streaming={false}
              error={promptError}
              locked={lockedMode}
            />
          </div>

          <GenerateControls
            phase="idle"
            streaming={false}
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

            {complete && body && (
              <div className="flex px-2 pt-2">
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center rounded-full bg-rose px-5 font-serif-zh text-[15px] italic leading-none text-white transition-opacity active:opacity-80"
                  onClick={handleResume}
                >
                  {t.resume}
                </button>
              </div>
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
            />
          </section>
        </>
      ) : (
        <section className="bg-paper/95 pb-6">
          <GenerateVersionsPanel
            worldId={id}
            currentPromptId={promptId ?? null}
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
