/** One exercise from free-exercise-db (public domain). */
export interface Exercise {
  id: string
  name: string
  force?: string | null
  level: 'beginner' | 'intermediate' | 'expert'
  mechanic?: string | null
  equipment?: string | null
  primaryMuscles: string[]
  secondaryMuscles: string[]
  instructions: string[]
  category: string
  images: string[]
}

export interface SetEntry {
  targetReps: number
  /** kg; absent = bodyweight */
  targetWeight?: number
  /** actuals — filled when the set is checked off (default to targets) */
  reps?: number
  weight?: number
  done: boolean
}

export interface SessionExercise {
  /** free-exercise-db id */
  exerciseId: string
  name: string
  restSeconds?: number
  sets: SetEntry[]
  notes?: string
}

export interface WorkoutSession {
  id: string
  /** YYYY-MM-DD */
  date: string
  name: string
  /** muscle groups this session targets */
  focus?: string[]
  source: 'ai' | 'manual'
  startedAt?: string
  endedAt?: string
  exercises: SessionExercise[]
  /** why the AI programmed it this way (shown in the plan preview) */
  rationale?: string
}

export interface FitnessProfile {
  goal: 'build-muscle' | 'strength' | 'fat-loss' | 'general-fitness'
  experience: 'beginner' | 'intermediate' | 'advanced'
  daysPerWeek: number
  /** free-exercise-db equipment values the user has access to */
  equipment: string[]
  injuries?: string
  preferences?: string
}

export interface PlanFile {
  next: WorkoutSession | null
  generatedAt?: string
}

export interface FitnessMemoryFile {
  summary: string
  updatedAt: string
  sessionCount: number
}
