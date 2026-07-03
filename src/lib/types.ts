export type TransactionType = 'expense' | 'income' | 'transfer'
export type TransactionSource = 'manual' | 'ai' | 'csv'
export type AccountType = 'bank' | 'credit-card' | 'cash'

export interface Account {
  id: string
  name: string
  type: AccountType
  /** Balance when the account was added; current balance = this + income − expense */
  startingBalance: number
  createdAt: string
}

export interface AccountsFile {
  accounts: Account[]
}

export interface Transaction {
  id: string
  type: TransactionType
  /** Total amount in rupees */
  amount: number
  /** ISO date YYYY-MM-DD */
  date: string
  /** Category id from categories.json */
  category: string
  /** Account id from accounts.json; absent on transactions from before accounts existed.
   *  For transfers this is the source account. */
  account?: string
  /** Destination account — transfers only */
  toAccount?: string
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
  /** Set when the AI invented a category that doesn't exist yet */
  categoryName?: string
  categoryEmoji?: string
  /** Account id (source for transfers); undefined means the user must pick one before saving */
  account?: string
  /** Destination account — transfers only */
  toAccount?: string
  /** ISO date; defaults to today when absent */
  date?: string
}
