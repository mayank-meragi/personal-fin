import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { Amount } from '@/components/Amount'
import { categoryColor, categoryIcon } from '@/lib/categoryIcon'
import { formatINR } from '@/lib/money'
import type { Category } from '@/lib/types'

interface Props {
  category: Category
  /** Display label, e.g. "Investments › Mutual Funds" */
  displayName?: string
  spent: number
  limit?: number
  onLimitChange: (limit: number | null) => void
}

export default function BudgetCard({ category, displayName, spent, limit, onLimitChange }: Props) {
  const ratio = limit && limit > 0 ? spent / limit : null
  const over = ratio !== null && ratio > 1
  const near = ratio !== null && ratio >= 0.85 && ratio <= 1
  const color = categoryColor(category.id)
  const Icon = categoryIcon(category)

  return (
    <Card className="gap-3 p-4">
      <div className="flex items-center gap-2.5">
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-md)]"
          style={{ background: `color-mix(in oklch, ${color} 16%, white)`, color }}
        >
          <Icon className="size-4" strokeWidth={2} />
        </span>
        <span className="flex-1 text-sm font-semibold text-[var(--text-strong)]">{displayName ?? category.name}</span>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          limit ₹
          <Input
            type="number"
            min="0"
            className="h-8 w-24 text-right tabular-nums"
            value={limit ?? ''}
            placeholder="none"
            onChange={(e) => {
              const v = Number(e.target.value)
              onLimitChange(e.target.value === '' || v <= 0 ? null : v)
            }}
          />
        </label>
      </div>
      {limit && limit > 0 ? (
        <div className="space-y-1.5">
          <Progress
            value={Math.min(100, (spent / limit) * 100)}
            className={cn(
              over
                ? '[&_[data-slot=progress-indicator]]:bg-[var(--negative-500)]'
                : near
                  ? '[&_[data-slot=progress-indicator]]:bg-[var(--warning-500)]'
                  : '[&_[data-slot=progress-indicator]]:bg-[var(--brand)]',
            )}
          />
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Amount value={spent} direction="neutral" signed={false} size="sm" weight="semibold" style={{ color: 'var(--text-muted)' }} />
            <span>of {formatINR(limit)}</span>
            {over && (
              <span className="font-semibold" style={{ color: 'var(--negative-600)' }}>
                {formatINR(spent - limit)} over budget
              </span>
            )}
            {near && (
              <span className="font-semibold" style={{ color: 'var(--warning-600)' }}>
                Nearing limit
              </span>
            )}
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground/70">
          {spent > 0 ? `${formatINR(spent)} spent — set a limit to track it` : 'No limit set'}
        </p>
      )}
    </Card>
  )
}
