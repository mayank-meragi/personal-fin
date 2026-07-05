import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  ArrowLeftRight,
  ImagePlus,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { fileQueryKey, useAccounts, useCategories, useFileQuery } from '../hooks/useData'
import { makeTransaction, useAllTransactions, useTransactionMutations } from '../hooks/useTransactions'
import { hasGeminiKey, parseWithGemini, GeminiError, NoGeminiKeyError } from '../lib/gemini'
import { quickParse } from '../lib/quickParse'
import { accountBalances, accountTypeEmoji, inferAccount } from '../lib/accounts'
import { AI_MEMORY_PATH, emptyAiMemory, maybeRefreshAiMemory, type AiMemoryFile } from '../lib/aiMemory'
import { categoryColor, categoryIcon, TRANSFER_COLOR } from '../lib/categoryIcon'
import { todayISO } from '../lib/dates'
import { formatINRExact } from '../lib/money'
import type { ParsedEntry, TransactionType } from '../lib/types'

const TYPE_CYCLE: TransactionType[] = ['expense', 'income', 'transfer']

const typeChip: Record<TransactionType, { label: string; icon: typeof TrendingDown; className: string }> = {
  expense: { label: 'Expense', icon: TrendingDown, className: 'bg-secondary text-secondary-foreground' },
  income: { label: 'Income', icon: TrendingUp, className: 'bg-emerald-100 text-emerald-700' },
  transfer: { label: 'Transfer', icon: ArrowLeftRight, className: 'bg-sky-100 text-sky-700' },
}

const chipClass =
  'h-7 rounded-full border-0 bg-background px-2 text-[11px] font-medium text-foreground shadow-xs ring-1 ring-border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50'

