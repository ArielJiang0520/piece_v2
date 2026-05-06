import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../api'
import { entityLabel } from '../config'
import { relativeTime } from '../utils/time'
import ConfirmDialog from '../components/ConfirmDialog'
import DeleteIconButton from '../components/DeleteIconButton'
import Skeleton, { SkeletonText } from '../components/Skeleton'
import { useTopNavConfig } from '../components/topNavConfig'

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
  const [deleteError, setDeleteError] = useState('')

  const pieceQuery = useQuery({
    queryKey: ['piece', id],
    queryFn: () => apiFetch(`/api/pieces/${id}`) as Promise<Piece>,
    enabled: !!id,
  })
  const piece = pieceQuery.data ?? null
  const backHref = piece
    ? `/worlds/${piece.world_id}/prompts/${piece.prompt_id}`
    : undefined

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
      navigate(`/worlds/${piece.world_id}/prompts/${piece.prompt_id}`)
    },
    onError: e => {
      setDeleteError(e instanceof Error ? e.message : `Could not delete ${entityLabel('piece')}`)
    },
  })

  const navRightAction = useMemo(() => {
    if (!piece) return undefined

    return (
      <DeleteIconButton
        label={`Delete ${entityLabel('piece')}`}
        onClick={() => setConfirmDelete(true)}
        disabled={deleteMutation.isPending}
      />
    )
  }, [deleteMutation.isPending, piece])

  useTopNavConfig({
    secondaryTitle: entityLabel('piece', { capitalize: true }),
    backHref,
    rightAction: navRightAction,
  })

  useEffect(() => {
    if (pieceQuery.isError) navigate('/')
  }, [pieceQuery.isError, navigate])

  function deletePiece() {
    if (!pieceQuery.data || deleteMutation.isPending) return
    setDeleteError('')
    deleteMutation.mutate()
  }

  if (!piece) {
    return (
      <div className="page-width min-h-svh px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-6">
        <SkeletonText className="mb-8" lineClassName="h-4" lines={2} />
        <div className="mb-12 space-y-5">
          <SkeletonText lines={5} lineClassName="h-4" />
          <SkeletonText lines={4} lineClassName="h-4" />
          <SkeletonText lines={3} lineClassName="h-4" />
        </div>
        <div className="border-t border-paper-3 pt-6">
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
    )
  }

  return (
    <div className="page-width min-h-svh px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-6">
      <p className="font-serif-zh text-ink-2 text-sm mb-8 italic">"{piece.prompt}"</p>

      <div className="mb-12">
        <p className="prose whitespace-pre-wrap">{piece.body}</p>
      </div>

      <div className="border-t border-paper-3 pt-6">
        <span className="text-ink-3 text-xs">{relativeTime(piece.created_at)}</span>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete this ${entityLabel('piece')}?`}
        description={`This will permanently delete this ${entityLabel('piece')}.`}
        confirmLabel="Yes, delete"
        pendingLabel="Deleting..."
        isPending={deleteMutation.isPending}
        error={deleteError}
        onConfirm={deletePiece}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  )
}
