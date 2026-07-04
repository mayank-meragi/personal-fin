import { Card } from '@/components/ui/card'
import { Amount } from './Amount'
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

/**
 * Perfin "Where it's going" — spend-by-category as an itemized list (icon
 * tile, name, amount, progress bar normalized to the largest category),
 * rather than a bar chart. Numbers first, chrome recedes.
 */
export default function CategoryBreakdownList({ transactions, categories, periodLabel }: Props) {
  const spent = spentByCategory(transactions)
  const rows = categories
    .filter((c) => spent[c.id])
    .map((c) => ({ category: c, amount: spent[c.id] }))
    .sort((a, b) => b.amount - a.amount)
  const total = rows.reduce((sum, r) => sum + r.amount, 0)
  const max = rows[0]?.amount ?? 0

  return (
    <Card className="gap-4 p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-lg font-semibold text-[var(--text-strong)]">Where it's going</h2>
        <span className="text-xs text-muted-foreground">
          {periodLabel} · {formatINR(total)}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No spending this period yet.</p>
      ) : (
        <div className="space-y-4">
          {rows.map(({ category, amount }) => {
            const color = categoryColor(category.id)
            const Icon = categoryIcon(category)
            const pct = max > 0 ? (amount / max) * 100 : 0
            return (
              <div key={category.id} className="flex items-center gap-3">
                <span
                  className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)]"
                  style={{ background: `color-mix(in oklch, ${color} 16%, white)`, color }}
                >
                  <Icon className="size-4" strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium text-[var(--text-body)]">{category.name}</span>
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
          })}
        </div>
      )}
    </Card>
  )
}
