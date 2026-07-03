import type { Account, AccountType, Transaction } from './types'

export const accountTypeEmoji: Record<AccountType, string> = {
  bank: '🏦',
  'credit-card': '💳',
  cash: '💵',
}

export const accountTypeLabel: Record<AccountType, string> = {
  bank: 'Bank',
  'credit-card': 'Credit card',
  cash: 'Cash',
}

/** Current balance per account id: starting balance + income − expense */
export function accountBalances(accounts: Account[], transactions: Transaction[]): Record<string, number> {
  const balances: Record<string, number> = {}
  for (const acc of accounts) balances[acc.id] = acc.startingBalance
  for (const tx of transactions) {
    if (!tx.account || !(tx.account in balances)) continue
    balances[tx.account] += tx.type === 'income' ? tx.amount : -tx.amount
  }
  return balances
}

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3)
}

/**
 * Guess which account a new entry belongs to by matching its description
 * against past transactions' notes. Returns the most frequent account among
 * matches (most recent wins ties), or undefined when there is no signal —
 * the caller should then ask the user.
 */
export function inferAccount(description: string, history: Transaction[]): string | undefined {
  const descTokens = new Set(tokens(description))
  if (descTokens.size === 0) return undefined
  const scores = new Map<string, { count: number; lastDate: string }>()
  for (const tx of history) {
    if (!tx.account) continue
    if (!tokens(tx.note).some((t) => descTokens.has(t))) continue
    const entry = scores.get(tx.account) ?? { count: 0, lastDate: '' }
    entry.count += 1
    if (tx.date > entry.lastDate) entry.lastDate = tx.date
    scores.set(tx.account, entry)
  }
  let best: string | undefined
  let bestScore = { count: 0, lastDate: '' }
  for (const [account, score] of scores) {
    if (score.count > bestScore.count || (score.count === bestScore.count && score.lastDate > bestScore.lastDate)) {
      best = account
      bestScore = score
    }
  }
  return best
}
