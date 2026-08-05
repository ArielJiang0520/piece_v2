import { useMemo, useState } from 'react'
import { Lightbulb } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import { entityLabel } from '@/config'
import { useUiText } from '@/i18n'
import ConfirmDialog from '@/components/ConfirmDialog'
import { useTopNavConfig } from '@/components/topNavConfig'
import { useLanguageId } from '@/preferences/language'
import CreateWorldTipsDialog from './CreateWorldTipsDialog'

interface World {
  id: number
  name: string
  body: string
  is_example: boolean
  updated_at: number
}

interface WorldListItem {
  is_example: boolean
}

// Creation-only: editing an existing world happens in place on its About screen.
export default function WorldEditor() {
  const language = useLanguageId()
  const t = useUiText()
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const createState = location.state as { name?: unknown; body?: unknown } | null
  const draftName = typeof createState?.name === 'string' ? createState.name : ''
  const draftBody = typeof createState?.body === 'string' ? createState.body : ''
  const [name, setName] = useState(draftName)
  const [body, setBody] = useState(draftBody)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [tipsOpen, setTipsOpen] = useState(false)
  const worldsQuery = useQuery({
    queryKey: ['worlds'],
    queryFn: () => apiFetch('/api/worlds') as Promise<WorldListItem[]>,
  })
  const isFirstUserWorld = worldsQuery.data?.every(world => world.is_example) === true
  const tipsAction = useMemo(() => (
    <button
      type="button"
      className="relative grid h-9 w-9 place-items-center rounded-full text-ink-3 transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30"
      aria-label={t.showEntityTips(entityLabel('world', {}, language))}
      title={t.entityTips(entityLabel('world', { capitalize: true }, language))}
      onClick={() => setTipsOpen(true)}
    >
      <Lightbulb aria-hidden="true" className="h-5 w-5" />
      {isFirstUserWorld && (
        <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose ring-2 ring-paper" aria-hidden="true" />
      )}
    </button>
  ), [isFirstUserWorld, language, t])

  const dirty = name !== draftName || body !== draftBody
  const canSave = name.trim().length > 0

  const saveMutation = useMutation({
    mutationFn: () =>
      apiFetch('/api/worlds', {
        method: 'POST',
        body: JSON.stringify({ name, body }),
      }) as Promise<World>,
    onSuccess: world => {
      queryClient.invalidateQueries({ queryKey: ['worlds'] })
      queryClient.setQueryData(['world', String(world.id)], world)
      navigate(`/worlds/${world.id}/about`)
    },
  })

  const saveError = useMemo(() => {
    if (!saveMutation.isError) return ''
    return saveMutation.error instanceof Error ? saveMutation.error.message : t.couldNotSave(entityLabel('world', {}, language))
  }, [language, saveMutation.error, saveMutation.isError, t])

  const editorActions = useMemo(() => (
    <div className="page-width border-b border-rose-line/80 px-4 pb-2">
      <div className="flex h-12 items-center gap-3">
        <button
          type="button"
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-full px-3.5 font-serif-zh text-[15px] italic leading-none text-ink-3 transition-[background-color,color,transform] duration-200 hover:-translate-y-px hover:bg-paper-2 hover:text-ink active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-4/50"
          onClick={cancel}
        >
          {t.cancel}
        </button>
        <div className="hidden min-w-0 flex-1 items-center justify-center gap-2 sm:flex">
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${dirty ? 'bg-rose' : 'bg-ink-4/45'}`}
            aria-hidden="true"
          />
          <span className="t-meta truncate text-ink-3">
            {dirty ? t.unsavedChanges : t.noChanges}
          </span>
        </div>
        <div className="flex-1 sm:hidden" aria-hidden="true" />
        <button
          type="button"
          className="inline-flex h-10 min-w-20 shrink-0 items-center justify-center rounded-full bg-rose px-4 font-serif-zh text-[15px] italic leading-none text-white shadow-(--shadow-cta) transition-[background-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:bg-rose-deep hover:shadow-(--shadow-cta-hover) focus:outline-none focus-visible:ring-4 focus-visible:ring-rose/25 disabled:pointer-events-none disabled:opacity-50"
          onClick={save}
          disabled={!canSave || saveMutation.isPending}
        >
          {saveMutation.isPending ? t.saving : t.save}
        </button>
      </div>
    </div>
  ), [body, canSave, dirty, language, name, saveMutation.isPending, t])

  useTopNavConfig({
    mainTitle: t.createEntity(entityLabel('world', { capitalize: true }, language)),
    backHref: '/worlds',
    rightAction: tipsAction,
    bottomSlot: editorActions,
  })

  function cancel() {
    if (dirty) {
      setConfirmCancel(true)
      return
    }
    navigate('/worlds')
  }

  function save() {
    if (!canSave || saveMutation.isPending) return
    saveMutation.mutate()
  }

  return (
    <>
      <div className="page-fade-in bg-paper">
        <div className="page-width flex min-h-below-nav flex-col px-6 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-7">
          {isFirstUserWorld && (
            <div className="rounded-md border border-rose-line bg-rose-pale/45 px-4 py-3">
              <p className="flex flex-col items-start gap-1 font-serif-zh text-[16px] leading-7 text-ink">
                {t.firstEntityQuestion(entityLabel('world', {}, language))}
                <button
                  type="button"
                  className="italic text-rose underline decoration-rose/35 underline-offset-4 transition-colors hover:text-rose-deep focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30"
                  onClick={() => setTipsOpen(true)}
                >
                  {t.readTipsFirst}
                </button>
              </p>
            </div>
          )}

          <label className={isFirstUserWorld ? 'mt-8 block' : 'block'}>
            <span className="t-eyebrow eyebrow-rule">{t.name}</span>
            <input
              value={name}
              onChange={event => setName(event.target.value)}
              className="mt-4 block w-full bg-transparent px-0 py-1 font-serif-zh text-[17px] leading-8 text-ink placeholder:text-ink-4 focus:outline-none focus-visible:outline focus-visible:outline-offset-4 focus-visible:outline-ink-4/70"
              placeholder={t.worldNamePlaceholder(entityLabel('world', { capitalize: true }, language))}
              autoFocus
            />
          </label>

          <label className="mt-10 flex min-h-0 flex-1 flex-col">
            <span className="t-eyebrow eyebrow-rule">{t.details}</span>
            <textarea
              value={body}
              onChange={event => setBody(event.target.value)}
              className="mt-4 min-h-[55svh] flex-1 resize-none border-l border-rose-line bg-transparent py-1 pl-5 pr-0 font-serif-zh text-[17px] leading-8 text-ink placeholder:text-ink-4 focus:outline-none focus-visible:border-ink-4"
              placeholder={t.worldDetailsPlaceholder}
            />
          </label>

          {saveError && (
            <p className="mt-4 rounded-md border border-rose/40 bg-rose-pale px-3 py-2 text-sm text-rose-deep">
              {saveError}
            </p>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title={t.discardChangesTitle}
        description={t.discardChangesDescription}
        confirmLabel={t.discard}
        onConfirm={() => navigate('/worlds')}
        onClose={() => setConfirmCancel(false)}
      />
      <CreateWorldTipsDialog open={tipsOpen} onClose={() => setTipsOpen(false)} />
    </>
  )
}
