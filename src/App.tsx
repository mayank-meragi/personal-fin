import { useEffect, useState } from 'react'
import { HashRouter, NavLink, Route, Routes } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Download, LayoutDashboard, ReceiptText, Settings, Target } from 'lucide-react'
import DashboardPage from './pages/DashboardPage'
import TransactionsPage from './pages/TransactionsPage'
import BudgetsPage from './pages/BudgetsPage'
import ImportPage from './pages/ImportPage'
import SettingsPage from './pages/SettingsPage'
import Onboarding from './components/Onboarding'
import AccountSetup from './components/AccountSetup'
import SyncStatus from './components/SyncStatus'
import { isConfigured } from './lib/cache'
import { initSync, flush } from './lib/sync'
import { useSyncState } from './hooks/useSyncState'
import { useAccounts } from './hooks/useData'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/transactions', label: 'Activity', icon: ReceiptText },
  { to: '/budgets', label: 'Budgets', icon: Target },
  { to: '/import', label: 'Import', icon: Download },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export default function App() {
  const [configured, setConfigured] = useState(isConfigured)
  const sync = useSyncState()
  const queryClient = useQueryClient()
  const { accounts, isReady: accountsReady } = useAccounts()

  useEffect(() => {
    initSync()
  }, [])

  if (!configured || sync.status === 'auth-error') {
    return (
      <div className="min-h-screen bg-muted/40 text-foreground">
        <Onboarding
          expired={sync.status === 'auth-error'}
          onDone={() => {
            setConfigured(true)
            void queryClient.invalidateQueries()
            void flush()
          }}
        />
      </div>
    )
  }

  if (accountsReady && accounts.length === 0) {
    return (
      <div className="min-h-screen bg-muted/40 text-foreground">
        <AccountSetup />
      </div>
    )
  }

  return (
    <HashRouter>
      <div className="min-h-screen bg-background text-foreground">
        <header className="sticky top-0 z-20 bg-background/85 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4">
            <span className="text-base font-bold tracking-tight">₹ Tracker</span>
            <nav className="hidden gap-1 md:flex">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      'inline-flex h-9 items-center rounded-full px-4 text-sm font-semibold transition-colors',
                      isActive
                        ? 'bg-card text-foreground shadow-sm ring-1 ring-foreground/[0.045]'
                        : 'text-muted-foreground hover:text-foreground',
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <SyncStatus />
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-3 pb-28 md:py-6 md:pb-10">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/budgets" element={<BudgetsPage />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
        <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-20 px-8 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] md:hidden">
          <div className="pointer-events-auto mx-auto flex max-w-xs items-center justify-between rounded-full bg-card p-1.5 shadow-[0_8px_30px_-8px_oklch(0.3_0.055_279/0.35)] ring-1 ring-foreground/[0.06]">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                aria-label={item.label}
                className={({ isActive }) =>
                  cn(
                    'flex size-11 items-center justify-center rounded-full transition-colors',
                    isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                  )
                }
              >
                <item.icon className="size-5" aria-hidden />
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </HashRouter>
  )
}
