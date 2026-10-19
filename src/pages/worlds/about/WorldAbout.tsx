import { useEffect, useMemo } from 'react'
import { BookOpen, Bookmark, BookmarkCheck, ChevronRight, History, UserRound, Users } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import RelativeTimeStatus from '@/components/RelativeTimeStatus'
import Skeleton, { SkeletonText } from '@/components/Skeleton'
import { useTopNavConfig } from '@/components/topNavConfig'
import { AlbumStrip, CharacterPortrait, WorldCover } from '@/components/WorldImages'
import { useUiText } from '@/i18n'
import { useLanguageId } from '@/preferences/language'
import { formatCompact } from '@/utils/formatCount'
import { isWorldBodyEmpty } from '@/worldBody'
import WorldTabs from '../shared/WorldTabs'
import type { WorldDetail } from '../shared/worldTypes'
import { useBookmark } from './useBookmark'

// What everyone reads about a world, the author included: the published text. The author's only
// difference is "Your world" where readers have Bookmark. They work on it in the creator center, which is
// reached from the menu, never from here.
export default function WorldAbout() {
  const t = useUiText()
  const language = useLanguageId()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const worldQuery = useQuery({
    queryKey: ['world', id],
    queryFn: () => apiFetch(`/api/worlds/${id}`) as Promise<WorldDetail>,
    enabled: !!id,
  })
  const world = worldQuery.data
  const bookmark = useBookmark(id, world?.bookmarked ?? false)

  useEffect(() => {
    if (worldQuery.isError) navigate('/')
  }, [navigate, worldQuery.isError])

  const worldTabs = useMemo(
    () => <WorldTabs active="about" worldId={id} sceneCount={world?.scene_count} />,
    [id, world?.scene_count],
  )
  useTopNavConfig({ backHref: '/', bottomSlot: worldTabs })


  if (!world) {
    return (
      <div className="page-width px-4 pt-4">
        <Skeleton className="h-11 w-36 rounded-xl" />
        <div className="card mt-4 p-4">
          <Skeleton className="h-6 w-2/3" />
          <SkeletonText className="mt-4" lineClassName="h-4" lines={4} />
        </div>
      </div>
    )
  }

  const characters = world.body.characters.filter(character => character.name.trim() || character.body.trim())
  const lore = world.body.lore.filter(section => section.title.trim() || section.body.trim())

  return (
    <div className="page-fade-in">
      {/* The action row, pinned under the tabs. Left-biased: held one-handed with the left thumb. */}
      <div className="sticky top-[93px] z-10 border-b border-line bg-surface">
        <div className="page-width flex items-center gap-2.5 px-4 py-2.5">
          {/* Readers bookmark; an author can't bookmark their own world, so it just says so. */}
          {world.is_author ? (
            <span className="badge badge-rose">
              <UserRound aria-hidden="true" />
              {t.yourWorld}
            </span>
          ) : (
            <button
              type="button"
              aria-pressed={world.bookmarked}
              onClick={bookmark.toggle}
              className={`btn btn-sm ${world.bookmarked ? 'btn-secondary' : 'btn-primary'}`}
            >
              {world.bookmarked
                ? <BookmarkCheck aria-hidden="true" className="fill-rose text-rose" />
                : <Bookmark aria-hidden="true" />}
              {world.bookmarked ? t.bookmarked : t.bookmark}
            </button>
          )}
        </div>
      </div>

      <div className="page-width flex flex-col gap-3 px-4 pb-32 pt-4">
        <header className="card overflow-hidden">
          <WorldCover url={world.cover_url} name={world.name} className="aspect-[2/1]" />
          <div className="p-4">
            <h1 className="t-title wrap-break-word">{world.name}</h1>
            {world.blurb && (
              <p className="t-body mt-2 whitespace-pre-wrap">{world.blurb}</p>
            )}
            {(world.pairings.length > 0 || world.tags.length > 0) && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {world.pairings.map(pairing => <span key={pairing} className="badge badge-rose">{t.pairingLabels[pairing]}</span>)}
                {world.tags.map(tag => <span key={tag} className="tag">{tag}</span>)}
              </div>
            )}
            <div className="t-meta mt-3 flex flex-wrap items-center gap-x-3.5 gap-y-1">
              {world.words > 0 && (
                <>
                  <span className="inline-flex items-center gap-1">
                    <BookOpen aria-hidden="true" className="h-3.5 w-3.5" />
                    {t.wordCount(formatCompact(world.words, language))}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Users aria-hidden="true" className="h-3.5 w-3.5" />
                    {t.readerCount(world.readers)}
                  </span>
                </>
              )}
            </div>
            {world.published && (
              <Link
                to={`/worlds/${id}/changes`}
                className="-mx-4 -mb-4 mt-4 flex items-center gap-3 border-t border-line px-4 py-3 active:bg-paper-2"
              >
                <History aria-hidden="true" className="h-5 w-5 shrink-0 text-ink-3" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-ink">{t.updateHistory}</span>
                  <RelativeTimeStatus timestamp={world.updated_at} prefix={t.updatedPrefix} />
                </span>
                <ChevronRight aria-hidden="true" className="h-5 w-5 shrink-0 text-ink-4" />
              </Link>
            )}
          </div>
        </header>

        {/* Who wrote it, its own card right under the intro, labelled inside the way a lore section
            carries its title. Opens their profile, which comes back here. */}
        <Link
          to={`/u/${encodeURIComponent(world.author)}`}
          state={{ from: `/worlds/${id}` }}
          className="card card-press block p-4"
        >
          <span className="t-label">{t.author}</span>
          <span className="mt-2 flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-rose text-[16px] font-bold text-white">
              {world.author.trim().charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="t-headline block truncate">{world.author}</span>
              {world.author_world_count !== undefined && (
                <span className="t-meta block">{t.worldCount(world.author_world_count)}</span>
              )}
            </span>
            <ChevronRight aria-hidden="true" className="h-5 w-5 shrink-0 text-ink-4" />
          </span>
        </Link>

        {world.album.length > 0 && (
          <section className="card p-4">
            <h2 className="t-section flex items-center gap-2">
              {t.album}
              <span className="badge">{world.album.length}</span>
            </h2>
            <div className="mt-3">
              <AlbumStrip photos={world.album} />
            </div>
          </section>
        )}

        {isWorldBodyEmpty(world.body) ? (
          <p className="t-meta px-1 pt-2">{t.noBodyYet}</p>
        ) : (
          <>
            {lore.map(section => (
              <section key={section.id} className="card p-4">
                {section.title.trim() && <h2 className="t-section">{section.title}</h2>}
                <div className={`t-body whitespace-pre-wrap ${section.title.trim() ? 'mt-2' : ''}`}>{section.body}</div>
              </section>
            ))}

            {characters.length > 0 && (
              <section className="mt-4">
                <h2 className="t-section flex items-center gap-2 px-1">
                  {t.characters}
                  <span className="badge">{characters.length}</span>
                </h2>
                <div className="mt-3 flex flex-col gap-3">
                  {characters.map(character => (
                    <div key={character.id} className="card p-4">
                      <h3 className="flex items-center gap-3">
                        <CharacterPortrait url={character.image_url} name={character.name} />
                        <span className="t-headline min-w-0 truncate">{character.name || t.untitled}</span>
                      </h3>
                      {character.body.trim() && (
                        <div className="t-body mt-2.5 whitespace-pre-wrap">{character.body}</div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
