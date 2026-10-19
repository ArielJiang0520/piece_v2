import { useEffect, useRef, useState } from 'react'
import { BookOpenText, Bot, EyeOff, ImagePlus, Plus, Trash2 } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import { useUiText } from '@/i18n'
import ConfirmDialog from '@/components/ConfirmDialog'
import Skeleton, { SkeletonText } from '@/components/Skeleton'
import TagInput from '@/components/TagInput'
import { AlbumStrip, CharacterPortrait, CoverSlot, PortraitSlot, WorldCover } from '@/components/WorldImages'
import { useAutosave } from '@/hooks/useAutosave'
import { PAIRINGS, type Pairing } from '@/pairings'
import { useLanguageId } from '@/preferences/language'
import { createRandomId } from '@/utils/id'
import { EMPTY_WORLD_BODY, type WorldBody } from '@/worldBody'
import type { CreatorWorldDetail } from '../worlds/shared/worldTypes'
import { CreatorWorldHeader } from './CreatorTabs'

interface Draft {
  name: string
  blurb: string
  pairings: Pairing[]
  tags: string[]
  body: WorldBody
}

const addClass = 'btn btn-secondary btn-block mt-3 border-dashed text-ink-2'

// The creator center's World tab, /worlds/:id/edit: the only place the author works on their world's
// description — the About screen shows them exactly what readers see. Everything autosaves to the
// draft; readers get it only on Publish (the status bar above the tabs, CreatorWorldHeader). The description is two groups: For readers (what the world's page shows)
// and For the AI (instructions only the model reads). Delete sits at the bottom. The creator center is a
// separate place, entered only from its home (/creator center), so back goes there and nothing links out.
// id 'new' (New world) is an empty editor stored nowhere until something is typed in it: the first
// save creates the world and swaps the URL to it, bringing its Scenes tab and Publish with it — so
// opening New world and backing out leaves nothing behind.
export default function CreatorWorld() {
  const { id } = useParams<{ id: string }>()
  const t = useUiText()
  const language = useLanguageId()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isNew = id === 'new'
  // A new world starts with one empty lore section, so the first thing to do is write in it.
  const [draft, setDraft] = useState<Draft | null>(isNew
    ? { name: '', blurb: '', pairings: [], tags: [], body: { ...EMPTY_WORLD_BODY, lore: [{ id: createRandomId(), title: '', body: '' }] } }
    : null)
  // The id a new world got on its first save, so later saves (even queued ones) edit it.
  const createdRef = useRef<string | null>(null)
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  // Author only; anyone else gets a 404 and is sent back to the world.
  const worldQuery = useQuery({
    queryKey: ['world-draft', id],
    queryFn: () => apiFetch(`/api/worlds/${id}/draft`) as Promise<CreatorWorldDetail>,
    enabled: !isNew,
  })
  const world = worldQuery.data

  useEffect(() => {
    if (worldQuery.isError) navigate('/creator-center', { replace: true })
  }, [id, navigate, worldQuery.isError])

  // Loaded once; after that the screen is the source of truth and autosave follows it.
  useEffect(() => {
    if (!world || draft) return
    setDraft({ name: world.name, blurb: world.blurb, pairings: world.pairings, tags: world.tags, body: world.body })
  }, [draft, world])

  const { status: saveStatus, flush } = useAutosave(draft, async value => {
    const worldId = createdRef.current ?? (isNew ? null : id)
    if (worldId === null) {
      const created = await apiFetch('/api/worlds', { method: 'POST', body: JSON.stringify({ ...value, language }) }) as { id: number }
      createdRef.current = String(created.id)
      // Left already (the save on the way out): no URL to swap.
      if (mountedRef.current) navigate(`/worlds/${created.id}/edit`, { replace: true })
    } else {
      await apiFetch(`/api/worlds/${worldId}`, { method: 'PATCH', body: JSON.stringify(value) })
      queryClient.invalidateQueries({ queryKey: ['world-draft', worldId] })
    }
    queryClient.invalidateQueries({ queryKey: ['creator-worlds'] })
  })

  const deleteMutation = useMutation({
    mutationFn: () => apiFetch(`/api/worlds/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      queryClient.invalidateQueries({ queryKey: ['creator-worlds'] })
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      queryClient.removeQueries({ queryKey: ['world', id] })
      queryClient.removeQueries({ queryKey: ['world-draft', id] })
      queryClient.removeQueries({ queryKey: ['world-scenes', id] })
      queryClient.removeQueries({ queryKey: ['creator-collections', id] })
      navigate('/creator-center', { replace: true })
    },
    onError: error => setDeleteError(error instanceof Error ? error.message : t.couldNotDeleteWorld),
  })

  function update(patch: Partial<Draft>) {
    setDraft(current => current && { ...current, ...patch })
  }

  function updateBody(edit: (body: WorldBody) => WorldBody) {
    setDraft(current => current && { ...current, body: edit(current.body) })
  }

  const header = <CreatorWorldHeader active="world" worldId={id} saveStatus={saveStatus} flush={flush} />

  if (!draft) {
    return (
      <div className="page-width px-4 pt-4">
        {header}
        <div className="card p-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="mt-4 h-11 w-full rounded-xl" />
        </div>
        <div className="card mt-4 p-4">
          <SkeletonText lineClassName="h-4" lines={6} />
        </div>
      </div>
    )
  }

  return (
    <>
      {header}
      <div className="page-fade-in">
        <div className="page-width flex flex-col gap-6 px-4 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-4">
          <section>
            <h2 className="t-section flex items-center gap-2">
              <BookOpenText aria-hidden="true" className="h-5 w-5 text-ink-3" />
              {t.forReaders}
            </h2>
            <p className="t-hint mt-1">{t.forReadersHint}</p>

            <div className="card mt-3 flex flex-col gap-5 p-4">
              <div>
                <span className="t-label mb-1.5">{t.cover}</span>
                {world?.cover_url
                  ? <WorldCover url={world.cover_url} name={draft.name} className="aspect-[2/1] rounded-xl" />
                  : <CoverSlot label={t.addCover} hint={t.imagesComingSoon} />}
              </div>

              <label className="block">
                <span className="t-label mb-1.5">{t.name}</span>
                <input
                  value={draft.name}
                  onChange={event => update({ name: event.target.value })}
                  className="input"
                  placeholder={t.worldNamePlaceholder}
                  autoFocus={isNew}
                />
              </label>

              <label className="block">
                <span className="t-label mb-1.5">{t.blurb}</span>
                <textarea
                  value={draft.blurb}
                  onChange={event => update({ blurb: event.target.value })}
                  className="textarea min-h-20"
                  placeholder={t.blurbPlaceholder}
                />
              </label>

              <div>
                <span className="t-label">{t.pairings}</span>
                <p className="t-hint mb-2">{t.pairingsHint}</p>
                <div className="flex flex-wrap gap-2">
                  {PAIRINGS.map(pairing => {
                    const on = draft.pairings.includes(pairing)
                    return (
                      <button
                        key={pairing}
                        type="button"
                        aria-pressed={on}
                        onClick={() => update({ pairings: PAIRINGS.filter(p => p === pairing ? !on : draft.pairings.includes(p)) })}
                        className="chip"
                      >
                        {t.pairingLabels[pairing]}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <span className="t-label mb-1.5">{t.tags}</span>
                <TagInput value={draft.tags} onChange={tags => update({ tags })} />
              </div>
            </div>

            <h3 className="t-section mt-6 flex items-center gap-2">
              {t.lore}
              {draft.body.lore.length > 0 && <span className="badge">{draft.body.lore.length}</span>}
            </h3>
            <div className="mt-3 flex flex-col gap-3">
              {draft.body.lore.map(section => (
                <div key={section.id} className="card p-4">
                  <div className="flex items-center gap-2">
                    <input
                      value={section.title}
                      onChange={event => updateBody(body => ({
                        ...body,
                        lore: body.lore.map(entry => entry.id === section.id ? { ...entry, title: event.target.value } : entry),
                      }))}
                      placeholder={t.sectionTitlePlaceholder}
                      className="input min-w-0 flex-1 font-semibold"
                    />
                    <button
                      type="button"
                      className="icon-btn text-signal-red"
                      aria-label={t.remove}
                      onClick={() => updateBody(body => ({ ...body, lore: body.lore.filter(entry => entry.id !== section.id) }))}
                    >
                      <Trash2 aria-hidden="true" className="h-5! w-5!" />
                    </button>
                  </div>
                  <textarea
                    value={section.body}
                    onChange={event => updateBody(body => ({
                      ...body,
                      lore: body.lore.map(entry => entry.id === section.id ? { ...entry, body: event.target.value } : entry),
                    }))}
                    placeholder={t.sectionBodyPlaceholder}
                    className="textarea mt-2.5 min-h-32"
                  />
                </div>
              ))}
            </div>
            <button
              type="button"
              className={addClass}
              onClick={() => updateBody(body => ({ ...body, lore: [...body.lore, { id: createRandomId(), title: '', body: '' }] }))}
            >
              <Plus aria-hidden="true" />
              {t.addSection}
            </button>

            <h3 className="t-section mt-6 flex items-center gap-2">
              {t.characters}
              {draft.body.characters.length > 0 && <span className="badge">{draft.body.characters.length}</span>}
            </h3>
            <div className="mt-3 flex flex-col gap-3">
              {draft.body.characters.map(character => (
                <div key={character.id} className="card p-4">
                  <div className="flex items-center gap-2">
                    {character.image_url
                      ? <CharacterPortrait url={character.image_url} name={character.name} className="h-11 w-11" />
                      : <PortraitSlot label={`${t.addCharacterPicture} · ${t.imagesComingSoon}`} />}
                    <input
                      value={character.name}
                      onChange={event => updateBody(body => ({
                        ...body,
                        characters: body.characters.map(entry => entry.id === character.id ? { ...entry, name: event.target.value } : entry),
                      }))}
                      placeholder={t.characterNamePlaceholder}
                      className="input min-w-0 flex-1 font-semibold"
                    />
                    <button
                      type="button"
                      className="icon-btn text-signal-red"
                      aria-label={t.remove}
                      onClick={() => updateBody(body => ({ ...body, characters: body.characters.filter(entry => entry.id !== character.id) }))}
                    >
                      <Trash2 aria-hidden="true" className="h-5! w-5!" />
                    </button>
                  </div>
                  <textarea
                    value={character.body}
                    onChange={event => updateBody(body => ({
                      ...body,
                      characters: body.characters.map(entry => entry.id === character.id ? { ...entry, body: event.target.value } : entry),
                    }))}
                    placeholder={t.characterBodyPlaceholder}
                    className="textarea mt-2.5 min-h-32"
                  />
                </div>
              ))}
            </div>
            <button
              type="button"
              className={addClass}
              onClick={() => updateBody(body => ({ ...body, characters: [...body.characters, { id: createRandomId(), name: '', body: '', image_url: null }] }))}
            >
              <Plus aria-hidden="true" />
              {t.addCharacter}
            </button>

            <h3 className="t-section mt-6 flex items-center gap-2">
              {t.album}
              {world && world.album.length > 0 && <span className="badge">{world.album.length}</span>}
            </h3>
            {world && world.album.length > 0 && (
              <div className="mt-3">
                <AlbumStrip photos={world.album} />
              </div>
            )}
            {/* Disabled until uploads exist. */}
            <button type="button" disabled className={addClass}>
              <ImagePlus aria-hidden="true" />
              {t.addPhotos}
              <span className="badge">{t.imagesComingSoon}</span>
            </button>
          </section>

          <section>
            <h2 className="t-section flex items-center gap-2">
              <Bot aria-hidden="true" className="h-5 w-5 text-ink-3" />
              {t.forTheAi}
            </h2>
            <p className="t-hint mt-1">{t.forTheAiHint}</p>
            <p className="callout mt-3">
              <EyeOff aria-hidden="true" />
              {t.forTheAiCaution}
            </p>
            <div className="card mt-3 p-4">
              <label className="block">
                <span className="t-label mb-1.5">{t.instructions}</span>
                <textarea
                  value={draft.body.instructions}
                  onChange={event => updateBody(body => ({ ...body, instructions: event.target.value }))}
                  placeholder={t.instructionsPlaceholder}
                  className="textarea min-h-60"
                />
              </label>
            </div>
          </section>

          {/* Nothing to delete until the world exists. */}
          {!isNew && (
            <button
              type="button"
              onClick={() => {
                setDeleteError('')
                setConfirmDelete(true)
              }}
              className="btn btn-danger btn-block mt-4"
            >
              <Trash2 aria-hidden="true" />
              {t.deleteWorld}
            </button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={t.deleteWorldTitle}
        description={t.deleteWorldDescription}
        confirmLabel={t.yesDelete}
        pendingLabel={t.deleting}
        isPending={deleteMutation.isPending}
        error={deleteError}
        onConfirm={() => {
          if (!deleteMutation.isPending) deleteMutation.mutate()
        }}
        onClose={() => {
          if (!deleteMutation.isPending) setConfirmDelete(false)
        }}
      />
    </>
  )
}
