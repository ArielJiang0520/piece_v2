import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
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

interface AdminUsageSummary {
  request_count: number
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  reasoning_tokens: number
  cached_tokens: number
  cache_write_tokens: number
  cost_microcredits: number
}

interface AdminUsageModel extends AdminUsageSummary {
  model: string
}

interface AdminUsageResponse {
  user: {
    id: number
    username: string
  }
  window: {
    month: string
    start_at: number
    end_at: number
  }
  total: AdminUsageSummary
  models: AdminUsageModel[]
}

type AdminView = 'usage' | 'prompts'

function formatDate(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatInteger(value: number) {
  return Math.round(value).toLocaleString()
}

function formatCredits(microcredits: number) {
  if (microcredits <= 0) return '0 credits'

  const credits = microcredits / 1_000_000
  const minimumFractionDigits = credits < 0.01 ? 6 : 2
  return `${credits.toLocaleString(undefined, {
    minimumFractionDigits,
    maximumFractionDigits: 6,
  })} credits`
}

function usageTokenBreakdown(usage: AdminUsageSummary) {
  const parts = [
    `${formatInteger(usage.prompt_tokens)} prompt`,
    `${formatInteger(usage.completion_tokens)} completion`,
  ]
  if (usage.reasoning_tokens > 0) parts.push(`${formatInteger(usage.reasoning_tokens)} reasoning`)
  if (usage.cached_tokens > 0) parts.push(`${formatInteger(usage.cached_tokens)} cached`)
  if (usage.cache_write_tokens > 0) parts.push(`${formatInteger(usage.cache_write_tokens)} cache write`)
  return parts.join(' - ')
}

function monthKeyFromDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function isMonthKey(value: string | null): value is string {
  return !!value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
}

function shiftMonthKey(monthKey: string, delta: number) {
  const [yearPart, monthPart] = monthKey.split('-')
  const date = new Date(Number(yearPart), Number(monthPart) - 1 + delta, 1)
  return monthKeyFromDate(date)
}

function formatMonthLabel(monthKey: string) {
  const [yearPart, monthPart] = monthKey.split('-')
  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric',
  }).format(new Date(Number(yearPart), Number(monthPart) - 1, 1))
}

function formatUsageWindow(startAt: number, endAt: number) {
  const start = new Date(startAt)
  const end = new Date(endAt - 1)
  const sameYear = start.getFullYear() === end.getFullYear()
  const sameMonth = sameYear && start.getMonth() === end.getMonth()

  if (sameMonth) {
    return `${new Intl.DateTimeFormat(undefined, { month: 'short' }).format(start)} ${start.getDate()}-${end.getDate()}, ${end.getFullYear()}`
  }

  return `${formatDate(startAt)} - ${formatDate(endAt - 1)}`
}

function isAdminView(value: string | null): value is AdminView {
  return value === 'usage' || value === 'prompts'
}

