import { CalendarClock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { makeTransaction, useTransactionMutations } from '../hooks/useTransactions'
import { todayISO } from '../lib/dates'
import { formatINR } from '../lib/money'
import type { UpcomingBill } from '../lib/recurring'

interface Props {
  bills: UpcomingBill[]
}

/** Recurring items detected from history that haven't been logged this month. */
export default function UpcomingBills({ bills }: Props) {
  const { saveAll } = useTransactionMutations()

  if (bills.length === 0) return null

  function log(bill: UpcomingBill) {
    saveAll([
      makeTransaction({
        type: bill.item.type,
        amount: bill.item.amount,
        date: todayISO(),
        category: bill.item.category,
        account: bill.item.account,
        toAccount: bill.item.toAccount,
        note: bill.item.name,
        source: 'manual',
      }),
    ])
  }

  return (
    <div>
      <h2 className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        Upcoming this month
      </h2>
      <Card className="gap-0 divide-y p-0">
        {bills.map((bill) => (
          <div key={bill.item.key} className="flex items-center gap-3 px-4 py-2.5">
            <span
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-full',
                bill.overdue ? 'bg-red-50 text-red-600' : 'bg-muted text-muted-foreground',
              )}
            >
              <CalendarClock className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium capitalize">{bill.item.name}</p>
              <p className={cn('text-xs', bill.overdue ? 'text-red-600' : 'text-muted-foreground')}>
                {bill.overdue ? 'expected by ' : 'expected '}
                {new Date(bill.dueDate + 'T00:00:00').toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                })}
                {' · usually '}
                {formatINR(bill.item.amount)}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => log(bill)}>
              Log it
            </Button>
          </div>
        ))}
      </Card>
    </div>
  )
}