export default function QuickEntry() {
  const { categories, addCategory } = useCategories()
  const { accounts } = useAccounts()
  const { transactions: history } = useAllTransactions()
  const { saveAll } = useTransactionMutations()
  const { data: aiMemory } = useFileQuery<AiMemoryFile>(AI_MEMORY_PATH, emptyAiMemory)
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const [entries, setEntries] = useState<ParsedEntry[]>([])
  const [parsing, setParsing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [image, setImage] = useState<{ mimeType: string; data: string; previewUrl: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function attachImage(blob: Blob) {
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1]
      setImage({
        mimeType: blob.type || 'image/png',
        data: base64,
        previewUrl: URL.createObjectURL(blob),
      })
    }
    reader.readAsDataURL(blob)
  }

  function clearImage() {
    if (image) URL.revokeObjectURL(image.previewUrl)
    setImage(null)
  }

  // Pick up anything shared into the PWA (the service worker stashes it in the Cache API)
  useEffect(() => {
    if (!('caches' in window)) return
    void (async () => {
      try {
        const cache = await caches.open('pf-share')
        const textRes = await cache.match('shared-text')
        if (textRes) {
          setText(await textRes.text())
          await cache.delete('shared-text')
        }
        const imgRes = await cache.match('shared-image')
        if (imgRes) {
          attachImage(await imgRes.blob())
          await cache.delete('shared-image')
          setNotice('Screenshot received — hit Add to extract the transaction.')
        }
      } catch {
        // Cache API unavailable (e.g. private mode) — sharing just won't prefill
      }
    })()
  }, [])

  function withInferredAccounts(parsed: ParsedEntry[]): ParsedEntry[] {
    return parsed.map((e) => {
      if (e.account) return e
      if (accounts.length === 1 && e.type !== 'transfer') return { ...e, account: accounts[0].id }
      return { ...e, account: e.type === 'transfer' ? undefined : inferAccount(e.description, history) }
    })
  }

  /**
   * "23k left in hdfc" → the entry's amount becomes the gap between the
   * account's computed balance and what the user says is actually there.
   * Overspend → expense; more than expected → income.
   */
  function resolveStatedBalance(entry: ParsedEntry): ParsedEntry {
    if (entry.statedBalance == null || !entry.account) return entry
    const balances = accountBalances(accounts, history)
    const delta = (balances[entry.account] ?? 0) - entry.statedBalance
    return {
      ...entry,
      type: delta >= 0 ? 'expense' : 'income',
      totalAmount: Math.abs(Math.round(delta * 100) / 100),
      category: entry.category === 'transfer' ? 'other' : entry.category,
    }
  }

  async function parse() {
    const input = text.trim()
    if ((!input && !image) || parsing) return
    setParsing(true)
    setNotice(null)
    try {
      const result = withInferredAccounts(
        await parseWithGemini(input, categories, accounts, {
          balances: accountBalances(accounts, history),
          memory: aiMemory?.summary,
          image: image ? { mimeType: image.mimeType, data: image.data } : undefined,
        }),
      ).map(resolveStatedBalance)
      const matched = result.filter((e) => e.statedBalance != null && e.account && e.totalAmount === 0)
      const remaining = result.filter((e) => !matched.includes(e))
      if (result.length === 0) {
        setNotice('Could not find any transactions in that — try "tea 10" or "2 tea of 5".')
      } else if (matched.length > 0 && remaining.length === 0) {
        setNotice('That balance already matches — nothing to record.')
      } else if (remaining.some((e) => !e.account || (e.type === 'transfer' && !e.toAccount))) {
        setNotice('Could not tell which account some items belong to — pick below.')
      }
      setEntries(remaining)
    } catch (e) {
      const fallback = withInferredAccounts(quickParse(input, categories, accounts)).map(resolveStatedBalance)
      setEntries(fallback)
      if (e instanceof NoGeminiKeyError) {
        setNotice(
          image
            ? 'Reading screenshots needs a Gemini key — add one in Settings.'
            : fallback.length === 0
              ? 'Could not parse that. Add a Gemini key in Settings for smarter parsing.'
              : null,
        )
      } else if (e instanceof GeminiError) {
        setNotice(`${e.message}${fallback.length > 0 ? ' — used simple parsing instead.' : ''}`)
      } else {
        setNotice('Parsing failed unexpectedly.')
      }
    } finally {
      setParsing(false)
    }
  }

  function updateEntry(index: number, patch: Partial<ParsedEntry>) {
    setEntries((prev) =>
      prev.map((e, i) => {
        if (i !== index) return e
        const next = { ...e, ...patch }
        // Re-derive the amount when the account changes under a balance declaration
        return patch.account !== undefined ? resolveStatedBalance(next) : next
      }),
    )
  }

  function cycleType(index: number) {
    setEntries((prev) =>
      prev.map((e, i) => {
        if (i !== index) return e
        const next = TYPE_CYCLE[(TYPE_CYCLE.indexOf(e.type) + 1) % TYPE_CYCLE.length]
        return {
          ...e,
          type: next,
          category: next === 'transfer' ? 'transfer' : e.category === 'transfer' ? 'other' : e.category,
          toAccount: next === 'transfer' ? e.toAccount : undefined,
        }
      }),
    )
  }

  function removeEntry(index: number) {
    setEntries((prev) => prev.filter((_, i) => i !== index))
  }

  const knownCategoryIds = new Set(categories.map((c) => c.id))
  const missingAccountCount = accounts.length
    ? entries.filter((e) => !e.account || (e.type === 'transfer' && (!e.toAccount || e.toAccount === e.account)))
        .length
    : 0
  const missingAccount = missingAccountCount > 0

  function saveEntries() {
    // Create any categories the AI invented before saving transactions that use them
    for (const e of entries) {
      if (e.type !== 'transfer' && !knownCategoryIds.has(e.category)) {
        addCategory({
          id: e.category,
          name: e.categoryName ?? e.category,
          emoji: e.categoryEmoji ?? '🏷️',
          type: e.type === 'income' ? 'income' : 'expense',
          hints: [e.description],
        })
      }
    }
    const txs = entries.map((e) =>
      makeTransaction({
        type: e.type,
        amount: e.totalAmount,
        date: e.date && /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? e.date : todayISO(),
        category: e.type === 'transfer' ? 'transfer' : e.category,
        account: e.account,
        toAccount: e.type === 'transfer' ? e.toAccount : undefined,
        note: e.description,
        quantity: e.quantity,
        source: 'ai',
      }),
    )
    saveAll(txs)
    setEntries([])
    setText('')
    clearImage()
    setNotice(`Saved ${txs.length} transaction${txs.length > 1 ? 's' : ''}.`)
    // Update the AI's memory of this user in the background
    void maybeRefreshAiMemory([...history, ...txs], categories, accounts).then((next) => {
      if (next) queryClient.setQueryData(fileQueryKey(AI_MEMORY_PATH), next)
    })
  }

  return (
    <div className="space-y-2">
      <div
        className="flex items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--surface-card)] py-2 pr-2 pl-2 shadow-[var(--shadow-sm)] ring-1 ring-[var(--border-subtle)]"
      >
        <button
          type="button"
          onClick={() => void parse()}
          disabled={parsing || (!text.trim() && !image)}
          aria-label={parsing ? 'Parsing…' : 'Parse with AI'}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--ink-900)] text-white transition-transform active:scale-90 disabled:opacity-50"
        >
          <Sparkles className="size-4" />
        </button>
        <input
          className="min-w-0 flex-1 bg-transparent text-[15px] text-[var(--text-strong)] outline-none placeholder:text-[var(--text-subtle)]"
          placeholder={hasGeminiKey() ? 'Add anything — "auto 85", "23k left in hdfc"…' : 'Add anything — "tea 10"…'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void parse()
          }}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-muted-foreground"
          aria-label="Attach a payment screenshot"
          onClick={() => fileInputRef.current?.click()}
        >
          <ImagePlus />
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) attachImage(f)
            e.target.value = ''
          }}
        />
      </div>
      {image && (
        <div className="flex items-center gap-2">
          <img src={image.previewUrl} alt="Attached screenshot" className="h-12 w-12 rounded-lg object-cover ring-1 ring-border" />
          <span className="text-xs text-muted-foreground">Screenshot attached</span>
          <Button variant="ghost" size="icon-xs" onClick={clearImage} aria-label="Remove screenshot">
            <X />
          </Button>
        </div>
      )}
      {notice && <p className="text-xs text-muted-foreground">{notice}</p>}
      {entries.length > 0 && (
        <div className="space-y-2">
          {entries.map((entry, i) => {
            const category = categories.find((c) => c.id === entry.category)
            const tileColor = entry.type === 'transfer' ? TRANSFER_COLOR : categoryColor(entry.category)
            const TileIcon = entry.type === 'transfer' ? ArrowLeftRight : categoryIcon(category)
            const accountMissing = !entry.account
            const toAccountMissing = entry.type === 'transfer' && (!entry.toAccount || entry.toAccount === entry.account)
            const TypeIcon = typeChip[entry.type].icon

            return (
              <div key={i} className="space-y-2.5 rounded-2xl bg-muted/40 p-3.5">
                <div className="flex items-center gap-3">
                  <span
                    className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-md)]"
                    style={{ background: `color-mix(in oklch, ${tileColor} 16%, white)`, color: tileColor }}
                    aria-hidden
                  >
                    <TileIcon className="size-[18px]" strokeWidth={2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <input
                      className="w-full min-w-0 bg-transparent text-base font-medium text-foreground outline-none"
                      value={entry.description}
                      onChange={(e) => updateEntry(i, { description: e.target.value })}
                    />
                    {entry.quantity && entry.unitAmount ? (
                      <p className="text-xs text-muted-foreground">
                        {entry.quantity} × {formatINRExact(entry.unitAmount)}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-baseline gap-0.5">
                    <span className="text-sm font-semibold text-muted-foreground">₹</span>
                    <input
                      className="w-16 bg-transparent text-right text-base font-semibold tabular-nums text-foreground outline-none"
                      type="number"
                      step="0.01"
                      min="0"
                      value={entry.totalAmount}
                      onChange={(e) => updateEntry(i, { totalAmount: Number(e.target.value) })}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeEntry(i)}
                    aria-label="Remove entry"
                  >
                    <Trash2 />
                  </Button>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => cycleType(i)}
                    className={cn(
                      'inline-flex h-7 items-center gap-1 rounded-full px-2 text-[11px] font-medium transition-colors',
                      typeChip[entry.type].className,
                    )}
                    title="Toggle expense/income/transfer"
                  >
                    <TypeIcon className="size-3.5" />
                    {typeChip[entry.type].label}
                  </button>
                  {entry.type !== 'transfer' && (
                    <select
                      className={cn(chipClass, 'max-w-28')}
                      value={entry.category}
                      onChange={(e) => updateEntry(i, { category: e.target.value })}
                    >
                      {!knownCategoryIds.has(entry.category) && (
                        <option value={entry.category}>
                          {entry.categoryEmoji ?? '🏷️'} {entry.categoryName ?? entry.category} (new)
                        </option>
                      )}
                      {categories
                        .filter((c) => c.type === entry.type)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.emoji} {c.name}
                          </option>
                        ))}
                    </select>
                  )}
                  {accounts.length > 0 && (
                    <div className="relative">
                      {accountMissing && (
                        <AlertCircle className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-red-600" />
                      )}
                      <select
                        className={cn(
                          chipClass,
                          'max-w-28',
                          accountMissing && 'pl-7 text-red-600 ring-red-300',
                        )}
                        value={entry.account ?? ''}
                        onChange={(e) => updateEntry(i, { account: e.target.value || undefined })}
                      >
                        <option value="">{entry.type === 'transfer' ? 'From…' : 'Account…'}</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {accountTypeEmoji[a.type]} {a.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {entry.type === 'transfer' && accounts.length > 0 && (
                    <>
                      <span className="flex items-center text-xs text-muted-foreground">→</span>
                      <div className="relative">
                        {toAccountMissing && (
                          <AlertCircle className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-red-600" />
                        )}
                        <select
                          className={cn(chipClass, 'max-w-28', toAccountMissing && 'pl-7 text-red-600 ring-red-300')}
                          value={entry.toAccount ?? ''}
                          onChange={(e) => updateEntry(i, { toAccount: e.target.value || undefined })}
                        >
                          <option value="">To…</option>
                          {accounts
                            .filter((a) => a.id !== entry.account)
                            .map((a) => (
                              <option key={a.id} value={a.id}>
                                {accountTypeEmoji[a.type]} {a.name}
                              </option>
                            ))}
                        </select>
                      </div>
                    </>
                  )}
                  <input
                    className={chipClass}
                    type="date"
                    value={entry.date ?? todayISO()}
                    onChange={(e) => updateEntry(i, { date: e.target.value })}
                  />
                </div>

                {entry.statedBalance != null && entry.account ? (
                  <p className="text-xs text-sky-700">
                    ↳ leaves {formatINRExact(entry.statedBalance)} in{' '}
                    {accounts.find((a) => a.id === entry.account)?.name ?? entry.account}
                  </p>
                ) : null}
              </div>
            )
          })}
          {missingAccount && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-red-600">
              <AlertCircle className="size-3.5" />
              {missingAccountCount === 1 ? '1 item needs an account' : `${missingAccountCount} items need an account`}
            </p>
          )}
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEntries([])}>
              Discard
            </Button>
            <Button
              size="sm"
              onClick={saveEntries}
              disabled={missingAccount || entries.some((e) => !Number.isFinite(e.totalAmount) || e.totalAmount <= 0)}
            >
              Save all ({entries.length})
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
