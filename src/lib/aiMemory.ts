import { getCachedFile } from './cache'
import { updateFile } from './sync'
import { accountBalances } from './accounts'
import { generateMemorySummary, hasAiKey } from './ai'
import type { Account, Category, Transaction } from './types'

export const AI_MEMORY_PATH = 'ai-memory.json'

export interface AiMemoryFile {
  /** Compact bullet-point profile injected into every parse prompt */
  summary: string
  updatedAt: string
  /** Transaction count when last regenerated — regenerate when it changes */
  txCount: number
}

export const emptyAiMemory: AiMemoryFile = { summary: '', updatedAt: '', txCount: 0 }

export function getAiMemory(): AiMemoryFile {
  return getCachedFile<AiMemoryFile>(AI_MEMORY_PATH)?.content ?? emptyAiMemory
}

const MAX_RECENT = 60

/**
 * Regenerate the AI memory from recent activity and persist it. Fire-and-forget
 * after saves; returns the new memory (for query-cache updates) or null when
 * nothing needed doing. Errors are swallowed — memory is an enhancement, never
 * a blocker.
 */
export async function maybeRefreshAiMemory(
  allTransactions: Transaction[],
  categories: Category[],
  accounts: Account[],
): Promise<AiMemoryFile | null> {
  if (!hasAiKey()) return null
  const memory = getAiMemory()
  if (allTransactions.length === memory.txCount) return null
  try {
    const recent = [...allTransactions]
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .slice(-MAX_RECENT)
    const balances = accountBalances(accounts, allTransactions)
    const summary = await generateMemorySummary(memory.summary, recent, categories, accounts, balances)
    if (!summary) return null
    const next: AiMemoryFile = {
      summary,
      updatedAt: new Date().toISOString(),
      txCount: allTransactions.length,
    }
    updateFile<AiMemoryFile>(AI_MEMORY_PATH, emptyAiMemory, () => next)
    return next
  } catch {
    return null
  }
}
