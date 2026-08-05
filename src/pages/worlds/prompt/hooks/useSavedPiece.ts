import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import { MODELS } from '@/preferences/generationModel'
import { useLanguageId, type LanguageId } from '@/preferences/language'
import { useUiText } from '@/i18n'
import { containsChineseText } from '@/preferences/readingSpeed'
import { relativeTime } from '@/utils/time'
import type { PieceDetail, PieceStripPiece } from '../../shared/types'
import { describeAdditionIds, sameAdditionSet, type WorldAddition } from '../../shared/useWorldAdditions'

interface UseSavedPieceOptions {
  lockedMode: boolean
  // Changing this (the prompt id, or 'new') clears the current selection so a new
  // prompt page doesn't keep the previously selected piece.
  resetKey: string
  promptPieces: PieceStripPiece[]
  activePromptPieceCount: number
  // The world's additions and the reader's currently switched-on set, for the provenance line:
  // which additions this piece was written with, and whether that still matches.
  additions: WorldAddition[]
  activeAdditionIds: number[]
}

// The static prompt page's piece selection + display labels. Only ever deals with
// saved pieces — there is no pending/streaming piece here.
export function useSavedPiece({
  lockedMode,
  resetKey,
  promptPieces,
  activePromptPieceCount,
  additions,
  activeAdditionIds,
}: UseSavedPieceOptions) {
  const language = useLanguageId()
  const t = useUiText()
  const [selectedPieceId, setSelectedPieceId] = useState<number | null>(null)
  const latestPieceId = promptPieces[0]?.id ?? null

  const selectedPieceQuery = useQuery({
    queryKey: ['piece', selectedPieceId],
    queryFn: () => apiFetch(`/api/pieces/${selectedPieceId}`) as Promise<PieceDetail>,
    enabled: selectedPieceId != null,
  })
  const selectedPiece = selectedPieceQuery.data ?? null

  useEffect(() => {
    setSelectedPieceId(null)
  }, [resetKey])

  // Default to the latest saved piece for an existing prompt.
  useEffect(() => {
    if (!lockedMode || selectedPieceId !== null || latestPieceId === null) return
    setSelectedPieceId(latestPieceId)
  }, [latestPieceId, lockedMode, selectedPieceId])

  const selectedPieceIndex = selectedPieceId === null
    ? -1
    : promptPieces.findIndex(piece => piece.id === selectedPieceId)
  const pieceNumber = selectedPieceIndex >= 0
    ? Math.max(1, activePromptPieceCount - selectedPieceIndex)
    : null

  const body = selectedPiece?.body ?? ''
  const structure = selectedPiece?.structure ?? null
  const countLabel = outputCountLabel(body, language)
  // updated_at only moves past created_at when the piece is resumed and re-saved,
  // so the edited segment appears only on pieces that were actually continued.
  const editedLabel = selectedPiece && selectedPiece.updated_at > selectedPiece.created_at
    ? ` - ${t.pieceEdited(relativeTime(selectedPiece.updated_at, language))}`
    : ''
  const metaLabel = selectedPiece
    ? `${relativeTime(selectedPiece.created_at, language)}${editedLabel} - ${countLabel}`
    : null
  const modelLabel = selectedPiece?.model
    ? `${MODELS.find(m => m.id === selectedPiece.model)?.label ?? selectedPiece.model} (${selectedPiece.provider || 'Unknown Provider'})`
    : null
  const footerStatsLabel = language === 'zh' ? `${countLabel}已生成` : `${countLabel} generated`
  const tasteLabel = selectedPiece?.used_taste ? t.tasteShaped : null
  // Which additions this piece was written with. Said out loud because continuing it uses that
  // set rather than whatever is switched on now — and because an addition deleted since is a
  // piece that can no longer be continued as it was written.
  const stampedIds = selectedPiece?.addition_ids ?? []
  const { names: stampedNames, missingCount } = describeAdditionIds(additions, stampedIds)
  const additionsLabel = stampedIds.length === 0
    ? null
    : [
      stampedNames.length > 0 ? t.writtenWithAdditions(stampedNames.join(' · ')) : null,
      missingCount > 0 ? t.additionsDeletedSince(missingCount) : null,
      missingCount === 0 && !sameAdditionSet(stampedIds, activeAdditionIds) ? t.additionsDifferFromCurrent : null,
    ].filter(Boolean).join(' - ')

  return {
    selectedPieceId,
    selectPiece: (pieceId: number) => setSelectedPieceId(pieceId),
    body,
    structure,
    complete: !!selectedPiece,
    pieceNumber,
    metaLabel,
    modelLabel,
    tasteLabel,
    additionsLabel,
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
