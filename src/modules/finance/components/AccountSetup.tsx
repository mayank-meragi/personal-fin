import { useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { makeAccountId, useAccounts } from '@/hooks/useData'
import { accountTypeEmoji, accountTypeLabel } from '@/lib/accounts'
import { formatINRExact } from '@/lib/money'
import type { Account, AccountType } from '@/lib/types'

/**
 * First-run screen after connecting: add at least one account (bank, credit
 * card, or cash) with its current balance. The app gate closes once saved.
 */
export default function AccountSetup() {
  const { addAccounts } = useAccounts()
  const [drafts, setDrafts] = useState<Account[]>([])
  const [name, setName] = useState('')
  const [type, setType] = useState<AccountType>('bank')
  const [balance, setBalance] = useState('')

  function addDraft() {
    const trimmed = name.trim()
    if (!trimmed) return
    let id = makeAccountId(trimmed)
    if (drafts.some((d) => d.id === id)) id = `${id}-${drafts.length + 1}`
    const magnitude = Number(balance) || 0
    setDrafts([
      ...drafts,
      {
        id,
        name: trimmed,
        type,
        // Credit cards: the field asks "what do you owe" (always positive) —
        // store it as debt (negative) so net worth subtracts it correctly.
        startingBalance: type === 'credit-card' ? -Math.abs(magnitude) : magnitude,
        createdAt: new Date().toISOString(),
      },
    ])
    setName('')
    setBalance('')
    setType('bank')
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Add your accounts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every expense and income is tied to an account. Add each bank, credit card, or cash
          stash you use, with what it holds right now. For a credit card, just enter what you
          currently owe — it's tracked as a debt automatically.
        </p>
      </div>

      {drafts.length > 0 && (
        <Card className="gap-0 divide-y p-0">
          {drafts.map((d) => (
            <div key={d.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="text-xl">{accountTypeEmoji[d.type]}</span>
              <div className="flex-1">
                <p className="text-sm font-medium">{d.name}</p>
                <p className="text-xs text-muted-foreground">{accountTypeLabel[d.type]}</p>
              </div>
              <span className="text-sm font-semibold tabular-nums">{formatINRExact(d.startingBalance)}</span>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => setDrafts(drafts.filter((x) => x.id !== d.id))}
                aria-label="Remove"
              >
                <X />
              </Button>
            </div>
          ))}
        </Card>
      )}

      <Card>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="acc-name">Account name</Label>
            <Input
              id="acc-name"
              placeholder="HDFC Savings, ICICI Amazon Card, Cash…"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(accountTypeLabel) as AccountType[]).map((t) => (
              <Button
                key={t}
                type="button"
                variant={type === t ? 'default' : 'outline'}
                className={cn('w-full')}
                onClick={() => setType(t)}
              >
                {accountTypeEmoji[t]} {accountTypeLabel[t]}
              </Button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acc-balance">
              {type === 'credit-card' ? 'Amount you currently owe (₹)' : 'Current balance (₹)'}
            </Label>
            <Input
              id="acc-balance"
              type="number"
              step="0.01"
              min={type === 'credit-card' ? '0' : undefined}
              placeholder="0"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
            />
          </div>
          <Button variant="outline" className="w-full" onClick={addDraft} disabled={!name.trim()}>
            + Add account
          </Button>
        </CardContent>
      </Card>

      <Button className="w-full" size="lg" disabled={drafts.length === 0} onClick={() => addAccounts(drafts)}>
        Finish setup ({drafts.length} account{drafts.length === 1 ? '' : 's'})
      </Button>
    </div>
  )
}
