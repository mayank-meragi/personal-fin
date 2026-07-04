import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { formatINR } from '../lib/money'
import type { Category } from '../lib/types'

interface Props {
  category: Category
  spent: number
  limit?: number
  onLimitChange: (limit: number | null) => void
}

export default function BudgetCard({ category, spent, limit, onLimitChange }: Props) {
  const ratio = limit && limit > 0 ? spent / limit : null
  const over = ratio !== null && ratio > 1
  const near = ratio !== null && ratio >= 0.85 && ratio <= 1

  return (
    <Card className="gap-3 p-4">
      <div className="flex items-center gap-2">
        <span className="text-xl">{category.emoji}</span>
        <span className="flex-1 text-sm font-medium">{category.name}</span>
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
                ? '[&_[data-slot=progress-indicator]]:bg-red-600'
                : near
                  ? '[&_[data-slot=progress-indicator]]:bg-amber-500'
                  : '[&_[data-slot=progress-indicator]]:bg-primary',
            )}
          />
          <p className="text-xs text-muted-foreground">
            <span className="tabular-nums">
              {formatINR(spent)} of {formatINR(limit)}
            </span>
            {over && <span className="ml-2 font-semibold text-red-600">⚠ Over by {formatINR(spent - limit)}</span>}
            {near && <span className="ml-2 font-semibold text-amber-600">Nearing limit</span>}
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
