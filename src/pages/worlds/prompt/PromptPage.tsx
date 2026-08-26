import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, Copy, MessageCircle, Trash2 } from 'lucide-react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import ConfirmDialog from '@/components/ConfirmDialog'
import { useTopNavConfig } from '@/components/topNavConfig'
import { entityLabel, formatEntityCount } from '@/config'
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
import AdditionsIndicator from '../shared/AdditionsIndicator'
import { useWorldAdditions } from '../shared/useWorldAdditions'
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
  const [copied, setCopied] = useState(false)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const normalizedPrompt = prompt.trim()
  const readingFont = useReadingFont()
  const readingFontSize = useReadingFontSize()
  const model = useGenerationModel()
  const backHref = id ? `/worlds/${id}` : '/worlds'
  // What the world will carry when Generate is tapped — the same set the chat is given.
  const { additions, activeIds } = useWorldAdditions(id)

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
    additionsLabel,
    footerStatsLabel,
  } = useSavedPiece({
    lockedMode,
    resetKey: promptId ?? 'new',
    promptPieces,
    activePromptPieceCount,
    additions,
    activeAdditionIds: activeIds,
  })

  const nextVersionNumber = clusterPrompts.length + 1
  const activeVersionIndex = activePrompt
    ? clusterPrompts.findIndex(p => p.id === activePrompt.id)
    : -1
  const activeVersionNumber = activeVersionIndex >= 0 ? activeVersionIndex + 1 : null
  const hasMultipleVersions = clusterPrompts.length > 1
  // The version history of a saved prompt, so it only exists for an existing (locked) prompt.
  const showVersionsTab = lockedMode && !!promptId
  const visibleActiveTab: GenerateTab =
    activeTab === 'versions' && !showVersionsTab ? 'prompt' : activeTab

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
  // Always there while the editor is open, even on a blank new prompt: the AI action lives in this
  // row, and on a blank prompt it is the only thing on the screen that can fill the field.
  const showHeaderRow = lockedMode ? !!activePrompt : true
  const headerLabel = lockedMode
    ? hasMultipleVersions && activeVersionNumber != null ? t.versionOf(activeVersionNumber, clusterPrompts.length) : ''
    : versionDraft ? t.editingPromptNewVersion : ''
  const showPromptTab = useCallback(() => {
    setActiveTab('prompt')
    requestAnimationFrame(() => window.scrollTo({ top: 0 }))
  }, [])
  const generateTabs = useMemo(() => {
    if (!showGenerateTabs) return undefined

    const gridColsClass = showVersionsTab ? 'grid-cols-2' : 'grid-cols-1'

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
          {showVersionsTab && (
            <GenerateTabButton
              active={visibleActiveTab === 'versions'}
              onClick={() => setActiveTab('versions')}
            >
              <span className="inline-flex items-center gap-3">
                <span>{t.versions}</span>
                {clusterPrompts.length > 0 && (
                  <span className="inline-flex min-w-4 justify-center rounded-full bg-paper-2 px-1.5 py-0.5 font-sans text-[10px] font-semibold leading-none tracking-normal text-ink-3 ring-1 ring-paper-3/70">
                    {clusterPrompts.length}
                  </span>
                )}
              </span>
            </GenerateTabButton>
          )}
        </div>
      </nav>
    )
  }, [language, showGenerateTabs, showVersionsTab, showPromptTab, t, visibleActiveTab, clusterPrompts.length])

  useTopNavConfig({ backHref, rightAction: deleteClusterAction, bottomSlot: generateTabs })

  // The page is not remounted between a fresh draft and a saved prompt, so what the route says is
  // resynced here rather than only seeded — including text carried back from the chat.
  useEffect(() => {
    if (promptId) return
    setPrompt(draftPrompt)
  }, [draftPrompt, promptId])

  useEffect(() => {
    if (!promptId) return
    if (activePrompt) setPrompt(activePrompt.text)
  }, [activePrompt, promptId])

  useEffect(() => () => {
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
  }, [])

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt)
    } catch {
      return
    }
    setCopied(true)
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
    copiedTimerRef.current = setTimeout(() => setCopied(false), 1600)
  }

  useEffect(() => {
    if (!showGenerateTabs) setActiveTab('prompt')
    else if (activeTab === 'versions' && !showVersionsTab) setActiveTab('prompt')
  }, [activeTab, showGenerateTabs, showVersionsTab])

  const promptError = promptDetailsError ? t.couldNotLoad(entityLabel('prompt', {}, language)) : ''
  const generateDisabled = promptDetailsLoading || !normalizedPrompt

  const genBase = promptId ? `/worlds/${id}/prompt/${promptId}/generate` : `/worlds/${id}/prompt/new/generate`

  function handleGenerate() {
    if (generateDisabled) return
    navigate(genBase, { state: { prompt, versionDraft: routeState?.versionDraft } })
  }

  // The chat that has this screen's material in view — always a prompt's cluster. From a saved
  // prompt it is that prompt's; from an edit in progress it is still the cluster being worked on,
  // not an invented one. The editor's unsaved text rides along so coming back doesn't lose it.
  // A blank new prompt has no cluster to talk about, so it has no chat.
  const canChat = lockedMode || !!versionDraft
  function openChat() {
    if (!id) return
    if (lockedMode) {
      navigate(`/worlds/${id}/prompt/${promptId}/chat`)
      return
    }
    if (versionDraft) {
      navigate(`/worlds/${id}/prompt/${versionDraft.sourcePromptId}/chat`, {
        state: { versionDraft: { ...versionDraft, promptText: prompt } },
      })
    }
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

  function handlePromptEdited(value: string) {
    setPrompt(value)
  }

  return (
    <div className={`page-fade-in page-width px-4 ${visibleActiveTab === 'prompt' ? `pt-6 ${needsFirstTakeScrollRoom ? 'pb-48' : 'pb-32'}` : 'pt-0'}`}>
      {visibleActiveTab === 'prompt' ? (
        <>
          {/* Passive: what the world will carry when Generate is tapped. Switching additions on
              and off lives on the Additions tab, not here. */}
          <AdditionsIndicator
            additions={additions}
            activeIds={activeIds}
            className="-mx-4 -mt-6 mb-1 w-[calc(100%+2rem)]"
          />

          <div className={`${complete ? 'mb-1' : ''} bg-paper/95 pb-1`}>
            {/* One row: what you're editing on the left, what you can do with it on the right. The
                label is kept short enough to share the line — on a phone, splitting the two apart
                just leaves two half-empty rows. */}
            {showHeaderRow && (
              <div className="flex items-center justify-between gap-3 px-2 pt-4">
                {headerLabel ? (
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="t-meta truncate text-ink-3">{headerLabel}</span>
                  </div>
                ) : (
                  <span aria-hidden="true" className="h-px flex-1 bg-paper-3/70" />
                )}
                <div className="flex shrink-0 items-center gap-3">
                  {lockedMode ? (
                    <>
                      {/* Only while the prompt is sitting still — once it's in the editor the text
                          is in flux, and the writer has the field itself to copy from. */}
                      <button
                        type="button"
                        aria-label={copied ? t.copied : t.copy}
                        className="inline-flex h-8 shrink-0 items-center justify-center px-1 text-ink-3 transition-colors active:text-ink disabled:pointer-events-none disabled:opacity-50"
                        onClick={copyPrompt}
                        disabled={!normalizedPrompt}
                      >
                        {copied ? (
                          <Check aria-hidden="true" className="h-4 w-4" />
                        ) : (
                          <Copy aria-hidden="true" className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        className={headerTextActionClass}
                        onClick={handleEditActivePrompt}
                        disabled={activeClusterId == null}
                      >
                        {t.edit}
                      </button>
                    </>
                  ) : (
                    <>
                      {/* Only an edit has something to go back to. A blank new prompt leaves by
                          the nav's back arrow, like every other screen. */}
                      {versionDraft && (
                        <button
                          type="button"
                          className={headerTextActionClass}
                          onClick={handleCancelVersionDraft}
                        >
                          {t.cancel}
                        </button>
                      )}
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
              pieceAdditionsLabel={additionsLabel}
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
        // The version history of this prompt, in the tab rather than a sheet over it: it is a
        // view of the same premise, not an interruption of it.
        <div className="pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <GenerateVersionsPanel
            worldId={id}
            currentPromptId={promptId ?? null}
            prompts={clusterPrompts}
            loading={clusterLoading || promptDetailsLoading}
            showDiff={showVersionDiff}
            onShowDiffChange={setShowVersionDiff}
            onViewPrompt={showPromptTab}
          />
        </div>
      )}

      {/* The chat about what is on this screen. Docked bottom-left, above the safe area: the app
          is held one-handed with the left thumb, and the generate CTA docks to the top. */}
      {visibleActiveTab === 'prompt' && canChat && (
        <button
          type="button"
          onClick={openChat}
          className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 z-30 inline-flex items-center gap-1.5 rounded-full bg-rose-pale px-3.5 py-2.5 font-serif-zh text-[13px] italic leading-none text-rose-deep shadow-(--shadow-cta) transition-transform active:translate-y-px"
        >
          <MessageCircle aria-hidden="true" className="h-4 w-4" />
          {t.chatTitle}
        </button>
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
