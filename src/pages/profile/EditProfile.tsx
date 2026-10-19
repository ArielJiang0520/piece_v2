import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import { useAuth } from '@/auth'
import { useUiText } from '@/i18n'
import { SkeletonText } from '@/components/Skeleton'
import { useTopNavConfig } from '@/components/topNavConfig'
import { useAutosave } from '@/hooks/useAutosave'
import { AutosaveIndicator } from '../creator-center/CreatorTabs'
import type { ProfileResponse } from './Profile'

// The signed-in user's own profile fields, /profile/edit. Autosaves like the creator center; Back returns
// to the profile, handing back where the profile itself was opened from.
export default function EditProfile() {
  const t = useUiText()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const username = user?.username ?? ''
  const [bio, setBio] = useState<string | null>(null)
  const from = (useLocation().state as { from?: string } | null)?.from

  const profileQuery = useQuery({
    queryKey: ['profile', username],
    queryFn: () => apiFetch(`/api/users/${encodeURIComponent(username)}`) as Promise<ProfileResponse>,
    enabled: !!username,
  })

  // Loaded once; after that the field is the source of truth and autosave follows it.
  useEffect(() => {
    if (profileQuery.data && bio === null) setBio(profileQuery.data.bio)
  }, [bio, profileQuery.data])

  const { status } = useAutosave(bio, async value => {
    await apiFetch('/api/users/me', { method: 'PATCH', body: JSON.stringify({ bio: value }) })
    queryClient.invalidateQueries({ queryKey: ['profile', username] })
  })

  const topRight = useMemo(() => <AutosaveIndicator status={status} />, [status])
  const backState = useMemo(() => ({ from }), [from])
  useTopNavConfig({
    mainTitle: t.editProfile,
    backHref: `/u/${encodeURIComponent(username)}`,
    backState,
    rightAction: topRight,
  })

  return (
    <div className="page-fade-in page-width px-4 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-4">
      <div className="card p-4">
        {bio === null ? (
          <SkeletonText lineClassName="h-4" lines={4} />
        ) : (
          <label className="block">
            <span className="t-label mb-1.5">{t.bio}</span>
            <textarea
              value={bio}
              onChange={event => setBio(event.target.value)}
              placeholder={t.bioPlaceholder}
              className="textarea min-h-40"
            />
          </label>
        )}
      </div>
    </div>
  )
}
