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
  { to: '/', label: 'Dashboard', end: true },
  { to: '/transactions', label: 'Transactions' },
  { to: '/budgets', label: 'Budgets' },
  { to: '/import', label: 'Import' },
  { to: '/settings', label: 'Settings' },
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
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
            <span className="text-lg font-semibold">₹ Tracker</span>
            <nav className="flex gap-1">
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
        <main className="mx-auto max-w-5xl px-4 py-6">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/budgets" element={<BudgetsPage />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  )
}
