import type { QueryClient } from '@tanstack/react-query'
import * as actions from '../actions'
import { accountBalances } from '../accounts'
import { getCachedFile } from '../cache'
import { categoryDisplayName } from '../categories'
import { currentMonthKey, effectiveTodayISO, monthKey, todayISO, transactionsPath } from '../dates'
import { fileQueryKey } from '../queryKeys'
import { splitSpendingSavings, totals } from '../stats'
import { toKebabId } from '../ai'
import { FINANCE_PATHS, FITNESS_PATHS, HEALTH_PATHS } from '../paths'
import { deleteMeal, saveMeal, saveMetric, saveSleep } from '@/modules/health/lib/data'
import * as actionsHealth from '@/modules/health/lib/data'
import { parseMeal } from '@/modules/health/lib/nutrition'
import type { BodyMetric, Meal, NutritionTargets, SleepEntry } from '@/modules/health/lib/types'
import { listDir } from '../github'
import { loadFile } from '../sync'
import type { ToolDef } from '../llm'
import { fetchExercises } from '@/modules/fitness/lib/exerciseDb'
import { deleteSession, savePlan, saveSession } from '@/modules/fitness/lib/data'
import { applyWorkoutEdits, type WorkoutEdit } from '@/modules/fitness/lib/editPlan'
import { generateNextWorkout, parseQuickLog } from '@/modules/fitness/lib/planner'
import { formatSet, sessionVolume, setSummary } from '@/modules/fitness/lib/stats'
import type { FitnessProfile, PlanFile, WorkoutSession } from '@/modules/fitness/lib/types'
import type {
  Account,
  AccountsFile,
  BudgetsFile,
  CategoriesFile,
  Category,
  Transaction,
  TransactionType,
} from '../types'

/** An executed write, surfaced in the chat as a card with optional Undo. */
export interface AgentAction {
  label: string
  undo?: () => void
}

export interface ToolContext {
  qc: QueryClient
  navigate: (path: string) => void
  /** Ask the user before a destructive step; resolves false on decline. */
  confirm: (description: string) => Promise<boolean>
  /** Report an executed write so the UI can render an action card. */
  onAction: (action: AgentAction) => void
}

// ---- Data access (query cache first, localStorage cache as fallback) ----

function readFile<T>(qc: QueryClient, path: string, fallback: T): T {
  return qc.getQueryData<T>(fileQueryKey(path)) ?? getCachedFile<T>(path)?.content ?? fallback
}

function getCategories(qc: QueryClient): Category[] {
  return readFile<CategoriesFile>(qc, FINANCE_PATHS.categories, { categories: [] }).categories
}

function getAccounts(qc: QueryClient): Account[] {
  return readFile<AccountsFile>(qc, FINANCE_PATHS.accounts, { accounts: [] }).accounts
}

function getMonths(qc: QueryClient): string[] {
  const months = qc.getQueryData<string[]>(['transaction-months'])
  return months && months.length > 0 ? months : [currentMonthKey()]
}

function getAllTransactions(qc: QueryClient): Transaction[] {
  return getMonths(qc).flatMap((m) => readFile<Transaction[]>(qc, transactionsPath(m), []))
}

async function loadAllWorkouts(): Promise<WorkoutSession[]> {
  const files = await listDir(FITNESS_PATHS.workoutsDir)
  const months = files.map((f) => f.name.replace(/\.json$/, '')).filter((n) => /^\d{4}-\d{2}$/.test(n))
  const all: WorkoutSession[] = []
  for (const month of months) {
    all.push(...(await loadFile<WorkoutSession[]>(FITNESS_PATHS.workouts(month), [])))
  }
  return all.sort((a, b) => (a.date < b.date ? -1 : 1))
}

