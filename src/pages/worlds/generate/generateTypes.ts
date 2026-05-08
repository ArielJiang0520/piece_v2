import type { PieceStripPiece } from './PieceStrip'

export const PIECE_STRIP_LIMIT = 24

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export interface SaveResponse {
  promptId: number
  pieceId: number
  pieceCount: number
  clusterId: number | null
}

export interface PromptDetail {
  cluster_id: number | null
  piece_count: number
}

export interface PromptPiecesResponse {
  prompt: PromptDetail
  pieces: PieceStripPiece[]
}

export interface PieceDetail {
  id: number
  body: string
  model: string | null
  created_at: number
}

export interface ClusterResponse {
  prompts: Array<{
    id: number
  }>
}
