import { useQuery } from '@tanstack/react-query'
import type { Exercise } from './types'

/**
 * free-exercise-db: 873 exercises, public domain, every one with step images.
 * One static JSON + images from a CDN — no key, no rate limits. Cached via the
 * Cache API so the library works offline in the gym after first load.
 */
const DB_URL = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/dist/exercises.json'
const IMG_BASE = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/'
const CACHE_NAME = 'pf-exercise-db'

export function exerciseImageUrl(imagePath: string): string {
  return IMG_BASE + imagePath
}

export async function fetchExercises(): Promise<Exercise[]> {
  try {
    const cache = await caches.open(CACHE_NAME)
    const hit = await cache.match(DB_URL)
    if (hit) return (await hit.json()) as Exercise[]
    const res = await fetch(DB_URL)
    if (!res.ok) throw new Error(`exercise db ${res.status}`)
    await cache.put(DB_URL, res.clone())
    return (await res.json()) as Exercise[]
  } catch {
    // Cache API unavailable (or a stale failure) — plain fetch
    const res = await fetch(DB_URL)
    if (!res.ok) throw new Error(`exercise db ${res.status}`)
    return (await res.json()) as Exercise[]
  }
}

export function useExercises() {
  return useQuery({
    queryKey: ['exercise-db'],
    queryFn: fetchExercises,
    staleTime: Infinity,
    gcTime: Infinity,
  })
}

export function exerciseById(exercises: Exercise[]): Map<string, Exercise> {
  return new Map(exercises.map((e) => [e.id, e]))
}

/** Distinct filter values present in the dataset, for the filter chips. */
export function facets(exercises: Exercise[]) {
  const muscles = new Set<string>()
  const equipment = new Set<string>()
  for (const e of exercises) {
    e.primaryMuscles.forEach((m) => muscles.add(m))
    if (e.equipment) equipment.add(e.equipment)
  }
  return {
    muscles: [...muscles].sort(),
    equipment: [...equipment].sort(),
    levels: ['beginner', 'intermediate', 'expert'],
  }
}