function fitnessOverview(qc: QueryClient): string {
  const profile = readFile<FitnessProfile | null>(qc, FITNESS_PATHS.profile, null)
  const plan = readFile<PlanFile>(qc, FITNESS_PATHS.plan, { next: null })
  if (!profile) return 'Fitness: not set up (no training profile yet — it lives on the fitness Plan page).'
  const planLine = plan.next
    ? `next workout ready: "${plan.next.name}" — ${plan.next.exercises.map((e) => `${e.name} ${setSummary(e.sets)}`).join('; ')}`
    : 'no workout planned right now'
  return `Fitness: goal ${profile.goal}, intends ${profile.daysPerWeek} sessions/week; ${planLine}.`
}

function healthOverview(qc: QueryClient): string {
  const today = effectiveTodayISO()
  const meals = readFile<Meal[]>(qc, HEALTH_PATHS.meals(monthKey(today)), []).filter((m) => m.date === today)
  const targets = readFile<NutritionTargets | null>(qc, HEALTH_PATHS.targets, null)
  const metrics = readFile<BodyMetric[]>(qc, HEALTH_PATHS.metrics, [])
  const sleep = readFile<SleepEntry[]>(qc, HEALTH_PATHS.sleep, [])
  const calories = meals.reduce((s, m) => s + m.calories, 0)
  const protein = meals.reduce((s, m) => s + m.proteinG, 0)
  const latest = metrics[metrics.length - 1]
  const lastNight = sleep.find((s) => s.date === today)
  return `Health: today ${calories}${targets ? `/${targets.calories}` : ''} kcal, ${protein}${targets ? `/${targets.proteinG}` : ''}g protein; weight ${latest ? `${latest.weightKg}kg (${latest.date})` : 'never logged'}; last night's sleep ${lastNight ? `${lastNight.hours}h` : 'not logged'}.`
}

export function buildOverview(qc: QueryClient): string {
  const accounts = getAccounts(qc)
  const categories = getCategories(qc)
  const budgets = readFile<BudgetsFile>(qc, FINANCE_PATHS.budgets, { monthlyLimits: {}, overrides: {} })
  const allTx = getAllTransactions(qc)
  const month = currentMonthKey()
  const monthTx = allTx.filter((t) => t.date.startsWith(month))
  const balances = accountBalances(accounts, allTx)
  const savingsIds = new Set(categories.filter((c) => c.savings).map((c) => c.id))
  const t = totals(monthTx)
  const { spending, savings } = splitSpendingSavings(monthTx, savingsIds)
  const netWorth = accounts.reduce((sum, a) => sum + (balances[a.id] ?? 0), 0)

  const accountLines = accounts
    .map((a) => `- ${a.id} — ${a.name} (${a.type}) balance ₹${(balances[a.id] ?? 0).toLocaleString('en-IN')}`)
    .join('\n')
  const categoryLines = categories
    .map(
      (c) =>
        `- ${c.id} — ${categoryDisplayName(c, categories)} (${c.type}${c.savings ? ', savings' : ''})` +
        (budgets.monthlyLimits[c.id] ? ` budget ₹${budgets.monthlyLimits[c.id]}/mo` : ''),
    )
    .join('\n')

  return `Today: ${todayISO()} (IST). Currency: INR.
Net worth (all accounts): ₹${netWorth.toLocaleString('en-IN')}
This month (${month}): income ₹${t.income.toLocaleString('en-IN')}, spent ₹${spending.toLocaleString('en-IN')}, saved ₹${savings.toLocaleString('en-IN')}
Accounts:
${accountLines || '(none)'}
Categories:
${categoryLines || '(none)'}
${fitnessOverview(qc)}
${healthOverview(qc)}`
}

// ---- Tool declarations (provider-neutral; adapters convert the schemas) ----

const PAGES: Record<string, string> = {
  home: '/',
  dashboard: '/finance',
  activity: '/finance/transactions',
  transactions: '/finance/transactions',
  budgets: '/finance/budgets',
  categories: '/finance/categories',
  import: '/finance/import',
  settings: '/settings',
  workout: '/fitness',
  exercises: '/fitness/exercises',
  'workout-history': '/fitness/history',
  plan: '/fitness/plan',
  food: '/health',
  body: '/health/body',
  sleep: '/health/sleep',
}

