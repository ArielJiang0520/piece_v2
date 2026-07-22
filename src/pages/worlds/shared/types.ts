import type { PieceStructure } from './pieceStructure'

export type { PieceAction, PieceSegment, PieceStructure } from './pieceStructure'

export const PIECE_STRIP_LIMIT = 24

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

// Carried in router state when editing an existing prompt into a new version. Both the
// static prompt page and the generate screen read it back out of `location.state`.
export interface VersionDraftState {
  promptText: string
  sourcePromptId: number
  sourceClusterId: number
  versionNumber: number
}

export function parseVersionDraft(value: unknown): VersionDraftState | null {
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

export interface PieceStripPiece {
  id: number
  created_at: number
  // Equals created_at until the piece is resumed and re-saved; a later updated_at marks
  // it as the most-recently-continued piece without disturbing the creation-order numbering.
  updated_at: number
}

export interface SaveResponse {
  promptId: number
  pieceId: number
  pieceCount: number
  clusterId: number | null
  // Whether the reader's taste profile actually shaped this generation (toggle on AND they
  // had a non-empty profile for this world).
  usedTaste: boolean
}

export interface PromptDetail {
  id: number
  text: string
  cluster_id: number | null
  // The prompt this one was derived from ("More like this"). Null unless it descends from another.
  similar_to_prompt_id: number | null
  piece_count: number
  created_at: number
  updated_at: number
}

export interface PromptPiecesResponse {
  prompt: PromptDetail
  pieces: PieceStripPiece[]
}

export interface PieceDetail {
  id: number
  prompt: string
  body: string
  // Recorded action history. Null for legacy plain-text pieces (never edited since the
  // structured format was introduced).
  structure: PieceStructure | null
  model: string | null
  provider: string | null
  used_taste: boolean
  created_at: number
  // Equals created_at until the piece is resumed and re-saved (see PieceStripPiece).
  updated_at: number
}

export interface OverwritePieceResponse {
  id: number
  prompt_id: number
  body: string
  structure: PieceStructure | null
  model: string | null
  provider: string | null
  used_taste: boolean
  created_at: number
  updated_at: number
}

export interface ClusterResponse {
  cluster: {
    id: number
    prompt_count: number
    piece_count: number
    latest_prompt_id: number | null
    // The world version this cluster belongs to (the version its latest prompt was created on).
    // version_number/name are null when that version was deleted (orphaned) or is unset.
    world_version_id: number | null
    version_number: number | null
    version_name: string | null
    created_at: number
    updated_at: number
    title: string
  }
  prompts: ClusterPrompt[]
}

export interface ClusterPrompt {
  id: number
  text: string
  piece_count: number
  created_at: number
  updated_at: number
}
