import { SkeletonText } from '@/components/Skeleton'

interface SceneCardProps {
  scene: string
  loading: boolean
}

// The scene as readers see it: its description. Read-only.
export default function SceneCard({ scene, loading }: SceneCardProps) {
  if (loading) return <SkeletonText className="mt-3" lineClassName="h-4" lines={3} />
  return (
    <p className="mt-2 whitespace-pre-wrap text-[17px] leading-relaxed text-ink">
      {scene}
    </p>
  )
}