export const functionDeclarations: ToolDef[] = [
  {
    name: 'list_transactions',
    description:
      'List transactions, optionally filtered by month (YYYY-MM), category id, account id, or text in the note. Returns id, date, type, amount, category, account, note.',
    parameters: {
      type: 'object',
      properties: {
        month: { type: 'string', description: 'YYYY-MM; omit for all months' },
        category: { type: 'string' },
        account: { type: 'string' },
        text: { type: 'string', description: 'substring to search in notes' },
        limit: { type: 'number', description: 'max rows, default 50' },
      },
    },
  },
  {
    name: 'add_transactions',
    description:
      'Record one or more transactions. Transfers move money between own accounts (set toAccount). Amounts in INR, positive numbers.',
    parameters: {
      type: 'object',
      properties: {
        entries: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['expense', 'income', 'transfer'] },
              amount: { type: 'number' },
              date: { type: 'string', description: 'YYYY-MM-DD, default today' },
              category: { type: 'string', description: 'existing category id; "transfer" for transfers' },
              account: { type: 'string', description: 'existing account id (source for transfers)' },
              toAccount: { type: 'string', description: 'destination account id, transfers only' },
              note: { type: 'string' },
            },
            required: ['type', 'amount', 'note'],
          },
        },
      },
      required: ['entries'],
    },
  },
  {
    name: 'update_transaction',
    description: 'Update fields of an existing transaction found via list_transactions.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        patch: {
          type: 'object',
          properties: {
            amount: { type: 'number' },
            date: { type: 'string' },
            category: { type: 'string' },
            account: { type: 'string' },
            note: { type: 'string' },
            type: { type: 'string', enum: ['expense', 'income', 'transfer'] },
          },
        },
      },
      required: ['id', 'patch'],
    },
  },
  {
    name: 'delete_transaction',
    description: 'Delete a transaction permanently. The user is asked to confirm first.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  {
    name: 'add_categories',
    description:
      'Create new categories or subcategories. parent must be an existing top-level category id. savings=true for wealth-building categories (investments, FDs).',
    parameters: {
      type: 'object',
      properties: {
        categories: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              emoji: { type: 'string' },
              type: { type: 'string', enum: ['expense', 'income'] },
              parent: { type: 'string' },
              savings: { type: 'boolean' },
              hints: { type: 'array', items: { type: 'string' } },
            },
            required: ['name'],
          },
        },
      },
      required: ['categories'],
    },
  },
  {
    name: 'update_category',
    description: 'Rename a category, change its keyword hints, or toggle its savings nature.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        patch: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            savings: { type: 'boolean' },
            hints: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      required: ['id', 'patch'],
    },
  },
  {
    name: 'set_budget',
    description:
      'Set a monthly budget limit for a category (0 or null clears it). With month (YYYY-MM), sets an override for that month only.',
    parameters: {
      type: 'object',
      properties: {
        categoryId: { type: 'string' },
        monthlyLimit: { type: 'number' },
        month: { type: 'string', description: 'YYYY-MM for a one-month override' },
      },
      required: ['categoryId', 'monthlyLimit'],
    },
  },
  {
    name: 'add_account',
    description:
      'Add a bank, credit-card, or cash account. For credit cards, startingBalance is the amount owed (positive; stored as debt).',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        type: { type: 'string', enum: ['bank', 'credit-card', 'cash'] },
        startingBalance: { type: 'number' },
      },
      required: ['name', 'type'],
    },
  },
  {
    name: 'update_account',
    description: 'Rename an account or correct its starting balance.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        patch: {
          type: 'object',
          properties: { name: { type: 'string' }, startingBalance: { type: 'number' } },
        },
      },
      required: ['id', 'patch'],
    },
  },
  {
    name: 'get_workout_history',
    description:
      'List logged gym sessions (newest last): date, name, per-exercise sets with reps and kg, session volume. Use for questions like "what did I bench last week".',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'max sessions, default 10' },
        exercise: { type: 'string', description: 'filter to exercises whose name contains this' },
      },
    },
  },
  {
    name: 'log_workout',
    description:
      'Log a completed gym workout from informal text, e.g. "bench 3x8 60kg, squats 5x5 80". Records it as done today.',
    parameters: {
      type: 'object',
      properties: { log: { type: 'string', description: 'the workout in the user\'s words' } },
      required: ['log'],
    },
  },
  {
    name: 'generate_next_workout',
    description:
      'Build a BRAND-NEW next workout from the user\'s training profile and history, replacing the current plan entirely. Optionally pass a special request ("make it a leg day", "something short"). For tweaks to the existing plan use edit_workout instead — never regenerate for a tweak.',
    parameters: {
      type: 'object',
      properties: { request: { type: 'string', description: 'optional user preference for this workout' } },
    },
  },
  {
    name: 'edit_workout',
    description:
      'Modify the CURRENTLY planned workout in place — only the named parts change, everything else (including completed sets) stays. Use for: swapping/removing/adding an exercise, changing sets/reps/weight/duration/rest.',
    parameters: {
      type: 'object',
      properties: {
        edits: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              action: { type: 'string', enum: ['remove', 'swap', 'add', 'update_sets', 'update_rest'] },
              exercise: { type: 'string', description: 'exercise name in the current plan to target (remove/swap/update)' },
              newExercise: { type: 'string', description: 'library exercise name (swap/add)' },
              sets: { type: 'number', description: 'total number of sets' },
              reps: { type: 'number', description: 'target reps per set' },
              weightKg: { type: 'number' },
              durationMinutes: { type: 'number', description: 'for timed (cardio/stretch) work' },
              restSeconds: { type: 'number' },
            },
            required: ['action'],
          },
        },
      },
      required: ['edits'],
    },
  },
  {
    name: 'log_meal',
    description:
      'Log food eaten today from informal text ("2 rotis and dal, 100g paneer"). AI estimates calories and protein.',
    parameters: {
      type: 'object',
      properties: { food: { type: 'string', description: 'what the user ate, in their words' } },
      required: ['food'],
    },
  },
  {
    name: 'log_weight',
    description: 'Log today\'s body weight (kg), optionally waist (cm).',
    parameters: {
      type: 'object',
      properties: { weightKg: { type: 'number' }, waistCm: { type: 'number' } },
      required: ['weightKg'],
    },
  },
  {
    name: 'log_sleep',
    description:
      'Log last night\'s sleep. Give hours directly, or bedTime/wakeTime as HH:MM. quality is 1 (rough) to 5 (great).',
    parameters: {
      type: 'object',
      properties: {
        hours: { type: 'number' },
        bedTime: { type: 'string' },
        wakeTime: { type: 'string' },
        quality: { type: 'number' },
      },
    },
  },
  {
    name: 'navigate',
    description: 'Take the user to a page of the app.',
    parameters: {
      type: 'object',
      properties: {
        page: {
          type: 'string',
          enum: [
            'home',
            'dashboard',
            'activity',
            'budgets',
            'categories',
            'import',
            'settings',
            'workout',
            'exercises',
            'workout-history',
            'plan',
            'food',
            'body',
            'sleep',
          ],
        },
      },
      required: ['page'],
    },
  },
]

