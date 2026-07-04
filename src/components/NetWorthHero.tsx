import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const GREEN = '#16a34a'

interface Props {
  totalBalance: number
  /** Cumulative net worth at the end of each month, oldest first */
  series: { label: string; value: number }[]
  thisMonthNet: number
  thisMonthSpent: number
  accounts: { id: string; name: string; balance: number }[]
}

/** ₹ rendered smaller than the figure, Fold-style */
function Amount({ value, className, signed }: { value: number; className?: string; signed?: boolean }) {
  const sign = signed ? (value >= 0 ? '+' : '−') : value < 0 ? '−' : ''
  return (
    <span className={cn('tabular-nums', className)}>
      {sign}
      <span className="mr-0.5 align-[0.08em] text-[0.7em] font-semibold">₹</span>
      {Math.abs(value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
    </span>
  )
}

export default function NetWorthHero({ totalBalance, series, thisMonthNet, thisMonthSpent, accounts }: Props) {
  const stats: { label: string; value: number; signed?: boolean; tone?: string }[] = [
    {
      label: 'This month',
      value: thisMonthNet,
      signed: true,
      tone: thisMonthNet >= 0 ? 'text-emerald-600' : 'text-red-600',
    },
    { label: 'Spent', value: thisMonthSpent },
    ...accounts.map((a) => ({
      label: a.name,
      value: a.balance,
      tone: a.balance < 0 ? 'text-red-600' : undefined,
    })),
  ]

  return (
    <Card className="gap-0 p-0">
      <div className="flex items-start justify-between px-5 pt-5">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Net worth</p>
          <Amount value={totalBalance} className="text-[2rem] font-bold leading-tight tracking-tight" />
        </div>
      </div>
      <div className="relative h-32">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 12, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="networth-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={GREEN} stopOpacity={0.14} />
                <stop offset="100%" stopColor={GREEN} stopOpacity={0} />
              </linearGradient>
            </defs>
            {/* Padded domain so a flat series still draws mid-card, not on the edge */}
            <YAxis hide domain={['dataMin - 1000', 'dataMax + 1000']} />
            <Area
              type="monotone"
              dataKey="value"
              stroke={GREEN}
              strokeWidth={2}
              fill="url(#networth-fill)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
        <p className="pointer-events-none absolute inset-x-0 bottom-1 text-center text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
          — last 6 months —
        </p>
      </div>
      <div className="flex divide-x overflow-x-auto border-t">
        {stats.map((s) => (
          <div key={s.label} className="min-w-28 shrink-0 px-4 py-3">
            <Amount value={s.value} signed={s.signed} className={cn('text-base font-bold', s.tone)} />
            <p className="mt-0.5 truncate text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {s.label}
            </p>
          </div>
        ))}
      </div>
    </Card>
  )
}
