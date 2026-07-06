import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import CategoryBreakdownList from '@/modules/finance/components/CategoryBreakdownList'
import MonthPicker from '@/modules/finance/components/MonthPicker'
import NetWorthHero from '@/modules/finance/components/NetWorthHero'
import QuickEntry from '@/modules/finance/components/QuickEntry'
import TransactionList from '@/modules/finance/components/TransactionList'
import TrendChart from '@/modules/finance/components/TrendChart'
import UpcomingBills from '@/modules/finance/components/UpcomingBills'
import { effectiveLimit, useAccounts, useBudgets, useCategories } from '@/hooks/useData'
import { useAllTransactions, useMonthsTransactions } from '@/hooks/useTransactions'
import { accountBalances } from '@/lib/accounts'
import { getConfig } from '@/lib/cache'
import { detectRecurring, upcomingInMonth } from '@/lib/recurring'
import { currentMonthKey, lastNMonthKeys, monthKey, monthLabel, todayISO } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { spentByCategory, splitSpendingSavings, totals } from '@/lib/stats'

/** First name from the data repo's GitHub owner, e.g. "mayank-meragi" → "Mayank" */
function ownerFirstName(): string | null {
  const owner = getConfig('dataRepo')?.split('/')[0]
  const first = owner?.split(/[-_.]/)[0]
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : null
}

function timeGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function GreetingHeader() {
  const name = ownerFirstName()
  return (
    <div className="flex items-center justify-between">
      <p className="font-display text-xl font-semibold text-[var(--text-strong)]">
        {timeGreeting()}
        {name ? `, ${name}` : ''}
      </p>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--emerald-100)] font-display text-sm font-bold text-[var(--emerald-700)]">
        {(name?.[0] ?? '₹').toUpperCase()}
      </span>
    </div>
  )
}

export default function DashboardPage() {
  const [month, setMonth] = useState(currentMonthKey())
  const months = lastNMonthKeys(6, month)
  const byMonth = useMonthsTransactions(months)
  const { categories } = useCategories()
  const { budgets } = useBudgets()
  const { accounts } = useAccounts()
  const { transactions: allTransactions } = useAllTransactions()

  const current = byMonth[month] ?? []
  const spent = spentByCategory(current)
  const currentTotals = totals(current)
  const savingsIds = new Set(categories.filter((c) => c.savings).map((c) => c.id))
  const { spending, savings } = splitSpendingSavings(current, savingsIds)

  const balances = accountBalances(accounts, allTransactions)
  const totalBalance = accounts.reduce((sum, acc) => sum + (balances[acc.id] ?? 0), 0)

  // Cumulative net worth at each month end: walk back from today's total
  const totalStarting = accounts.reduce((sum, acc) => sum + acc.startingBalance, 0)
  const netByMonth = new Map<string, number>()
  for (const tx of allTransactions) {
    if (tx.type === 'transfer') continue
    const m = monthKey(tx.date)
    netByMonth.set(m, (netByMonth.get(m) ?? 0) + (tx.type === 'income' ? tx.amount : -tx.amount))
  }
  let running = totalStarting
  const heroSeries = lastNMonthKeys(6).map((m) => {
    running += netByMonth.get(m) ?? 0
    return { label: monthLabel(m), value: running }
  })

  const recent = [...allTransactions]
    .sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1))
    .slice(0, 10)

  // Recurring items are always assessed against the real current month
  const nowMonth = currentMonthKey()
  const upcoming = upcomingInMonth(
    detectRecurring(allTransactions),
    allTransactions.filter((t) => monthKey(t.date) === nowMonth),
    nowMonth,
    todayISO(),
  )

  const warnings = categories
    .filter((c) => c.type === 'expense')
    .map((c) => {
      const limit = effectiveLimit(budgets, month, c.id)
      const s = spent[c.id] ?? 0
      return limit && limit > 0 ? { category: c, spent: s, limit, ratio: s / limit } : null
    })
    .filter((w): w is NonNullable<typeof w> => w !== null && w.ratio >= 0.85)
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 3)

  return (
    <div className="space-y-4">
      <GreetingHeader />

      <NetWorthHero
        totalBalance={totalBalance}
        series={heroSeries}
        thisMonthNet={currentTotals.net}
        thisMonthSpent={spending}
        thisMonthSaved={savings}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name, balance: balances[a.id] ?? 0 }))}
      />

      <QuickEntry />

      <UpcomingBills bills={upcoming} />

      {warnings.length > 0 && (
        <div className="space-y-1.5">
          {warnings.map((w) => (
            <Link
              key={w.category.id}
              to="/budgets"
              className={cn(
                'block rounded-2xl px-4 py-2.5 text-sm',
                w.ratio > 1
                  ? 'bg-[var(--negative-100)] text-[var(--negative-600)]'
                  : 'bg-[var(--warning-100)] text-[var(--warning-600)]',
              )}
            >
              {w.category.name}: {formatINR(w.spent)} of {formatINR(w.limit)}{' '}
              {w.ratio > 1 ? `— over by ${formatINR(w.spent - w.limit)}` : '— nearing limit'}
            </Link>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {monthLabel(month)} breakdown
        </h2>
        <MonthPicker month={month} onChange={setMonth} />
      </div>

      <CategoryBreakdownList transactions={current} categories={categories} periodLabel={monthLabel(month)} />

      <Card className="gap-3">
        <CardHeader>
          <CardTitle className="font-display text-base font-semibold">Income vs expense</CardTitle>
        </CardHeader>
        <CardContent>
          <TrendChart byMonth={byMonth} months={months} />
        </CardContent>
      </Card>

      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Recent transactions
          </h2>
          <Link to="/transactions" className="text-xs font-medium text-[var(--brand)] underline-offset-4 hover:underline">
            view all
          </Link>
        </div>
        <TransactionList transactions={recent} />
      </div>
    </div>
  )
}
