import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTopNavConfig } from '@/components/topNavConfig'
import { useUiText } from '@/i18n'
import { setGenerationModel, useGenerationModel } from '@/preferences/generationModel'
import { useLanguageId } from '@/preferences/language'
import { useReadingFont } from '@/preferences/readingFont'
import { useReadingFontSize } from '@/preferences/readingFontSize'
import SceneCard from './components/SceneCard'
import StoryStrip from './components/StoryStrip'
import StoryView from './components/StoryView'
import GenerateControls from './components/GenerateControls'
import { useGenerateData } from './hooks/useGenerateData'
import { useSavedStory } from './hooks/useSavedStory'

// Height of the sticky top nav; the docked generate CTA and the marker rail sit below it.
const NAV_HEIGHT = 48
// The generate CTA once docked under the nav: a padded bar holding one button (py-2 + h-11 + border).
const DOCKED_CTA_HEIGHT = 61

// The static scene page: one of the author's scenes, this reader's saved stories of it, and the
// controls to start generating. Generating or resuming navigates to the separate generate screen —
// this page never streams or holds unsaved output. A story written before the author changed the
// scene is outdated: it still reads, but can't be resumed.
export default function ScenePage() {
  const language = useLanguageId()
  const t = useUiText()
  const { id, sceneId } = useParams<{ id: string; sceneId: string }>()
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const readingFont = useReadingFont()
  const readingFontSize = useReadingFontSize()
  const model = useGenerationModel()

  const { activeScene, sceneStories, sceneDetailsLoading } = useGenerateData({ worldId: id, sceneId })
  const scene = activeScene?.description ?? ''
  const activeSceneStoryCount = activeScene?.story_count ?? sceneStories.length

  const {
    selectedStoryId,
    selectStory,
    body,
    structure,
    complete,
    outdated,
    storyNumber,
    metaLabel,
    modelLabel,
    footerStatsLabel,
  } = useSavedStory({
    resetKey: sceneId ?? '',
    sceneStories,
    activeSceneStoryCount,
  })

  // Back goes up a level: to the collection's page when the scene is in one.
  useTopNavConfig({
    backHref: activeScene?.collection ? `/worlds/${id}/collections/${activeScene.collection.id}` : `/worlds/${id}/scenes`,
  })

  const needsFirstTakeScrollRoom = activeSceneStoryCount === 0
  const showStoryStrip = activeSceneStoryCount > 0
  // For now an outdated story can be resumed too.
  const canResume = complete && !!body // && !outdated

  useEffect(() => () => {
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
  }, [])

  async function copyScene() {
    try {
      await navigator.clipboard.writeText(scene)
    } catch {
      return
    }
    setCopied(true)
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
    copiedTimerRef.current = setTimeout(() => setCopied(false), 1600)
  }

  const generateDisabled = sceneDetailsLoading || !scene.trim()
  const genBase = `/worlds/${id}/scenes/${sceneId}/generate`

  function handleGenerate() {
    if (generateDisabled) return
    navigate(genBase)
  }

  // The paragraph the reader is currently on: the topmost one still below the sticky chrome
  // (nav + docked CTA). Read live from the DOM so either Resume button — the story-view one
  // or the docked controls one — resumes at the same place the screen was showing.
  function currentReadingParagraphIndex(): number | null {
    const threshold = NAV_HEIGHT + DOCKED_CTA_HEIGHT + 4
    for (const el of document.querySelectorAll<HTMLElement>('[data-paragraph-index]')) {
      if (el.getBoundingClientRect().bottom > threshold) {
        return Number(el.dataset.paragraphIndex)
      }
    }
    return null
  }

  function handleResume() {
    if (selectedStoryId === null || !canResume) return
    const idx = currentReadingParagraphIndex()
    const at = idx != null ? `&at=${idx}` : ''
    navigate(`${genBase}?resume=${selectedStoryId}${at}`)
  }

  return (
    <div className={`page-fade-in page-width px-4 pt-4 ${needsFirstTakeScrollRoom ? 'pb-48' : 'pb-32'}`}>
      <div className="card p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="t-label mb-0 truncate text-ink-3">
            {activeScene?.collection
              ? activeScene.collection.name || t.untitled
              : t.scene}
          </span>
          {activeScene && (
            <button
              type="button"
              className="btn btn-ghost btn-sm -my-1.5 -mr-2 px-2.5 text-ink-3"
              onClick={copyScene}
              disabled={!scene.trim()}
            >
              {copied ? <Check aria-hidden="true" className="text-signal-green" /> : <Copy aria-hidden="true" />}
              {copied ? t.copied : t.copy}
            </button>
          )}
        </div>
        <SceneCard scene={scene} loading={sceneDetailsLoading} />
      </div>

      <GenerateControls
        disabled={generateDisabled}
        hasExistingStories={activeSceneStoryCount > 0}
        model={model}
        onModelChange={setGenerationModel}
        onGenerate={handleGenerate}
        onResume={canResume ? handleResume : undefined}
        stickyTopOffset={NAV_HEIGHT}
      />

      <section className="card mt-1 px-2">
        {showStoryStrip && (
          <StoryStrip
            stories={sceneStories}
            sceneStoryCount={activeSceneStoryCount}
            selectedStoryId={selectedStoryId}
            onSelectStory={selectStory}
          />
        )}

        <StoryView
          body={body}
          structure={structure}
          complete={complete}
          storyMetaLabel={metaLabel}
          storyModelLabel={modelLabel}
          storyFooterStatsLabel={footerStatsLabel}
          readingFont={readingFont}
          readingFontSize={readingFontSize}
          // Below the sticky nav plus the docked generate CTA, which sits at the top of
          // the reading area while a story is scrolled into view.
          railTopOffset={NAV_HEIGHT + DOCKED_CTA_HEIGHT}
          onResume={canResume ? handleResume : undefined}
          // outdated={complete && outdated}
        />
      </section>
    </div>
  )
}
