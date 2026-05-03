import { useParams } from 'react-router-dom'
import { useTopNavConfig } from '../../ui/TopNav'

export default function WorldExplore() {
  const { id } = useParams<{ id: string }>()
  useTopNavConfig({ title: 'Explore', backHref: id ? `/worlds/${id}` : '/worlds' })

  return (
    <div className="min-h-screen bg-paper" />
  )
}
