import { Bookmark, BookOpen, UserRound, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import RelativeTimeStatus from '@/components/RelativeTimeStatus'
import { WorldCover } from '@/components/WorldImages'
import { useUiText } from '@/i18n'
import { useLanguageId } from '@/preferences/language'
import { formatCompact } from '@/utils/formatCount'
import type { WorldCard } from '../worlds/shared/worldTypes'

interface WorldCardItemProps {
  world: WorldCard
  // In the creator center's list of the author's own worlds: show draft/publish state instead of the
  // byline, and open the world's creator center. Anywhere else a card is the same for everyone.
  showPublishState?: boolean
}

// The whole card is the button: cover, title, blurb, a row of icon-labelled facts, then tags.
export default function WorldCardItem({ world, showPublishState = false }: WorldCardItemProps) {
  const t = useUiText()
  const language = useLanguageId()
  const navigate = useNavigate()
  const stateLabel = !world.published
    ? t.notPublished
    : world.has_draft_changes ? t.unpublishedChanges : null
  const label = showPublishState ? stateLabel : null

  return (
    <li>
      <button
        type="button"
        className="card card-press block w-full overflow-hidden text-left"
        onClick={() => navigate(showPublishState ? `/worlds/${world.id}/edit` : `/worlds/${world.id}`)}
      >
        <WorldCover url={world.cover_url} name={world.name} className="aspect-[5/2]" />
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className="t-headline min-w-0 flex-1 text-[18px] wrap-break-word">{world.name || t.untitled}</div>
            {world.bookmarked && !showPublishState && (
              <Bookmark aria-label={t.bookmarked} className="mt-0.5 h-5 w-5 shrink-0 fill-rose text-rose" />
            )}
            {label && <span className="badge badge-rose">{label}</span>}
          </div>
  
          {world.blurb && (
            <p className="t-body mt-1.5 line-clamp-3 whitespace-pre-line">{world.blurb}</p>
          )}
  
          {(world.pairings.length > 0 || world.tags.length > 0) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {world.pairings.map(pairing => <span key={pairing} className="badge badge-rose">{t.pairingLabels[pairing]}</span>)}
              {world.tags.map(tag => <span key={tag} className="tag">{tag}</span>)}
            </div>
          )}
  
          <div className="t-meta mt-3 flex flex-wrap items-center gap-x-3.5 gap-y-1">
            {!showPublishState && (
              <span className="inline-flex items-center gap-1">
                <UserRound aria-hidden="true" className="h-3.5 w-3.5" />
                {world.author}
              </span>
            )}
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
          <RelativeTimeStatus className="mt-1" timestamp={world.updated_at} prefix={t.updatedPrefix} />
        </div>
      </button>
    </li>
  )
}
