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
}

export interface SaveResponse {
  promptId: number
  pieceId: number
  pieceCount: number
  clusterId: number | null
}

export interface PromptDetail {
  id: number
  text: string
  cluster_id: number | null
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
  body: string
  model: string | null
  provider: string | null
  created_at: number
}

export interface OverwritePieceResponse {
  id: number
  prompt_id: number
  body: string
  model: string | null
  provider: string | null
  created_at: number
}

export interface ClusterResponse {
  cluster: {
    id: number
    prompt_count: number
    piece_count: number
    latest_prompt_id: number | null
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
