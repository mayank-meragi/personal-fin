import type { QueryClient } from '@tanstack/react-query'
import * as actions from '../actions'
import { accountBalances } from '../accounts'
import { getCachedFile } from '../cache'
import { categoryDisplayName } from '../categories'
import { currentMonthKey, todayISO, transactionsPath } from '../dates'
import { fileQueryKey } from '../queryKeys'
import { splitSpendingSavings, totals } from '../stats'
import { toKebabId } from '../ai'
import type { ToolDef } from '../llm'
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
  return readFile<CategoriesFile>(qc, 'categories.json', { categories: [] }).categories
}

function getAccounts(qc: QueryClient): Account[] {
  return readFile<AccountsFile>(qc, 'accounts.json', { accounts: [] }).accounts
}

function getMonths(qc: QueryClient): string[] {
  const months = qc.getQueryData<string[]>(['transaction-months'])
  return months && months.length > 0 ? months : [currentMonthKey()]
}

function getAllTransactions(qc: QueryClient): Transaction[] {
  return getMonths(qc).flatMap((m) => readFile<Transaction[]>(qc, transactionsPath(m), []))
}

export function buildOverview(qc: QueryClient): string {
  const accounts = getAccounts(qc)
  const categories = getCategories(qc)
  const budgets = readFile<BudgetsFile>(qc, 'budgets.json', { monthlyLimits: {}, overrides: {} })
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
${categoryLines || '(none)'}`
}

// ---- Tool declarations (provider-neutral; adapters convert the schemas) ----

const PAGES: Record<string, string> = {
  dashboard: '/',
  activity: '/transactions',
  transactions: '/transactions',
  budgets: '/budgets',
  categories: '/categories',
  import: '/import',
  settings: '/settings',
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
    name: 'navigate',
    description: 'Take the user to a page of the app.',
    parameters: {
      type: 'object',
      properties: {
        page: { type: 'string', enum: ['dashboard', 'activity', 'budgets', 'categories', 'import', 'settings'] },
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
