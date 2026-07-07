import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { makeAccountId, useAccounts } from '@/hooks/useData'
import { accountTypeEmoji, accountTypeLabel } from '@/lib/accounts'
import type { AccountType } from '@/lib/types'

export default function AccountsPage() {
  const { accounts, addAccounts, updateAccount } = useAccounts()
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<AccountType>('bank')
  const [newBalance, setNewBalance] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

  return (
    <div className="max-w-xl space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon-sm" asChild aria-label="Back to settings">
          <Link to="/settings">
            <ChevronLeft />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">Accounts</h1>
      </div>

      <Card>
        <CardContent className="space-y-3">
          <div className="divide-y">
            {accounts.map((acc) => {
              const isCard = acc.type === 'credit-card'
              return (
                <div key={acc.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="text-lg">{accountTypeEmoji[acc.type]}</span>
                  <Input
                    className="h-8 min-w-0 flex-1"
                    value={acc.name}
                    onChange={(e) => updateAccount(acc.id, { name: e.target.value })}
                  />
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {isCard ? 'owes ₹' : 'start ₹'}
                    <Input
                      className="h-8 w-28 text-right tabular-nums"
                      type="number"
                      step="0.01"
                      min={isCard ? '0' : undefined}
                      value={isCard ? Math.abs(acc.startingBalance) : acc.startingBalance}
                      onChange={(e) => {
                        const v = Number(e.target.value) || 0
                        updateAccount(acc.id, { startingBalance: isCard ? -Math.abs(v) : v })
                      }}
                    />
                  </label>
                </div>
              )
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <Input
              className="h-8 min-w-0 flex-1"
              placeholder="New account name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-sm shadow-xs"
              value={newType}
              onChange={(e) => setNewType(e.target.value as AccountType)}
            >
              {(Object.keys(accountTypeLabel) as AccountType[]).map((t) => (
                <option key={t} value={t}>
                  {accountTypeEmoji[t]} {accountTypeLabel[t]}
                </option>
              ))}
            </select>
            <Input
              className="h-8 w-28 text-right tabular-nums"
              type="number"
              step="0.01"
              min={newType === 'credit-card' ? '0' : undefined}
              placeholder={newType === 'credit-card' ? 'owe ₹' : 'balance ₹'}
              value={newBalance}
              onChange={(e) => setNewBalance(e.target.value)}
            />
            <Button
              size="sm"
              disabled={!newName.trim()}
              onClick={() => {
                let id = makeAccountId(newName)
                if (accounts.some((a) => a.id === id)) id = `${id}-${accounts.length + 1}`
                const magnitude = Number(newBalance) || 0
                addAccounts([
                  {
                    id,
                    name: newName.trim(),
                    type: newType,
                    startingBalance: newType === 'credit-card' ? -Math.abs(magnitude) : magnitude,
                    createdAt: new Date().toISOString(),
                  },
                ])
                setNewName('')
                setNewBalance('')
                setNotice('Account added.')
                setTimeout(() => setNotice(null), 2500)
              }}
            >
              Add
            </Button>
          </div>
          {notice && <p className="text-xs text-[var(--positive-600)]">{notice}</p>}
        </CardContent>
      </Card>
    </div>
  )
}
