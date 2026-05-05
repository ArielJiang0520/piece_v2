import type { HTMLAttributes } from 'react'

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  className?: string
}

export default function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={['animate-pulse rounded-sm bg-paper-3/70', className].filter(Boolean).join(' ')}
      {...props}
    />
  )
}

interface SkeletonTextProps {
  className?: string
  lineClassName?: string
  lines?: number
}

export function SkeletonText({ className, lineClassName, lines = 1 }: SkeletonTextProps) {
  const widths = ['w-full', 'w-11/12', 'w-4/5', 'w-2/3']

  return (
    <div className={['space-y-2', className].filter(Boolean).join(' ')}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          className={[
            'h-3.5',
            widths[index % widths.length],
            lineClassName,
          ].filter(Boolean).join(' ')}
        />
      ))}
    </div>
  )
}
