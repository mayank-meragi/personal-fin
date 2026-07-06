import { useEffect, useState } from 'react'
import { Dumbbell } from 'lucide-react'
import { cn } from '@/lib/utils'
import { exerciseImageUrl } from '../lib/exerciseDb'
import type { Exercise } from '../lib/types'

/** Thumbnail: first frame, graceful fallback icon. */
export function ExerciseThumb({ exercise, className }: { exercise?: Exercise; className?: string }) {
  const [failed, setFailed] = useState(false)
  const src = exercise?.images[0]
  if (!src || failed) {
    return (
      <span
        className={cn(
          'flex shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface-sunken)] text-[var(--text-muted)]',
          className,
        )}
      >
        <Dumbbell className="size-[45%]" strokeWidth={2} />
      </span>
    )
  }
  return (
    <img
      src={exerciseImageUrl(src)}
      alt={exercise.name}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn('shrink-0 rounded-[var(--radius-md)] bg-white object-cover object-top', className)}
    />
  )
}

/** Detail image: alternates the start/end frames for a simple animation. */
export function ExerciseAnimation({ exercise, className }: { exercise: Exercise; className?: string }) {
  const [frame, setFrame] = useState(0)
  const frames = exercise.images
  useEffect(() => {
    if (frames.length < 2) return
    const t = setInterval(() => setFrame((f) => (f + 1) % frames.length), 1100)
    return () => clearInterval(t)
  }, [frames.length])
  if (frames.length === 0) return null
  return (
    <div className={cn('overflow-hidden rounded-[var(--radius-lg)] bg-white', className)}>
      <img src={exerciseImageUrl(frames[frame])} alt={exercise.name} className="aspect-[16/10] w-full object-contain" />
    </div>
  )
}
