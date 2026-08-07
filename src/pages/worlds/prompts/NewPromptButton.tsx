import { Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { entityLabel } from '@/config'
import { useUiText } from '@/i18n'
import { useLanguageId } from '@/preferences/language'

interface NewPromptButtonProps {
  worldId: string | undefined
}

// There is one way to arrive at a prompt: the editor. AI writes one there too, from the sheet over
// it — so this is a single action rather than a menu of two. It floats in the bottom corner instead
// of taking a row of the pinned bar, where it never eats into the list.
export default function NewPromptButton({ worldId }: NewPromptButtonProps) {
  const t = useUiText()
  const language = useLanguageId()
  const label = t.newEntity(entityLabel('prompt', { capitalize: true }, language))

  return (
    <Link
      to={`/worlds/${worldId}/prompt/new`}
      aria-label={label}
      className="fixed bottom-[calc(1.75rem+env(safe-area-inset-bottom))] right-6 z-40 grid h-14 w-14 place-items-center rounded-full bg-rose text-white shadow-(--shadow-feather) transition-[background-color,transform] duration-200 active:translate-y-px active:bg-rose-deep"
    >
      <Plus aria-hidden="true" className="h-6 w-6 stroke-[1.8]" />
    </Link>
  )
}
