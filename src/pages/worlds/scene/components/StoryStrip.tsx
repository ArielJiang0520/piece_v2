import { History } from 'lucide-react'
import { useUiText } from '@/i18n'
import { useLanguageId } from '@/preferences/language'
import type { StoryStripStory } from '../../shared/types'

const RESUME_DOT_WINDOW_MS = 48 * 60 * 60 * 1000

interface StoryStripProps {
  stories: StoryStripStory[]
  sceneStoryCount: number
  selectedStoryId: number | null
  onSelectStory: (storyId: number) => void
}

export default function StoryStrip({
  stories,
  sceneStoryCount,
  selectedStoryId,
  onSelectStory,
}: StoryStripProps) {
  const language = useLanguageId()
  const t = useUiText()
  const showOverflowHint = stories.length > 2

  // The story continued most recently (a resume/re-save pushes updated_at past created_at),
  // marked with a dot so it's findable without reordering the creation-numbered strip. The
  // dot decays after RESUME_DOT_WINDOW_MS so it flags *recent* activity, not any past resume.
  const now = Date.now()
  let recentlyResumedId: number | null = null
  let latestResumeAt = 0
  for (const story of stories) {
    if (
      story.updated_at > story.created_at &&
      now - story.updated_at < RESUME_DOT_WINDOW_MS &&
      story.updated_at > latestResumeAt
    ) {
      latestResumeAt = story.updated_at
      recentlyResumedId = story.id
    }
  }

  return (
    <div className="relative border-b border-line px-2 py-3">
      {showOverflowHint && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-3 right-0 top-3 z-10 w-10 bg-linear-to-l from-surface via-surface/90 to-transparent sm:hidden"
        />
      )}
      <div className={`flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${showOverflowHint ? 'pr-8 sm:pr-0' : ''}`}>
        {stories.map((story, index) => {
          const storyNumber = Math.max(1, sceneStoryCount - index)
          const selected = selectedStoryId === story.id
          const recentlyResumed = recentlyResumedId === story.id

          return (
            <button
              key={story.id}
              type="button"
              className="chip relative"
              onClick={() => onSelectStory(story.id)}
              aria-pressed={selected}
            >
              {t.storyTitle(storyNumber)}
              {story.outdated && <History aria-label={t.outdated} className="h-3.5 w-3.5 text-ink-4" />}
              {recentlyResumed && (
                <span
                  aria-hidden="true"
                  className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-rose"
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
