import { Link } from 'react-router-dom'
import { ArrowLeftRight, Dumbbell } from 'lucide-react'
import QuickEntry from '@/modules/finance/components/QuickEntry'
import { Amount } from '@/components/Amount'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { getConfig } from '@/lib/cache'
import { categoryColor, categoryIcon, TRANSFER_COLOR } from '@/lib/categoryIcon'
import { currentMonthKey, todayISO } from '@/lib/dates'
import { totals } from '@/lib/stats'
import { accountBalances } from '@/lib/accounts'
import { useAccounts, useCategories } from '@/hooks/useData'
import { useAllTransactions } from '@/hooks/useTransactions'
import { useAllWorkouts, usePlan, useProfile } from '@/modules/fitness/lib/data'
import { currentStreak, isSessionPR, thisWeekCount } from '@/modules/fitness/lib/stats'
import type { WorkoutSession } from '@/modules/fitness/lib/types'
import type { Transaction } from '@/lib/types'

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

function relativeDate(dateISO: string, today: string): string {
  const days = Math.round((Date.parse(today) - Date.parse(dateISO)) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(dateISO).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function IconTile({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      className="flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-md)]"
      style={{ backgroundColor: 'var(--surface-sunken)', color: color ?? 'var(--text-muted)' }}
    >
      {children}
    </span>
  )
}

type FeedItem =
  | { kind: 'tx'; date: string; sortKey: string; tx: Transaction }
  | { kind: 'workout'; date: string; sortKey: string; session: WorkoutSession; pr: boolean }

export default function HubPage() {
  const name = ownerFirstName()
  const today = todayISO()
  const { accounts } = useAccounts()
  const { categories } = useCategories()
  const { transactions } = useAllTransactions()
  const { sessions } = useAllWorkouts()
  const { data: plan } = usePlan()
  const { profile } = useProfile()

  // Net worth + this month's movement (transfers excluded)
  const balances = accountBalances(accounts, transactions)
  const netWorth = accounts.reduce((sum, a) => sum + (balances[a.id] ?? 0), 0)
  const month = currentMonthKey()
  const monthTotals = totals(transactions.filter((t) => t.date.startsWith(month)))
  const monthNet = monthTotals.income - monthTotals.expense

  // Fitness snapshot
  const streak = currentStreak(sessions, today)
  const week = thisWeekCount(sessions, today)
  const doneToday = sessions.some((s) => s.date === today)
  const workout = plan?.next ?? null
  const workoutDone =
    workout?.exercises.reduce((n, ex) => n + ex.sets.filter((s) => s.done).length, 0) ?? 0
  const workoutTotal = workout?.exercises.reduce((n, ex) => n + ex.sets.length, 0) ?? 0

  const workoutLine = doneToday
    ? { title: 'Workout done', sub: 'nice one — recovery counts too', cta: 'View', to: '/fitness' }
    : workout
      ? {
          title: workout.name,
          sub: `${workout.exercises.length} exercises · ${workoutDone > 0 ? `${workoutDone}/${workoutTotal} sets` : 'not started'}`,
          cta: workoutDone > 0 ? 'Resume' : 'Start',
          to: '/fitness',
        }
      : profile
        ? { title: 'No workout planned', sub: 'generate one for today', cta: 'Plan', to: '/fitness/plan' }
        : { title: 'Set up your training', sub: 'a few questions, once', cta: 'Start', to: '/fitness/plan' }

  // Unified recent activity across modules
  const categoryById = new Map(categories.map((c) => [c.id, c]))
  const feed: FeedItem[] = [
    ...transactions.map((tx): FeedItem => ({ kind: 'tx', date: tx.date, sortKey: `${tx.date}|${tx.createdAt}`, tx })),
    ...sessions.map(
      (s): FeedItem => ({
        kind: 'workout',
        date: s.date,
        sortKey: `${s.date}|${s.endedAt ?? ''}`,
        session: s,
        pr: isSessionPR(s, sessions),
      }),
    ),
  ]
    .sort((a, b) => (a.sortKey < b.sortKey ? 1 : -1))
    .slice(0, 8)

  return (
    <div className="mx-auto max-w-md space-y-5 md:max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{timeGreeting()}</p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--ink-900)]">{name ?? 'there'}</h1>
        </div>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--emerald-100)] font-display text-sm font-bold text-[var(--emerald-700)]">
          {(name?.[0] ?? '₹').toUpperCase()}
        </span>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3">
        <Link to="/finance">
          <Card className="h-full gap-1 p-4">
            <p className="perfin-eyebrow text-[var(--text-subtle)]">Net worth</p>
            <Amount value={netWorth} size="lg" signed={false} />
            <p className="text-xs font-semibold" style={{ color: monthNet >= 0 ? 'var(--money-in)' : 'var(--money-out)' }}>
              {monthNet >= 0 ? '+' : '−'}₹{Math.abs(Math.round(monthNet)).toLocaleString('en-IN')} this month
            </p>
          </Card>
        </Link>
        <Link to="/fitness/history">
          <Card className="h-full gap-1 p-4">
            <p className="perfin-eyebrow text-[var(--text-subtle)]">Streak</p>
            <p className="font-mono text-xl font-bold text-[var(--text-strong)] tabular-nums" style={{ letterSpacing: 'var(--tracking-snug)' }}>
              {streak} <span className="text-sm font-semibold text-muted-foreground">days</span>
            </p>
            <p className="text-xs font-semibold text-[var(--brand)]">
              {profile ? `${week} of ${profile.daysPerWeek} workouts this week` : week > 0 ? `${week} workouts this week` : 'no workouts yet'}
            </p>
          </Card>
        </Link>
      </div>

      {/* Today */}
      <section className="space-y-2">
        <h2 className="font-display text-lg font-bold text-[var(--text-strong)]">Today</h2>
        <Card className="flex-row items-center gap-3 p-3.5">
          <IconTile color="var(--viz-1)">
            <Dumbbell className="size-5" />
          </IconTile>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-[var(--text-strong)]">{workoutLine.title}</p>
            <p className="truncate text-xs text-muted-foreground">{workoutLine.sub}</p>
          </div>
          <Button asChild size="sm" className="rounded-full bg-[var(--ink-900)] px-5">
            <Link to={workoutLine.to}>{workoutLine.cta}</Link>
          </Button>
        </Card>
        <QuickEntry />
      </section>

      {/* Recent activity */}
      <section className="space-y-1">
        <h2 className="font-display text-lg font-bold text-[var(--text-strong)]">Recent activity</h2>
        {feed.map((item) =>
          item.kind === 'workout' ? (
            <Link
              key={`w-${item.session.id}`}
              to="/fitness/history"
              className="flex items-center gap-3 rounded-[var(--radius-lg)] px-1 py-2.5"
            >
              <IconTile color="var(--viz-1)">
                <Dumbbell className="size-5" />
              </IconTile>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[var(--text-strong)]">
                  Completed {item.session.name}
                  {item.pr ? ' · new PR' : ''}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {relativeDate(item.date, today)}
                  {item.session.startedAt && item.session.endedAt
                    ? ` · ${Math.max(1, Math.round((Date.parse(item.session.endedAt) - Date.parse(item.session.startedAt)) / 60_000))} min`
                    : ''}
                  {` · ${item.session.exercises.length} exercises`}
                </p>
              </div>
            </Link>
          ) : (
            (() => {
              const tx = item.tx
              const isTransfer = tx.type === 'transfer'
              const cat = categoryById.get(tx.category)
              const Icon = isTransfer ? ArrowLeftRight : categoryIcon(cat)
              const color = isTransfer ? TRANSFER_COLOR : categoryColor(tx.category)
              return (
                <Link
                  key={`t-${tx.id}`}
                  to="/finance/transactions"
                  className="flex items-center gap-3 rounded-[var(--radius-lg)] px-1 py-2.5"
                >
                  <IconTile color={color}>
                    <Icon className="size-5" />
                  </IconTile>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[var(--text-strong)]">
                      {tx.note.charAt(0).toUpperCase() + tx.note.slice(1)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {relativeDate(tx.date, today)} · {isTransfer ? 'Transfer' : (cat?.name ?? tx.category)}
                    </p>
                  </div>
                  <Amount
                    value={tx.amount}
                    size="sm"
                    signed={!isTransfer}
                    direction={isTransfer ? 'neutral' : tx.type === 'income' ? 'in' : 'out'}
                  />
                </Link>
              )
            })()
          ),
        )}
        {feed.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">Activity from every module lands here.</p>
        )}
      </section>
    </div>
  )
}
