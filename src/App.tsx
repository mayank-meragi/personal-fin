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
      <div className="min-h-screen bg-muted/40 text-foreground">
        <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4">
            <span className="text-base font-semibold tracking-tight">₹ Tracker</span>
            <nav className="hidden gap-1 md:flex">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      'inline-flex h-8 items-center rounded-md px-3 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-secondary text-secondary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
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
        <main className="mx-auto max-w-5xl px-4 py-4 pb-24 md:py-6 md:pb-8">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/budgets" element={<BudgetsPage />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
        <nav className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          <div className="grid grid-cols-5">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center gap-1 py-2 text-[10px] font-medium transition-colors',
                    isActive ? 'text-foreground' : 'text-muted-foreground',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon className={cn('size-5', isActive && 'stroke-[2.25]')} aria-hidden />
                    {item.label}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </HashRouter>
  )
}
