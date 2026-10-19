import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import { MODELS } from '@/preferences/generationModel'
import { useLanguageId, type LanguageId } from '@/preferences/language'
import { useUiText } from '@/i18n'
import { containsChineseText } from '@/preferences/readingSpeed'
import { relativeTime } from '@/utils/time'
import type { StoryDetail, StoryStripStory } from '../../shared/types'

interface UseSavedStoryOptions {
  // Changing this (the scene id) clears the current selection so a different scene's page
  // doesn't keep the previously selected story.
  resetKey: string
  sceneStories: StoryStripStory[]
  activeSceneStoryCount: number
}

// The static scene page's story selection + display labels. Only ever deals with
// saved stories — there is no pending/streaming story here.
export function useSavedStory({
  resetKey,
  sceneStories,
  activeSceneStoryCount,
}: UseSavedStoryOptions) {
  const language = useLanguageId()
  const t = useUiText()
  const [selectedStoryId, setSelectedStoryId] = useState<number | null>(null)
  const latestStoryId = sceneStories[0]?.id ?? null

  const selectedStoryQuery = useQuery({
    queryKey: ['story', selectedStoryId],
    queryFn: () => apiFetch(`/api/stories/${selectedStoryId}`) as Promise<StoryDetail>,
    enabled: selectedStoryId != null,
  })
  const selectedStory = selectedStoryQuery.data ?? null

  useEffect(() => {
    setSelectedStoryId(null)
  }, [resetKey])

  // Default to the latest saved story.
  useEffect(() => {
    if (selectedStoryId !== null || latestStoryId === null) return
    setSelectedStoryId(latestStoryId)
  }, [latestStoryId, selectedStoryId])

  const selectedStoryIndex = selectedStoryId === null
    ? -1
    : sceneStories.findIndex(story => story.id === selectedStoryId)
  const storyNumber = selectedStoryIndex >= 0
    ? Math.max(1, activeSceneStoryCount - selectedStoryIndex)
    : null

  const body = selectedStory?.body ?? ''
  const structure = selectedStory?.structure ?? null
  const countLabel = outputCountLabel(body, language)
  // updated_at only moves past created_at when the story is resumed and re-saved,
  // so the edited segment appears only on stories that were actually continued.
  const editedLabel = selectedStory && selectedStory.updated_at > selectedStory.created_at
    ? ` - ${t.storyEdited(relativeTime(selectedStory.updated_at, language))}`
    : ''
  const metaLabel = selectedStory
    ? `${relativeTime(selectedStory.created_at, language)}${editedLabel} - ${countLabel}`
    : null
  const modelLabel = selectedStory?.model
    ? `${MODELS.find(m => m.id === selectedStory.model)?.label ?? selectedStory.model} (${selectedStory.provider || 'Unknown Provider'})`
    : null
  const footerStatsLabel = language === 'zh' ? `${countLabel}已生成` : `${countLabel} generated`
  return {
    selectedStoryId,
    selectStory: (storyId: number) => setSelectedStoryId(storyId),
    body,
    structure,
    complete: !!selectedStory,
    outdated: selectedStory?.outdated ?? false,
    storyNumber,
    metaLabel,
    modelLabel,
    footerStatsLabel,
  }
}

function outputCountLabel(text: string, language: LanguageId) {
  if (language === 'zh') {
    const count = Array.from(text).filter(character => !/\s/u.test(character)).length
    return `${count.toLocaleString()}个字`
  }

  if (containsChineseText(text)) {
    const count = Array.from(text).filter(character => !/\s/u.test(character)).length
    return `${count.toLocaleString()} ${count === 1 ? 'character' : 'characters'}`
  }

  const count = text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length ?? 0
  return `${count.toLocaleString()} ${count === 1 ? 'word' : 'words'}`
}
