export interface BodyMetric {
  id: string
  /** YYYY-MM-DD */
  date: string
  weightKg: number
  bodyFatPct?: number
  waistCm?: number
  note?: string
}

export interface MealItem {
  name: string
  /** kcal */
  calories: number
  proteinG: number
  carbsG?: number
  fatG?: number
}

export interface Meal {
  id: string
  /** YYYY-MM-DD */
  date: string
  createdAt: string
  /** what the user typed/photographed, e.g. "2 rotis and dal" */
  description: string
  items: MealItem[]
  /** totals (sum of items) */
  calories: number
  proteinG: number
  carbsG?: number
  fatG?: number
  source: 'ai' | 'manual'
}

export interface SleepEntry {
  id: string
  /** the WAKE date, YYYY-MM-DD — "last night's sleep" belongs to today */
  date: string
  hours: number
  /** "23:15" */
  bedTime?: string
  /** "07:00" */
  wakeTime?: string
  /** 1 (rough) … 5 (great) */
  quality?: number
  note?: string
}

export interface NutritionTargets {
  calories: number
  proteinG: number
  /** why the AI suggested these (shown once) */
  rationale?: string
}
