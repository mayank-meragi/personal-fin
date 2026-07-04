import { normalizeDesc } from './csv'
import type { Transaction, TransactionType } from './types'

export interface RecurringItem {
  key: string
  name: string
  /** Median observed amount */
  amount: number
  /** Median day of month it lands on */
  day: number
  type: TransactionType
  category: string
  account?: string
  toAccount?: string
  /** Distinct months this was seen, sorted */
  months: string[]
}

function recurringKey(tx: Transaction): string {
  return `${tx.type}|${tx.category}|${normalizeDesc(tx.note)}`
}

function monthDiff(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number)
  const [by, bm] = b.split('-').map(Number)
  return (by - ay) * 12 + (bm - am)
}

function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

/**
 * Find transactions that repeat month after month: same note+category, seen in
 * 2+ months without long gaps, with amounts within ±25% of the median.
 * Rent, salary, SIPs, subscriptions, and credit-card payments all match.
 */
export function detectRecurring(transactions: Transaction[]): RecurringItem[] {
  const groups = new Map<string, Transaction[]>()
  for (const tx of transactions) {
    if (!normalizeDesc(tx.note)) continue
    const key = recurringKey(tx)
    groups.set(key, [...(groups.get(key) ?? []), tx])
  }

  const items: RecurringItem[] = []
  for (const [key, list] of groups) {
    // One representative per month (the latest, in case of corrections)
    const byMonth = new Map<string, Transaction>()
    for (const tx of [...list].sort((a, b) => (a.date < b.date ? -1 : 1))) {
      byMonth.set(tx.date.slice(0, 7), tx)
    }
    const months = [...byMonth.keys()].sort()
    if (months.length < 2) continue
    // Consecutive-ish: no gap of more than one skipped month
    let consecutive = true
    for (let i = 1; i < months.length; i++) {
      if (monthDiff(months[i - 1], months[i]) > 2) {
        consecutive = false
        break
      }
    }
    if (!consecutive) continue

    const occurrences = [...byMonth.values()]
    const amounts = occurrences.map((t) => t.amount).sort((a, b) => a - b)
    const median = amounts[Math.floor(amounts.length / 2)]
    if (median <= 0) continue
    if (!amounts.every((a) => Math.abs(a - median) <= median * 0.25)) continue

    const days = occurrences.map((t) => Number(t.date.slice(8, 10))).sort((a, b) => a - b)
    const latest = occurrences.sort((a, b) => (a.date < b.date ? -1 : 1)).at(-1)!
    items.push({
      key,
      name: latest.note || latest.category,
      amount: median,
      day: days[Math.floor(days.length / 2)],
      type: latest.type,
      category: latest.category,
      account: latest.account,
      toAccount: latest.toAccount,
      months,
    })
  }
  return items.sort((a, b) => a.day - b.day)
}

export interface UpcomingBill {
  item: RecurringItem
  /** ISO date it is expected this month */
  dueDate: string
  overdue: boolean
}

/** Recurring items not yet logged in the given month, with their expected date. */
export function upcomingInMonth(
  items: RecurringItem[],
  monthTransactions: Transaction[],
  month: string,
  todayIso: string,
): UpcomingBill[] {
  const loggedKeys = new Set(monthTransactions.map(recurringKey))
  return items
    .filter((item) => !loggedKeys.has(item.key))
    .map((item) => {
      const day = Math.min(item.day, daysInMonth(month))
      const dueDate = `${month}-${String(day).padStart(2, '0')}`
      return { item, dueDate, overdue: dueDate < todayIso }
    })
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))
}
