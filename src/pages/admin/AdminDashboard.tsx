import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import Skeleton, { SkeletonText } from '@/components/Skeleton'
import { useTopNavConfig } from '@/components/topNavConfig'

interface AdminUser {
  id: number
  username: string
  created_at: number
}

interface AdminPrompt {
  id: number
  text: string
  piece_count: number
  is_favorite: boolean
  created_at: number
  updated_at: number
}

interface AdminCluster {
  id: number | null
  prompt_count: number
  piece_count: number
  latest_prompt_id: number | null
  created_at: number
  updated_at: number
  title: string
  prompts: AdminPrompt[]
}

interface AdminWorld {
  id: number
  name: string
  body: string
  is_example: boolean
  created_at: number
  updated_at: number
  clusters: AdminCluster[]
}

interface AdminWorldsResponse {
  user: {
    id: number
    username: string
  }
  worlds: AdminWorld[]
}

function formatDate(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

export default function AdminDashboard() {
  const [selectedUserId, setSelectedUserId] = useState('')

  useTopNavConfig({ mainTitle: 'Admin', backHref: '/worlds' })

  const usersQuery = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => apiFetch('/api/admin/users') as Promise<AdminUser[]>,
  })

  useEffect(() => {
    if (selectedUserId || !usersQuery.data?.length) return
    setSelectedUserId(String(usersQuery.data[0].id))
  }, [selectedUserId, usersQuery.data])

  const worldsQuery = useQuery({
    queryKey: ['admin-user-worlds', selectedUserId],
    queryFn: () => apiFetch(`/api/admin/users/${selectedUserId}/worlds`) as Promise<AdminWorldsResponse>,
    enabled: selectedUserId.length > 0,
  })

  const promptCount = useMemo(() => (
    worldsQuery.data?.worlds.reduce((total, world) => (
      total + world.clusters.reduce((clusterTotal, cluster) => clusterTotal + cluster.prompts.length, 0)
    ), 0) ?? 0
  ), [worldsQuery.data])

  const clusterCount = useMemo(() => (
    worldsQuery.data?.worlds.reduce((total, world) => total + world.clusters.length, 0) ?? 0
  ), [worldsQuery.data])

  const users = usersQuery.data ?? []
  const worlds = worldsQuery.data?.worlds ?? []
  const loadError = usersQuery.error ?? worldsQuery.error

  return (
    <div className="page-fade-in min-h-screen bg-paper">
      <main className="page-width px-6 pb-24 pt-5">
        <div className="border-b border-rose-line/70 pb-5">
          <label className="t-eyebrow block" htmlFor="admin-user-id">User id</label>
          <select
            id="admin-user-id"
            value={selectedUserId}
            onChange={event => setSelectedUserId(event.target.value)}
            className="mt-3 h-11 w-full rounded-md border border-rose-line bg-paper px-3 font-mono text-sm text-ink outline-none transition-colors focus:border-rose focus:ring-2 focus:ring-rose/20"
            disabled={usersQuery.isLoading || users.length === 0}
          >
            {users.map(user => (
              <option key={user.id} value={user.id}>
                {user.id} · {user.username}
              </option>
            ))}
          </select>
        </div>

        {loadError ? (
          <p className="t-meta pt-8 text-signal-red">
            {loadError instanceof Error ? loadError.message : 'Could not load admin data'}
          </p>
        ) : usersQuery.isLoading || (selectedUserId && worldsQuery.isLoading) ? (
          <div className="pt-7">
            <Skeleton className="mb-4 h-3 w-40" />
            <Skeleton className="h-8 w-3/4" />
            <SkeletonText className="mt-5" lineClassName="h-3" lines={4} />
          </div>
        ) : users.length === 0 ? (
          <p className="t-meta pt-8">No users.</p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4 border-b border-rose-line/70 py-4">
              <div className="t-eyebrow min-w-0 truncate">
                {worldsQuery.data?.user.username ?? 'User'} · id {selectedUserId}
              </div>
              <div className="t-meta shrink-0">
                {worlds.length} worlds · {clusterCount} clusters · {promptCount} prompts
              </div>
            </div>

            {worlds.length === 0 ? (
              <p className="t-meta pt-8">No worlds for this user.</p>
            ) : (
              <ul className="hairline-list flex flex-col">
                {worlds.map(world => (
                  <li key={world.id} className="py-7">
                    <div className="mb-3 flex items-center justify-between gap-4">
                      <div className="t-eyebrow min-w-0 truncate">
                        World {world.id} · updated {formatDate(world.updated_at)}
                      </div>
                      {world.is_example && (
                        <span className="shrink-0 rounded-full bg-rose-pale px-2 py-1 font-serif-zh text-xs italic leading-none text-rose-deep">
                          sample
                        </span>
                      )}
                    </div>

                    <h2 className="t-headline">{world.name}</h2>

                    {world.body.trim() && (
                      <details className="mt-4">
                        <summary className="t-meta cursor-pointer select-none transition-colors hover:text-ink">
                          World body
                        </summary>
                        <p className="mt-3 whitespace-pre-wrap font-serif-zh text-[14px] leading-7 text-ink-2">
                          {world.body}
                        </p>
                      </details>
                    )}

                    {world.clusters.length === 0 ? (
                      <p className="t-meta mt-6">No prompt clusters.</p>
                    ) : (
                      <div className="mt-7 flex flex-col gap-7">
                        {world.clusters.map(cluster => (
                          <details key={cluster.id ?? `unclustered-${world.id}`}>
                            <summary className="cursor-pointer select-none transition-colors hover:text-ink">
                              <span className="flex items-center justify-between gap-4">
                                <span className="font-serif-zh text-[15px] italic leading-snug text-ink">
                                  {cluster.id === null ? 'Unclustered' : `Cluster ${cluster.id}`}
                                </span>
                                <span className="t-meta shrink-0">
                                  {cluster.prompts.length} prompts · {cluster.piece_count} takes
                                </span>
                              </span>
                            </summary>

                            <ul className="hairline-list mt-3 border-y border-rose-line/70">
                              {cluster.prompts.map(prompt => (
                                <li key={prompt.id} className="py-4">
                                  <div className="t-eyebrow mb-2 flex items-center justify-between gap-4">
                                    <span>Prompt {prompt.id} · {prompt.piece_count} takes</span>
                                    <span className="truncate text-right">{formatDate(prompt.updated_at)}</span>
                                  </div>
                                  <p className="whitespace-pre-wrap font-serif-zh text-[14px] leading-7 text-ink-2">
                                    {prompt.text}
                                  </p>
                                </li>
                              ))}
                            </ul>
                          </details>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
  )
}
