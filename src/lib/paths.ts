/**
 * Every module's data lives under its own folder in the data repo:
 *   finance/…  fitness/…  (future: sleep/…, habits/…)
 * settings.json stays at the root — it's app-level, not module-level.
 */

export const FINANCE_PATHS = {
  transactions: (month: string) => `finance/transactions/${month}.json`,
  transactionsDir: 'finance/transactions',
  budgets: 'finance/budgets.json',
  categories: 'finance/categories.json',
  accounts: 'finance/accounts.json',
  aiMemory: 'finance/ai-memory.json',
} as const

export const FITNESS_PATHS = {
  workouts: (month: string) => `fitness/workouts/${month}.json`,
  workoutsDir: 'fitness/workouts',
  profile: 'fitness/profile.json',
  plan: 'fitness/plan.json',
  memory: 'fitness/memory.json',
} as const

export const HEALTH_PATHS = {
  metrics: 'health/metrics.json',
  meals: (month: string) => `health/meals/${month}.json`,
  mealsDir: 'health/meals',
  sleep: 'health/sleep.json',
  targets: 'health/targets.json',
} as const

export const SETTINGS_PATH = 'settings.json'
