import { ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTopNavConfig } from '../../components/topNavConfig'

interface AdminTool {
  title: string
  description: string
  href: string
}

const TOOLS: AdminTool[] = [
  {
    title: 'Edit registers',
    description: 'Create, update, and delete registers.',
    href: '/admin/registers',
  },
]

export default function AdminTools() {
  const navigate = useNavigate()
  useTopNavConfig({ mainTitle: 'Admin Tools' })

  return (
    <div className="min-h-screen page-width">
      <main className="pb-[calc(6rem+env(safe-area-inset-bottom))] pt-2">
        <div className="flex flex-col gap-3 px-4">
          {TOOLS.map(tool => (
            <button
              key={tool.href}
              className="relative overflow-hidden rounded-md border border-paper-3 bg-paper px-5 py-4 text-left transition-colors before:absolute before:bottom-6 before:left-0 before:top-6 before:w-0.5 before:rounded-r-sm before:bg-rose before:opacity-0 before:transition-opacity hover:border-ink-4 hover:bg-paper-2 hover:before:opacity-100"
              onClick={() => navigate(tool.href)}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-serif-zh text-[19px] leading-snug text-ink">{tool.title}</div>
                  <div className="mt-1 text-xs text-ink-3">{tool.description}</div>
                </div>
                <ChevronRight aria-hidden="true" className="h-5 w-5 shrink-0 text-ink-4" />
              </div>
            </button>
          ))}
        </div>
      </main>
    </div>
  )
}
