import type { Transaction } from './types'

/**
 * Merge local and remote copies of a data file after a sha conflict.
 * Transactions merge by id (newer updatedAt wins, remote-only ids are kept);
 * everything else is a shallow merge with local values winning.
 */
export function mergeFile(path: string, local: unknown, remote: unknown): unknown {
  if (remote == null) return local
  if (path.startsWith('transactions/')) {
    return mergeTransactions(local as Transaction[], remote as Transaction[])
  }
  if (typeof local === 'object' && typeof remote === 'object' && !Array.isArray(local) && !Array.isArray(remote)) {
    return { ...(remote as object), ...(local as object) }
  }
  return local
}

export function mergeTransactions(local: Transaction[], remote: Transaction[]): Transaction[] {
  const byId = new Map<string, Transaction>()
  for (const t of remote) byId.set(t.id, t)
  for (const t of local) {
    const existing = byId.get(t.id)
    if (!existing || t.updatedAt >= existing.updatedAt) byId.set(t.id, t)
  }
  return [...byId.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}
