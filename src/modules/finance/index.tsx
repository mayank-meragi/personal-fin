import { CreditCard, Download, LayoutDashboard, ReceiptText, Target } from 'lucide-react'
import { useAccounts } from '@/hooks/useData'
import { useAllTransactions } from '@/hooks/useTransactions'
import { useCategories } from '@/hooks/useData'
import { accountBalances } from '@/lib/accounts'
import { currentMonthKey } from '@/lib/dates'
import { splitSpendingSavings } from '@/lib/stats'
import { Amount } from '@/components/Amount'
import type { ModuleDef } from '../types'
import DashboardPage from './pages/DashboardPage'
import TransactionsPage from './pages/TransactionsPage'
import BudgetsPage from './pages/BudgetsPage'
import CategoriesPage from './pages/CategoriesPage'
import AccountsPage from './pages/AccountsPage'
import ImportPage from './pages/ImportPage'

function FinanceCard() {
  const { accounts } = useAccounts()
  const { transactions } = useAllTransactions()
  const { categories } = useCategories()
  const balances = accountBalances(accounts, transactions)
  const netWorth = accounts.reduce((sum, a) => sum + (balances[a.id] ?? 0), 0)
  const month = currentMonthKey()
  const savingsIds = new Set(categories.filter((c) => c.savings).map((c) => c.id))
  const { spending } = splitSpendingSavings(
    transactions.filter((t) => t.date.startsWith(month)),
    savingsIds,
  )
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <p className="perfin-eyebrow text-[var(--text-subtle)]">Net worth</p>
        <Amount value={netWorth} size="lg" signed={false} />
      </div>
      <p className="text-xs text-muted-foreground">
        spent <Amount value={spending} size="sm" weight="semibold" signed={false} /> this month
      </p>
    </div>
  )
}

export const financeModule: ModuleDef = {
  id: 'finance',
  name: 'Finance',
  icon: CreditCard,
  tagline: 'Money, budgets & accounts',
  routes: [
    { path: '/finance', element: DashboardPage },
    { path: '/finance/transactions', element: TransactionsPage },
    { path: '/finance/budgets', element: BudgetsPage },
    { path: '/finance/categories', element: CategoriesPage },
    { path: '/finance/accounts', element: AccountsPage },
    { path: '/finance/import', element: ImportPage },
  ],
  navItems: [
    { to: '/finance', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/finance/transactions', label: 'Activity', icon: ReceiptText },
    { to: '/finance/budgets', label: 'Budgets', icon: Target },
    { to: '/finance/import', label: 'Import', icon: Download },
  ],
  card: FinanceCard,
}
