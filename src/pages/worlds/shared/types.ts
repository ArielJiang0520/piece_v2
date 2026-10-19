import type { StoryStructure } from './storyStructure'
import type { SceneItem } from './worldTypes'

export type { StoryAction, StorySegment, StoryStructure } from './storyStructure'

export const STORY_STRIP_LIMIT = 24

export interface StoryStripStory {
  id: number
  created_at: number
  // Equals created_at until the story is resumed and re-saved; a later updated_at marks
  // it as the most-recently-continued story without disturbing the creation-order numbering.
  updated_at: number
  // The scene's instruction changed after this story was made: it can be read, not resumed.
  outdated: boolean
}

export interface SaveResponse {
  sceneId: number
  storyId: number
}

export interface SceneDetail extends SceneItem {
  collection: { id: number; name: string } | null
  // This reader's own saved stories of it — what numbers them.
  story_count: number
}

export interface SceneStoriesResponse {
  scene: SceneDetail
  stories: StoryStripStory[]
}

export interface StoryDetail {
  id: number
  scene_id: number
  // See StoryStripStory.
  outdated: boolean
  body: string
  // Recorded action history. Null for legacy plain-text stories (never edited since the
  // structured format was introduced).
  structure: StoryStructure | null
  model: string | null
  provider: string | null
  created_at: number
  // Equals created_at until the story is resumed and re-saved (see StoryStripStory).
  updated_at: number
}
