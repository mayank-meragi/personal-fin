import { formatINR } from '../lib/money'
import { palette } from '../lib/palette'
import type { Category } from '../lib/types'

interface Props {
  category: Category
  spent: number
  limit?: number
  onLimitChange: (limit: number | null) => void
}

/**
 * Budget meter: fill and track share the same ramp; the fill switches to the
 * reserved status colors (with a text label, never color alone) near/over limit.
 */
export default function BudgetCard({ category, spent, limit, onLimitChange }: Props) {
  const ratio = limit && limit > 0 ? spent / limit : null
  const over = ratio !== null && ratio > 1
  const near = ratio !== null && ratio >= 0.85 && ratio <= 1

  const fill = over ? palette.critical : near ? palette.warning : palette.series1

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <span className="text-xl">{category.emoji}</span>
        <span className="flex-1 text-sm font-medium">{category.name}</span>
        <label className="flex items-center gap-1 text-xs text-slate-500">
          limit ₹
          <input
            type="number"
            min="0"
            className="w-24 rounded-md border border-slate-300 px-2 py-1 text-right text-sm"
            value={limit ?? ''}
            placeholder="none"
            onChange={(e) => {
              const v = Number(e.target.value)
              onLimitChange(e.target.value === '' || v <= 0 ? null : v)
            }}
          />
        </label>
      </div>
      <div className="mt-3">
        {limit && limit > 0 ? (
          <>
            <div className="h-2.5 w-full rounded-full" style={{ backgroundColor: palette.seqTrack }}>
              <div
                className="h-2.5 rounded-full"
                style={{
                  width: `${Math.min(100, (spent / limit) * 100)}%`,
                  backgroundColor: fill,
                }}
              />
            </div>
            <p className="mt-1.5 text-xs text-slate-600">
              {formatINR(spent)} of {formatINR(limit)}
              {over && (
                <span className="ml-2 font-semibold" style={{ color: palette.critical }}>
                  ⚠ Over by {formatINR(spent - limit)}
                </span>
              )}
              {near && (
                <span className="ml-2 font-semibold" style={{ color: '#8a5b00' }}>
                  Nearing limit
                </span>
              )}
            </p>
          </>
        ) : (
          <p className="text-xs text-slate-400">
            {spent > 0 ? `${formatINR(spent)} spent — set a limit to track it` : 'No limit set'}
          </p>
        )}
      </div>
    </div>
  )
}
