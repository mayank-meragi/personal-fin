import { HeartPulse, Moon, Scale, UtensilsCrossed } from 'lucide-react'
import type { ModuleDef } from '../types'
import FoodPage from './pages/FoodPage'
import BodyPage from './pages/BodyPage'
import SleepPage from './pages/SleepPage'
import HealthCard from './components/HealthCard'

export const healthModule: ModuleDef = {
  id: 'health',
  name: 'Health',
  icon: HeartPulse,
  tagline: 'Food, body & sleep',
  routes: [
    { path: '/health', element: FoodPage },
    { path: '/health/body', element: BodyPage },
    { path: '/health/sleep', element: SleepPage },
  ],
  navItems: [
    { to: '/health', label: 'Food', icon: UtensilsCrossed, end: true },
    { to: '/health/body', label: 'Body', icon: Scale },
    { to: '/health/sleep', label: 'Sleep', icon: Moon },
  ],
  card: HealthCard,
}
