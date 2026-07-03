export type TransactionType = 'expense' | 'income'
export type TransactionSource = 'manual' | 'ai' | 'csv'

export interface Transaction {
  id: string
  type: TransactionType
  /** Total amount in rupees */
  amount: number
  /** ISO date YYYY-MM-DD */
  date: string
  /** Category id from categories.json */
  category: string
  note: string
  quantity?: number
  source: TransactionSource
  /** Dedup key for CSV imports: date|amount|normalized(desc) */
  importHash?: string | null
  createdAt: string
  updatedAt: string
}

export interface Category {
  id: string
  name: string
  emoji: string
  type: TransactionType
  /** Keywords used by the fallback parser, CSV categorizer, and Gemini prompt */
  hints: string[]
}

export interface CategoriesFile {
  categories: Category[]
}

export interface BudgetsFile {
  /** Default monthly limit per category id, in rupees */
  monthlyLimits: Record<string, number>
  /** Per-month exceptions: { "2026-10": { "shopping": 15000 } } */
  overrides: Record<string, Record<string, number>>
}

export interface SettingsFile {
  schemaVersion: number
  currency: string
  startOfMonth: number
}

/** A transaction parsed from quick entry (AI or regex), before the user confirms it */
export interface ParsedEntry {
  type: TransactionType
  description: string
  quantity?: number
  unitAmount?: number
  totalAmount: number
  category: string
  /** ISO date; defaults to today when absent */
  date?: string
}
