import { useEffect, useState } from 'react'
import { HashRouter, NavLink, Route, Routes } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import DashboardPage from './pages/DashboardPage'
import TransactionsPage from './pages/TransactionsPage'
import BudgetsPage from './pages/BudgetsPage'
import ImportPage from './pages/ImportPage'
import SettingsPage from './pages/SettingsPage'
import Onboarding from './components/Onboarding'
import SyncStatus from './components/SyncStatus'
import { isConfigured } from './lib/cache'
import { initSync, flush } from './lib/sync'
import { useSyncState } from './hooks/useSyncState'

const navItems = [
  { to: '/', label: 'Dashboard', icon: '📊', end: true },
  { to: '/transactions', label: 'Transactions', icon: '📒' },
  { to: '/budgets', label: 'Budgets', icon: '🎯' },
  { to: '/import', label: 'Import', icon: '📥' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
]

export default function App() {
  const [configured, setConfigured] = useState(isConfigured)
  const sync = useSyncState()
  const queryClient = useQueryClient()

  useEffect(() => {
    initSync()
  }, [])

  if (!configured || sync.status === 'auth-error') {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900">
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

  return (
    <HashRouter>
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
            <span className="text-lg font-semibold">₹ Tracker</span>
            <nav className="hidden gap-1 md:flex">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `rounded-md px-3 py-1.5 text-sm font-medium ${
                      isActive
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <SyncStatus />
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-4 pb-24 md:py-6 md:pb-6">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/budgets" element={<BudgetsPage />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
        <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
          <div className="grid grid-cols-5">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
                    isActive ? 'text-slate-900' : 'text-slate-400'
                  }`
                }
              >
                <span className="text-xl leading-none" aria-hidden>
                  {item.icon}
                </span>
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </HashRouter>
  )
}
