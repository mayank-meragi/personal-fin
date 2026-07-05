import { ChevronUp, ChevronDown } from 'lucide-react'
import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts'
import { Card } from '@/components/ui/card'
import { Amount } from './Amount'

interface Props {
  totalBalance: number
  /** Cumulative net worth at the end of each month, oldest first */
  series: { label: string; value: number }[]
  thisMonthNet: number
  thisMonthSpent: number
  thisMonthSaved?: number
  accounts: { id: string; name: string; balance: number }[]
}

export default function NetWorthHero({
  totalBalance,
  series,
  thisMonthNet,
  thisMonthSpent,
  thisMonthSaved = 0,
  accounts,
}: Props) {
  const up = thisMonthNet >= 0

  const stats: { label: string; value: number; tone?: string }[] = [
    { label: 'Spent', value: thisMonthSpent },
    ...(thisMonthSaved > 0 ? [{ label: 'Saved', value: thisMonthSaved, tone: 'var(--money-in)' }] : []),
    ...accounts.map((a) => ({
      label: a.name,
      value: a.balance,
      tone: a.balance < 0 ? 'var(--negative-600)' : undefined,
    })),
  ]

  return (
    <Card className="gap-0 p-0">
      <div className="px-5 pt-5">
        <p className="perfin-eyebrow">Net worth</p>
        {/* Whole rupees at display size — paise precision isn't the point of a headline figure */}
        <Amount value={Math.round(totalBalance)} direction="neutral" signed={false} size="display" />
        <div
          className="mt-2 inline-flex items-center gap-1 rounded-[var(--radius-pill)] px-2.5 py-1 text-xs font-bold"
          style={{
            background: up ? 'var(--positive-100)' : 'var(--negative-100)',
            color: up ? 'var(--positive-600)' : 'var(--negative-600)',
          }}
        >
          {up ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          <Amount value={thisMonthNet} size="sm" weight="bold" style={{ color: 'inherit' }} />
          <span className="font-medium opacity-80">this month</span>
        </div>
      </div>
      <div className="relative mt-1 h-28">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 12, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="networth-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.16} />
                <stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
              </linearGradient>
            </defs>
            {/* Padded domain so a flat series still draws mid-card, not on the edge */}
            <YAxis hide domain={['dataMin - 1000', 'dataMax + 1000']} />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--brand)"
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
      <div className="flex divide-x overflow-x-auto border-t border-[var(--border-subtle)]">
        {stats.map((s) => (
          <div key={s.label} className="min-w-28 shrink-0 px-4 py-3">
            <Amount value={s.value} direction="neutral" signed={false} size="md" weight="bold" style={s.tone ? { color: s.tone } : undefined} />
            <p className="mt-0.5 truncate text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {s.label}
            </p>
          </div>
        ))}
      </div>
    </Card>
  )
}
