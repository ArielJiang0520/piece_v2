import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../api'
import { relativeTime } from '../utils/time'
import { useTopNavConfig } from '../ui/TopNav'

interface Piece {
  id: number
  world_id: number
  prompt_id: number
  prompt: string
  body: string
  model: string | null
  created_at: number
}

export default function Piece() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const pieceQuery = useQuery({
    queryKey: ['piece', id],
    queryFn: () => apiFetch(`/api/pieces/${id}`) as Promise<Piece>,
    enabled: !!id,
  })
  const piece = pieceQuery.data ?? null
  const backHref = piece
    ? `/worlds/${piece.world_id}/prompts/${piece.prompt_id}`
    : undefined
  useTopNavConfig({ title: 'Piece', backHref })

  useEffect(() => {
    if (pieceQuery.isError) navigate('/')
  }, [pieceQuery.isError, navigate])

  const deleteMutation = useMutation({
    mutationFn: () => apiFetch(`/api/pieces/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      const piece = pieceQuery.data
      if (!piece) return
      const worldId = String(piece.world_id)
      queryClient.removeQueries({ queryKey: ['piece', id] })
      queryClient.invalidateQueries({ queryKey: ['world', worldId] })
      queryClient.invalidateQueries({ queryKey: ['world-clusters', worldId] })
      queryClient.invalidateQueries({ queryKey: ['cluster', worldId] })
      queryClient.invalidateQueries({ queryKey: ['prompt', worldId, String(piece.prompt_id)] })
      navigate(`/worlds/${piece.world_id}`)
    },
  })

  function deletePiece() {
    if (!pieceQuery.data || deleteMutation.isPending) return
    deleteMutation.mutate()
  }

  if (!piece) return <div className="page-width p-6 text-ink-3">Loading...</div>

  return (
    <div className="page-width min-h-svh px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-6">
      <p className="font-serif-zh text-ink-2 text-sm mb-8 italic">"{piece.prompt}"</p>

      <div className="mb-12">
        <p className="prose whitespace-pre-wrap">{piece.body}</p>
      </div>

      <div className="border-t border-paper-3 pt-6 flex items-center justify-between">
        <span className="text-ink-3 text-xs">{relativeTime(piece.created_at)}</span>
        {!confirmDelete ? (
          <button
            className="text-ink-3 hover:text-rose-deep text-sm transition-colors"
            onClick={() => setConfirmDelete(true)}
          >
            Delete
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-ink-3 text-sm">Delete this piece?</span>
            <button
              className="bg-rose-deep hover:bg-rose text-white rounded-sm px-3 py-1 text-sm transition-colors"
              onClick={deletePiece}
            >
              Yes, delete
            </button>
            <button
              className="text-ink-3 hover:text-ink text-sm"
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