export default function AdminDashboard() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [usersRequested, setUsersRequested] = useState(false)
  const currentUsageMonth = useMemo(() => monthKeyFromDate(new Date()), [])
  const selectedUserId = (searchParams.get('user') ?? '').trim()
  const requestedAdminView = searchParams.get('view')
  const activeView: AdminView = isAdminView(requestedAdminView) ? requestedAdminView : 'usage'
  const showingUsage = activeView === 'usage'
  const showingPrompts = activeView === 'prompts'
  const requestedUsageMonth = searchParams.get('usageMonth')
  const selectedUsageMonth = isMonthKey(requestedUsageMonth) ? requestedUsageMonth : currentUsageMonth
  const nextUsageMonthDisabled = selectedUsageMonth >= currentUsageMonth

  useTopNavConfig({ mainTitle: 'Admin', backHref: '/worlds' })

  const usersQuery = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => apiFetch('/api/admin/users') as Promise<AdminUser[]>,
    enabled: usersRequested,
  })

  const worldsQuery = useQuery({
    queryKey: ['admin-user-worlds', selectedUserId],
    queryFn: () => apiFetch(`/api/admin/users/${encodeURIComponent(selectedUserId)}/worlds`) as Promise<AdminWorldsResponse>,
    enabled: selectedUserId.length > 0 && showingPrompts,
  })

  const usageQuery = useQuery({
    queryKey: ['admin-user-usage', selectedUserId, selectedUsageMonth],
    queryFn: () => apiFetch(`/api/admin/users/${encodeURIComponent(selectedUserId)}/usage?month=${encodeURIComponent(selectedUsageMonth)}`) as Promise<AdminUsageResponse>,
    enabled: selectedUserId.length > 0 && showingUsage,
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
  const usage = usageQuery.data
  const usageWindowLabel = usage?.window
    ? formatUsageWindow(usage.window.start_at, usage.window.end_at)
    : formatMonthLabel(selectedUsageMonth)
  const activeQueryError = showingUsage ? usageQuery.error : worldsQuery.error
  const loadError = usersQuery.error ?? activeQueryError
  const selectedUserIsInList = users.some(user => String(user.id) === selectedUserId)
  const selectedUser = usageQuery.data?.user ?? worldsQuery.data?.user
  const selectedUserLabel = selectedUser?.username
    ? `${selectedUser.id} · ${selectedUser.username}`
    : `User id ${selectedUserId}`

  function requestUsers() {
    setUsersRequested(true)
  }

  function handleUserChange(nextUserId: string) {
    setSearchParams(prev => {
      const params = new URLSearchParams(prev)
      if (nextUserId) params.set('user', nextUserId)
      else params.delete('user')
      return params
    })
  }

  function handleUsageMonthChange(nextMonth: string) {
    setSearchParams(prev => {
      const params = new URLSearchParams(prev)
      if (nextMonth === currentUsageMonth) params.delete('usageMonth')
      else params.set('usageMonth', nextMonth)
      return params
    })
  }

  function handleViewChange(nextView: AdminView) {
    setSearchParams(prev => {
      const params = new URLSearchParams(prev)
      if (nextView === 'usage') params.delete('view')
      else params.set('view', nextView)
      return params
    })
  }

  return (
    <div className="page-fade-in min-h-screen bg-paper">
      <main className="page-width px-6 pb-24 pt-5">
        <div className="border-b border-rose-line/70 pb-5">
          <label className="t-eyebrow block" htmlFor="admin-user-id">User id</label>
          <select
            id="admin-user-id"
            value={selectedUserId}
            onPointerDown={requestUsers}
            onFocus={requestUsers}
            onChange={event => handleUserChange(event.target.value)}
            className="mt-3 h-11 w-full rounded-md border border-rose-line bg-paper px-3 font-mono text-sm text-ink outline-none transition-colors focus:border-rose focus:ring-2 focus:ring-rose/20"
          >
            <option value="">
              {usersQuery.isLoading ? 'Loading users...' : 'Select a user'}
            </option>
            {selectedUserId && !selectedUserIsInList && (
              <option value={selectedUserId}>{selectedUserLabel}</option>
            )}
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
        ) : usersQuery.isLoading || (selectedUserId && (showingUsage ? usageQuery.isLoading : worldsQuery.isLoading)) ? (
          <div className="pt-7">
            <Skeleton className="mb-4 h-3 w-40" />
            <Skeleton className="h-8 w-3/4" />
            <SkeletonText className="mt-5" lineClassName="h-3" lines={4} />
          </div>
        ) : usersRequested && users.length === 0 ? (
          <p className="t-meta pt-8">No users.</p>
        ) : !selectedUserId ? (
          <p className="t-meta pt-8">Select a user to load their worlds.</p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4 border-b border-rose-line/70 py-4">
              <div className="t-eyebrow min-w-0 truncate">
                {selectedUser?.username ?? 'User'} · id {selectedUserId}
              </div>
              {showingPrompts && (
                <div className="t-meta shrink-0">
                  {worlds.length} worlds · {clusterCount} clusters · {promptCount} prompts
                </div>
              )}
            </div>

            <nav className="grid grid-cols-2 border-b border-rose-line/70" aria-label="Admin view">
              <button
                type="button"
                className={`-mb-px h-11 border-b-2 t-eyebrow transition-colors ${showingUsage ? 'border-rose text-ink!' : 'border-transparent text-ink-3! hover:text-ink!'}`}
                aria-current={showingUsage ? 'page' : undefined}
                onClick={() => handleViewChange('usage')}
              >
                Usage
              </button>
              <button
                type="button"
                className={`-mb-px h-11 border-b-2 t-eyebrow transition-colors ${showingPrompts ? 'border-rose text-ink!' : 'border-transparent text-ink-3! hover:text-ink!'}`}
                aria-current={showingPrompts ? 'page' : undefined}
                onClick={() => handleViewChange('prompts')}
              >
                Prompts
              </button>
            </nav>

            {showingUsage && (
              <section className="border-b border-rose-line/70 py-5">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="t-eyebrow">Usage</h2>
                  <div className="t-meta shrink-0">
                    {formatInteger(usage?.total.request_count ?? 0)} calls
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-4">
                  <button
                    type="button"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-3 transition-colors hover:text-ink disabled:pointer-events-none disabled:opacity-30"
                    aria-label="Previous usage month"
                    onClick={() => handleUsageMonthChange(shiftMonthKey(selectedUsageMonth, -1))}
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <div className="min-w-0 text-center">
                    <div className="font-serif-zh text-[18px] italic leading-tight text-ink">
                      {formatMonthLabel(selectedUsageMonth)}
                    </div>
                    <div className="t-meta mt-1">{usageWindowLabel}</div>
                  </div>
                  <button
                    type="button"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-3 transition-colors hover:text-ink disabled:pointer-events-none disabled:opacity-30"
                    aria-label="Next usage month"
                    disabled={nextUsageMonthDisabled}
                    onClick={() => handleUsageMonthChange(shiftMonthKey(selectedUsageMonth, 1))}
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                {usage && usage.total.request_count > 0 ? (
                  <>
                    <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4">
                      <UsageMetric label="Total tokens" value={formatInteger(usage.total.total_tokens)} />
                      <UsageMetric label="Total price" value={formatCredits(usage.total.cost_microcredits)} />
                      <UsageMetric label="Prompt tokens" value={formatInteger(usage.total.prompt_tokens)} />
                      <UsageMetric label="Completion tokens" value={formatInteger(usage.total.completion_tokens)} />
                    </div>

                    <ul className="hairline-list mt-5 border-y border-rose-line/70">
                      {usage.models.map(modelUsage => (
                        <li key={modelUsage.model} className="py-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <div className="wrap-break-word font-mono text-[12px] leading-snug text-ink">
                                {modelUsage.model}
                              </div>
                              <div className="t-meta mt-2">
                                {formatInteger(modelUsage.total_tokens)} tokens - {usageTokenBreakdown(modelUsage)}
                              </div>
                            </div>
                            <div className="t-meta shrink-0 text-right">
                              {formatInteger(modelUsage.request_count)} calls
                              <br />
                              {formatCredits(modelUsage.cost_microcredits)}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="t-meta mt-4">No recorded model usage.</p>
                )}
              </section>
            )}

            {showingPrompts && (worlds.length === 0 ? (
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
            ))}
          </>
        )}
      </main>
    </div>
  )
}

interface UsageMetricProps {
  label: string
  value: string
}

function UsageMetric({ label, value }: UsageMetricProps) {
  return (
    <div className="min-w-0">
      <div className="wrap-break-word font-serif-zh text-[22px] italic leading-tight text-rose-deep">
        {value}
      </div>
      <div className="t-eyebrow mt-1">{label}</div>
    </div>
  )
}