// ---- Executors ----

function fmt(n: number): string {
  return `₹${Math.abs(n).toLocaleString('en-IN')}`
}

function makeTx(fields: Partial<Transaction> & Pick<Transaction, 'type' | 'amount' | 'note'>): Transaction {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    date: todayISO(),
    category: 'other',
    importHash: null,
    createdAt: now,
    updatedAt: now,
    source: 'ai',
    ...fields,
  } as Transaction
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Args = Record<string, any>

export async function executeTool(name: string, args: Args, ctx: ToolContext): Promise<object> {
  const { qc } = ctx
  const categories = getCategories(qc)
  const accounts = getAccounts(qc)
  const categoryIds = new Set(categories.map((c) => c.id))
  const accountIds = new Set(accounts.map((a) => a.id))

  switch (name) {
    case 'list_transactions': {
      const limit = Math.min(Number(args.limit) || 50, 200)
      let txs = getAllTransactions(qc)
      if (args.month) txs = txs.filter((t) => t.date.startsWith(String(args.month)))
      if (args.category) txs = txs.filter((t) => t.category === args.category)
      if (args.account) txs = txs.filter((t) => t.account === args.account || t.toAccount === args.account)
      if (args.text) {
        const q = String(args.text).toLowerCase()
        txs = txs.filter((t) => t.note.toLowerCase().includes(q))
      }
      txs = [...txs].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, limit)
      return {
        count: txs.length,
        transactions: txs.map((t) => ({
          id: t.id,
          date: t.date,
          type: t.type,
          amount: t.amount,
          category: t.category,
          account: t.account,
          toAccount: t.toAccount,
          note: t.note,
        })),
      }
    }

    case 'add_transactions': {
      const entries: Args[] = Array.isArray(args.entries) ? args.entries : []
      const txs: Transaction[] = []
      for (const e of entries) {
        const amount = Number(e.amount)
        if (!Number.isFinite(amount) || amount <= 0) return { error: `invalid amount for "${e.note}"` }
        const type = (['expense', 'income', 'transfer'].includes(e.type) ? e.type : 'expense') as TransactionType
        const account = e.account && accountIds.has(e.account) ? e.account : undefined
        const toAccount = e.toAccount && accountIds.has(e.toAccount) ? e.toAccount : undefined
        if (accounts.length > 0 && !account) return { error: `unknown or missing account for "${e.note}" — ask the user which account` }
        if (type === 'transfer' && (!toAccount || toAccount === account))
          return { error: `transfer "${e.note}" needs a distinct toAccount` }
        const category = type === 'transfer' ? 'transfer' : categoryIds.has(e.category) ? e.category : 'other'
        txs.push(
          makeTx({
            type,
            amount,
            note: String(e.note ?? '').trim() || category,
            date: /^\d{4}-\d{2}-\d{2}$/.test(e.date ?? '') ? e.date : todayISO(),
            category,
            account,
            toAccount: type === 'transfer' ? toAccount : undefined,
          }),
        )
      }
      if (txs.length === 0) return { error: 'no valid entries' }
      actions.saveTransactions(qc, txs)
      const total = txs.reduce((s, t) => s + t.amount, 0)
      ctx.onAction({
        label: `Added ${txs.length} transaction${txs.length > 1 ? 's' : ''} · ${fmt(total)}`,
        undo: () => txs.forEach((t) => actions.deleteTransaction(qc, t)),
      })
      return { ok: true, added: txs.map((t) => ({ id: t.id, note: t.note, amount: t.amount })) }
    }

    case 'update_transaction': {
      const tx = getAllTransactions(qc).find((t) => t.id === args.id)
      if (!tx) return { error: 'transaction not found — use list_transactions first' }
      const patch: Args = args.patch ?? {}
      if (patch.category && !categoryIds.has(patch.category)) return { error: 'unknown category id' }
      if (patch.account && !accountIds.has(patch.account)) return { error: 'unknown account id' }
      if (patch.amount != null && (!Number.isFinite(Number(patch.amount)) || Number(patch.amount) <= 0))
        return { error: 'invalid amount' }
      const next: Transaction = { ...tx, ...patch, amount: patch.amount != null ? Number(patch.amount) : tx.amount, updatedAt: new Date().toISOString() }
      actions.updateTransaction(qc, tx, next)
      ctx.onAction({
        label: `Updated "${tx.note}" · ${fmt(next.amount)}`,
        undo: () => actions.updateTransaction(qc, next, tx),
      })
      return { ok: true }
    }

    case 'delete_transaction': {
      const tx = getAllTransactions(qc).find((t) => t.id === args.id)
      if (!tx) return { error: 'transaction not found' }
      const approved = await ctx.confirm(`Delete "${tx.note}" (${fmt(tx.amount)} on ${tx.date})?`)
      if (!approved) return { cancelled: true, note: 'user declined the deletion' }
      actions.deleteTransaction(qc, tx)
      ctx.onAction({
        label: `Deleted "${tx.note}" · ${fmt(tx.amount)}`,
        undo: () => actions.saveTransactions(qc, [tx]),
      })
      return { ok: true }
    }

    case 'add_categories': {
      const items: Args[] = Array.isArray(args.categories) ? args.categories : []
      const created: Category[] = []
      const known = new Map(categories.map((c) => [c.id, c]))
      for (const item of items) {
        let id = toKebabId(String(item.name ?? ''))
        if (!id) continue
        while (known.has(id)) id = `${id}-2`
        const parentCat = item.parent ? known.get(item.parent) : undefined
        const parent = parentCat && !parentCat.parent ? parentCat : undefined
        const type = parent ? parent.type : item.type === 'income' ? 'income' : 'expense'
        const category: Category = {
          id,
          name: String(item.name).trim(),
          emoji: String(item.emoji ?? '🏷️').trim() || '🏷️',
          type,
          hints: Array.isArray(item.hints) ? item.hints.filter((h: unknown) => typeof h === 'string').slice(0, 12) : [],
          parent: parent?.id,
          savings: type === 'expense' ? Boolean(parent?.savings || item.savings) || undefined : undefined,
        }
        known.set(id, category)
        created.push(category)
      }
      if (created.length === 0) return { error: 'no valid categories' }
      created.forEach((c) => actions.addCategory(qc, c))
      ctx.onAction({
        label: `Added ${created.length} categor${created.length > 1 ? 'ies' : 'y'}: ${created.map((c) => c.name).join(', ')}`,
        undo: () => created.forEach((c) => actions.removeCategory(qc, c.id)),
      })
      return { ok: true, created: created.map((c) => ({ id: c.id, name: c.name, parent: c.parent })) }
    }

    case 'update_category': {
      const cat = categories.find((c) => c.id === args.id)
      if (!cat) return { error: 'unknown category id' }
      const patch: Args = args.patch ?? {}
      const previous = { name: cat.name, savings: cat.savings, hints: cat.hints }
      actions.updateCategory(qc, cat.id, {
        ...(patch.name ? { name: String(patch.name) } : {}),
        ...(patch.savings != null ? { savings: Boolean(patch.savings) || undefined } : {}),
        ...(Array.isArray(patch.hints) ? { hints: patch.hints.filter((h: unknown) => typeof h === 'string') } : {}),
      })
      ctx.onAction({
        label: `Updated category "${cat.name}"`,
        undo: () => actions.updateCategory(qc, cat.id, previous),
      })
      return { ok: true }
    }

    case 'set_budget': {
      if (!categoryIds.has(args.categoryId)) return { error: 'unknown category id' }
      const limit = Number(args.monthlyLimit)
      const month = args.month && /^\d{4}-\d{2}$/.test(args.month) ? String(args.month) : undefined
      const previous = actions.setBudgetLimit(qc, args.categoryId, limit > 0 ? limit : null, month)
      const catName = categories.find((c) => c.id === args.categoryId)?.name ?? args.categoryId
      ctx.onAction({
        label:
          limit > 0
            ? `Budget set: ${catName} ${fmt(limit)}${month ? ` for ${month}` : '/mo'}`
            : `Budget cleared: ${catName}`,
        undo: () => actions.setBudgetLimit(qc, args.categoryId, previous, month),
      })
      return { ok: true }
    }

    case 'add_account': {
      const name_ = String(args.name ?? '').trim()
      if (!name_) return { error: 'account needs a name' }
      const type = (['bank', 'credit-card', 'cash'].includes(args.type) ? args.type : 'bank') as Account['type']
      const magnitude = Number(args.startingBalance) || 0
      let id = toKebabId(name_)
      while (accountIds.has(id)) id = `${id}-2`
      const account: Account = {
        id,
        name: name_,
        type,
        startingBalance: type === 'credit-card' ? -Math.abs(magnitude) : magnitude,
        createdAt: new Date().toISOString(),
      }
      actions.addAccounts(qc, [account])
      ctx.onAction({ label: `Added account ${name_}`, undo: () => actions.removeAccount(qc, id) })
      return { ok: true, id }
    }

    case 'update_account': {
      const acc = accounts.find((a) => a.id === args.id)
      if (!acc) return { error: 'unknown account id' }
      const patch: Args = args.patch ?? {}
      const previous = { name: acc.name, startingBalance: acc.startingBalance }
      actions.updateAccount(qc, acc.id, {
        ...(patch.name ? { name: String(patch.name) } : {}),
        ...(patch.startingBalance != null ? { startingBalance: Number(patch.startingBalance) || 0 } : {}),
      })
      ctx.onAction({ label: `Updated account ${acc.name}`, undo: () => actions.updateAccount(qc, acc.id, previous) })
      return { ok: true }
    }

    case 'get_workout_history': {
      const limit = Math.min(Number(args.limit) || 10, 50)
      let sessions = await loadAllWorkouts()
      if (args.exercise) {
        const q = String(args.exercise).toLowerCase()
        sessions = sessions
          .map((s) => ({ ...s, exercises: s.exercises.filter((e) => e.name.toLowerCase().includes(q)) }))
          .filter((s) => s.exercises.length > 0)
      }
      sessions = sessions.slice(-limit)
      return {
        count: sessions.length,
        sessions: sessions.map((s) => ({
          date: s.date,
          name: s.name,
          volumeKg: Math.round(sessionVolume(s)),
          exercises: s.exercises.map((e) => ({
            name: e.name,
            sets: e.sets.map((x) => (x.done ? formatSet(x) : 'skipped')),
          })),
        })),
      }
    }

    case 'log_workout': {
      const log = String(args.log ?? '').trim()
      if (!log) return { error: 'empty log' }
      const exercises = await fetchExercises()
      const session = await parseQuickLog(log, exercises)
      saveSession(qc, session)
      ctx.onAction({
        label: `Logged workout: ${session.exercises.map((e) => `${e.name} ${setSummary(e.sets)}`).join(', ')}`,
        undo: () => deleteSession(qc, session),
      })
      return { ok: true, logged: session.exercises.map((e) => ({ name: e.name, sets: e.sets.length })) }
    }

    case 'generate_next_workout': {
      const profile = readFile<FitnessProfile | null>(qc, FITNESS_PATHS.profile, null)
      if (!profile) {
        return { error: 'no training profile yet — send the user to the fitness Plan page to set one up' }
      }
      const [exercises, history] = await Promise.all([fetchExercises(), loadAllWorkouts()])
      const metrics = readFile<BodyMetric[]>(qc, HEALTH_PATHS.metrics, [])
      const sleepLog = readFile<SleepEntry[]>(qc, HEALTH_PATHS.sleep, [])
      const workout = await generateNextWorkout({
        profile,
        history,
        exercises,
        request: args.request ? String(args.request) : undefined,
        body: {
          weightKg: metrics[metrics.length - 1]?.weightKg,
          lastNightSleepHours: sleepLog.find((s) => s.date === effectiveTodayISO())?.hours,
        },
      })
      savePlan(qc, { next: workout, generatedAt: new Date().toISOString() })
      ctx.onAction({
        label: `Planned "${workout.name}": ${workout.exercises.map((e) => e.name).join(', ')}`,
        undo: () => savePlan(qc, { next: null }),
      })
      return {
        ok: true,
        workout: { name: workout.name, exercises: workout.exercises.map((e) => `${e.name} ${setSummary(e.sets)}`) },
      }
    }

    case 'edit_workout': {
      const plan = readFile<PlanFile>(qc, FITNESS_PATHS.plan, { next: null })
      if (!plan.next) return { error: 'no workout is planned — generate one first' }
      const edits: WorkoutEdit[] = Array.isArray(args.edits) ? args.edits : []
      if (edits.length === 0) return { error: 'no edits given' }
      const library = await fetchExercises()
      let result: { workout: typeof plan.next; changes: string[] }
      try {
        result = applyWorkoutEdits(plan.next, edits, library)
      } catch (e) {
        return { error: e instanceof Error ? e.message : 'could not apply that edit' }
      }
      const previous = plan.next
      savePlan(qc, { next: result.workout, generatedAt: plan.generatedAt })
      ctx.onAction({
        label: `Workout updated: ${result.changes.join('; ')}`,
        undo: () => savePlan(qc, { next: previous, generatedAt: plan.generatedAt }),
      })
      return {
        ok: true,
        changes: result.changes,
        workout: {
          name: result.workout.name,
          exercises: result.workout.exercises.map((e) => `${e.name} ${setSummary(e.sets)}`),
        },
      }
    }

    case 'log_meal': {
      const food = String(args.food ?? '').trim()
      if (!food) return { error: 'empty meal' }
      const meal = await parseMeal(food)
      saveMeal(qc, meal)
      ctx.onAction({
        label: `Logged meal: ${meal.calories} kcal · ${meal.proteinG}g protein`,
        undo: () => deleteMeal(qc, meal),
      })
      return { ok: true, calories: meal.calories, proteinG: meal.proteinG, items: meal.items.map((i) => i.name) }
    }

    case 'log_weight': {
      const weightKg = Number(args.weightKg)
      if (!Number.isFinite(weightKg) || weightKg < 20 || weightKg > 300) return { error: 'implausible weight' }
      const metric: BodyMetric = {
        id: crypto.randomUUID(),
        date: effectiveTodayISO(),
        weightKg: Math.round(weightKg * 10) / 10,
        waistCm: Number(args.waistCm) > 0 ? Math.round(Number(args.waistCm) * 10) / 10 : undefined,
      }
      saveMetric(qc, metric)
      ctx.onAction({
        label: `Logged weight ${metric.weightKg} kg`,
        undo: () => {
          const { deleteMetric } = actionsHealth
          deleteMetric(qc, metric.id)
        },
      })
      return { ok: true }
    }

    case 'log_sleep': {
      let hours = Number(args.hours)
      const bedTime = typeof args.bedTime === 'string' && /^\d{1,2}:\d{2}$/.test(args.bedTime) ? args.bedTime : undefined
      const wakeTime = typeof args.wakeTime === 'string' && /^\d{1,2}:\d{2}$/.test(args.wakeTime) ? args.wakeTime : undefined
      if ((!Number.isFinite(hours) || hours <= 0) && bedTime && wakeTime) {
        const [bh, bm] = bedTime.split(':').map(Number)
        const [wh, wm] = wakeTime.split(':').map(Number)
        let minutes = wh * 60 + wm - (bh * 60 + bm)
        if (minutes <= 0) minutes += 24 * 60
        hours = Math.round((minutes / 60) * 10) / 10
      }
      if (!Number.isFinite(hours) || hours <= 0 || hours > 20) return { error: 'need hours, or bedTime and wakeTime' }
      const entry: SleepEntry = {
        id: crypto.randomUUID(),
        date: effectiveTodayISO(),
        hours: Math.round(hours * 10) / 10,
        bedTime,
        wakeTime,
        quality: Number(args.quality) >= 1 && Number(args.quality) <= 5 ? Math.round(Number(args.quality)) : undefined,
      }
      saveSleep(qc, entry)
      ctx.onAction({
        label: `Logged sleep ${entry.hours}h`,
        undo: () => actionsHealth.deleteSleep(qc, entry.id),
      })
      return { ok: true }
    }

    case 'navigate': {
      const path = PAGES[String(args.page)]
      if (!path) return { error: 'unknown page' }
      ctx.navigate(path)
      return { ok: true }
    }

    default:
      return { error: `unknown tool ${name}` }
  }
}
