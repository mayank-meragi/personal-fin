import { PiggyBank } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Amount } from './Amount'
import { categoryDisplayName } from '../lib/categories'
import { categoryColor, categoryIcon } from '../lib/categoryIcon'
import { formatINR } from '../lib/money'
import { spentByCategory } from '../lib/stats'
import type { Category, Transaction } from '../lib/types'

interface Props {
  transactions: Transaction[]
  categories: Category[]
  /** e.g. "Jul 2026" */
  periodLabel: string
}

interface Row {
  category: Category
  amount: number
}

function BreakdownRow({ category, amount, max, categories }: Row & { max: number; categories: Category[] }) {
  const color = categoryColor(category.id)
  const Icon = categoryIcon(category)
  const pct = max > 0 ? (amount / max) * 100 : 0
  return (
    <div className="flex items-center gap-3">
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)]"
        style={{ background: `color-mix(in oklch, ${color} 16%, white)`, color }}
      >
        <Icon className="size-4" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-medium text-[var(--text-body)]">
            {categoryDisplayName(category, categories)}
          </span>
          <Amount value={amount} direction="neutral" signed={false} size="sm" weight="semibold" />
        </div>
        <div className="h-1.5 rounded-[var(--radius-pill)]" style={{ background: 'var(--ink-100)' }}>
          <div
            className="h-full rounded-[var(--radius-pill)] transition-[width]"
            style={{ width: `${pct}%`, background: color }}
          />
        </div>
      </div>
    </div>
  )
}

/**
 * Perfin "Where it's going" — spend-by-category as an itemized list, with
 * savings categories (mutual funds, FDs…) broken out into their own section
 * so wealth-building outflow never reads as consumption.
 */
export default function CategoryBreakdownList({ transactions, categories, periodLabel }: Props) {
  const spent = spentByCategory(transactions)
  const rows: Row[] = categories
    .filter((c) => spent[c.id])
    .map((c) => ({ category: c, amount: spent[c.id] }))
    .sort((a, b) => b.amount - a.amount)
  const spendingRows = rows.filter((r) => !r.category.savings)
  const savingsRows = rows.filter((r) => r.category.savings)
  const spendingTotal = spendingRows.reduce((sum, r) => sum + r.amount, 0)
  const savingsTotal = savingsRows.reduce((sum, r) => sum + r.amount, 0)
  const max = rows[0]?.amount ?? 0

  return (
    <Card className="gap-4 p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-lg font-semibold text-[var(--text-strong)]">Where it's going</h2>
        <span className="text-xs text-muted-foreground">
          {periodLabel} · {formatINR(spendingTotal)}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No spending this period yet.</p>
      ) : (
        <div className="space-y-4">
          {spendingRows.map((r) => (
            <BreakdownRow key={r.category.id} {...r} max={max} categories={categories} />
          ))}
          {savingsRows.length > 0 && (
            <>
              <div className="flex items-baseline justify-between border-t border-[var(--border-subtle)] pt-3">
                <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--money-in)]">
                  <PiggyBank className="size-3.5" />
                  Saved
                </span>
                <Amount value={savingsTotal} direction="in" size="sm" weight="semibold" />
              </div>
              {savingsRows.map((r) => (
                <BreakdownRow key={r.category.id} {...r} max={max} categories={categories} />
              ))}
            </>
          )}
        </div>
      )}
    </Card>
  )
}
