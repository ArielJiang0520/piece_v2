import type { Pairing } from '@/pairings'
import type { WorldBody, WorldChangeKind } from '@/worldBody'

// One world as every list shows it (GET /api/worlds/feed, /library) and the base of the detail.
export interface WorldCard {
  id: number
  name: string
  blurb: string
  author: string
  published: boolean
  // The cover picture. Null until uploads exist; a placeholder stands in.
  cover_url: string | null
  // The author's draft differs from what was last published. Only meaningful to the author.
  has_draft_changes: boolean
  updated_at: number
  scene_count: number
  words: number
  readers: number
  bookmarked: boolean
  // The requesting user wrote this world.
  is_author: boolean
  // In the list's order (src/pairings.ts).
  pairings: Pairing[]
  tags: string[]
}

// GET /api/worlds/:id: body is the published text, the same for everyone, author included (with
// instructions blank). GET /api/worlds/:id/draft: the author's draft, for the editor.
export interface WorldDetail extends WorldCard {
  body: WorldBody
  // How many worlds the author has published. GET /worlds/:id only (not the creator center's /draft).
  author_world_count?: number
  // The album: ambience photos in the author's order. Empty until uploads exist.
  album: WorldPhoto[]
}

export interface WorldPhoto {
  id: number
  url: string
}

// One of the author's scenes, as readers see it: its description. The instruction the model is
// given is the author's only (CreatorSceneDetail). updated_at is when the instruction last changed,
// which is what makes a reader's earlier story of it outdated.
export interface SceneItem {
  id: number
  description: string
  updated_at: number
}

// One of the author's collections, in the author's order, with its scenes in order.
export interface CollectionItem {
  id: number
  name: string
  description: string
  // Optional context every scene in it shares: the model gets it with each, readers read it on the
  // collection's page. '' when there is none.
  premise: string
  tags: string[]
  scenes: SceneItem[]
}

// GET /api/worlds/:id/scenes: the published collections (none empty) and scenes.
export interface WorldScenesResponse {
  collections: CollectionItem[]
  // The "No collection" group, in order.
  uncollected: SceneItem[]
}

// GET /api/worlds/:id/draft: the world as the author's draft has it (name, blurb, tags, pairings,
// body with instructions), for the creator center.
export interface CreatorWorldDetail extends WorldDetail {
  // What stands in the way of publishing the draft: no name, a collection without a name, or a scene
  // without its description or instruction. null when it can be published.
  publish_blocker: 'name' | 'collection_name' | 'unfinished' | null
}

// The creator center works on the world's draft, where collections and scenes are named by draft keys.
// GET /api/worlds/:id/creator-center/collections: every collection, empty ones included.
export interface CreatorTree {
  collections: CreatorCollectionItem[]
  uncollected: CreatorSceneItem[]
}

export interface CreatorSceneItem {
  id: string
  description: string
  instruction_written: boolean
}

export interface CreatorCollectionItem {
  id: string
  name: string
  description: string
  premise: string
  tags: string[]
  scenes: CreatorSceneItem[]
}

// GET /api/worlds/:id/creator-center/collections/:collectionId
export interface CreatorCollectionDetail extends CreatorCollectionItem {
  // Readers' saved stories of its published scenes: what deleting them would take, on Publish.
  story_count: number
}

// GET /api/worlds/:id/creator-center/scenes/:sceneId
export interface CreatorSceneDetail {
  id: string
  description: string
  instruction: string
  // The draft key of its collection; null: No collection.
  collection_id: string | null
  // Readers' saved stories of it, if it has been published.
  story_count: number
}

export interface WorldChangeItem {
  id: number
  kind: WorldChangeKind
  label: string
  created_at: number
}

export interface TagCount {
  name: string
  count: number
}
