import { useEffect } from 'react'
import { Pencil } from 'lucide-react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import { useUiText } from '@/i18n'
import Skeleton, { SkeletonText } from '@/components/Skeleton'
import TabBar from '@/components/TabBar'
import { useTopNavConfig } from '@/components/topNavConfig'
import { useLanguageId } from '@/preferences/language'
import WorldCardItem from '../home/WorldCardItem'
import type { WorldCard } from '../worlds/shared/worldTypes'

export interface ProfileResponse {
  username: string
  bio: string
  is_me: boolean
  created: WorldCard[]
  bookmarked: WorldCard[]
}

export type ProfileTab = 'created' | 'bookmarked'

// A user's profile, the same for everyone: their card (who they are), and under it two tabs — the
// worlds they created (/u/:username, published only; unpublished ones live in the creator center) and the
// worlds they bookmarked (/u/:username/bookmarked). The tabs stick under the top bar on scroll. Reached from a world's Author card, which passes itself as
// `from` so Back returns there (the tabs keep it), or from the menu, where it is top level.
export default function Profile({ tab }: { tab: ProfileTab }) {
  const t = useUiText()
  const language = useLanguageId()
  const navigate = useNavigate()
  const { username } = useParams<{ username: string }>()
  const from = (useLocation().state as { from?: string } | null)?.from

  const profileQuery = useQuery({
    queryKey: ['profile', username],
    queryFn: () => apiFetch(`/api/users/${encodeURIComponent(username ?? '')}`) as Promise<ProfileResponse>,
    enabled: !!username,
  })
  const profile = profileQuery.data

  useEffect(() => {
    if (profileQuery.isError) navigate('/', { replace: true })
  }, [navigate, profileQuery.isError])

  const base = `/u/${encodeURIComponent(username ?? '')}`
  useTopNavConfig({ mainTitle: username, backHref: from })

  if (!profile) {
    return (
      <div className="page-width px-4 pt-5">
        <div className="card p-4">
          <Skeleton className="h-14 w-14 rounded-full" />
          <SkeletonText className="mt-4" lineClassName="h-4" lines={3} />
        </div>
      </div>
    )
  }

  const worlds = tab === 'created' ? profile.created : profile.bookmarked

  return (
    <div className="page-fade-in">
      <div className="page-width px-4 pt-5">
        <header className="card p-4">
          <div className="flex items-center gap-3.5">
            {/* Stands in until profiles have pictures. */}
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-rose text-[22px] font-bold text-white">
              {profile.username.trim().charAt(0).toUpperCase()}
            </span>
            <h1 className="t-title min-w-0 flex-1 truncate">{profile.username}</h1>
          </div>
          {profile.bio && <p className="t-body mt-3.5 whitespace-pre-wrap">{profile.bio}</p>}
          {profile.is_me && (
            <Link to="/profile/edit" state={{ from }} className="btn btn-secondary btn-sm mt-4">
              <Pencil aria-hidden="true" />
              {t.editProfile}
            </Link>
          )}
        </header>
      </div>

      <div className="sticky top-12 z-10 mt-4">
        <TabBar
          active={tab}
          replace
          label={profile.username}
          tabs={[
            { id: 'created', label: t.createdWorlds, to: base, count: profile.created.length },
            { id: 'bookmarked', label: t.bookmarkedWorlds, to: `${base}/bookmarked`, count: profile.bookmarked.length },
          ]}
        />
      </div>

      <main className="page-width px-4 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-4">
        {worlds.length === 0 ? (
          <p className="t-meta px-1">{t.noWorldsYet}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {worlds.map(world => (
              <WorldCardItem key={world.id} world={world} />
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
