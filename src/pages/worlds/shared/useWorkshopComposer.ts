import { useState } from 'react'

// The one text box in a prompt workshop does two jobs: write the next round, or rewrite the ask
// behind a round already taken. Rewriting is entered from the trail and left through Cancel or a
// finished redo — either way whatever was half-typed towards the next round comes back, because
// going in to fix an earlier ask is a detour from that thought, not a replacement for it.
export function useWorkshopComposer() {
  const [note, setNote] = useState('')
  // Which round the box is rewriting; null while it is writing the next one.
  const [editingRound, setEditingRound] = useState<number | null>(null)
  const [stashed, setStashed] = useState('')

  function beginEdit(index: number, text: string) {
    // Only the first step in stashes — moving between rounds without leaving must not overwrite
    // the note the writer was actually composing with an old ask.
    if (editingRound === null) setStashed(note)
    setEditingRound(index)
    setNote(text)
  }

  function leaveEdit() {
    if (editingRound === null) return
    setEditingRound(null)
    setNote(stashed)
    setStashed('')
  }

  function reset() {
    setEditingRound(null)
    setNote('')
    setStashed('')
  }

  return { note, setNote, editingRound, beginEdit, leaveEdit, reset }
}
