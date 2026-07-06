import { CalendarDays, ClipboardList, Dumbbell, LibraryBig } from 'lucide-react'
import type { ModuleDef } from '../types'
import TodayPage from './pages/TodayPage'
import ExercisesPage from './pages/ExercisesPage'
import HistoryPage from './pages/HistoryPage'
import PlanPage from './pages/PlanPage'
import FitnessCard from './components/FitnessCard'

export const fitnessModule: ModuleDef = {
  id: 'fitness',
  name: 'Fitness',
  icon: Dumbbell,
  tagline: 'Workouts, exercises & progress',
  routes: [
    { path: '/fitness', element: TodayPage },
    { path: '/fitness/exercises', element: ExercisesPage },
    { path: '/fitness/history', element: HistoryPage },
    { path: '/fitness/plan', element: PlanPage },
  ],
  navItems: [
    { to: '/fitness', label: 'Today', icon: Dumbbell, end: true },
    { to: '/fitness/exercises', label: 'Exercises', icon: LibraryBig },
    { to: '/fitness/history', label: 'History', icon: CalendarDays },
    { to: '/fitness/plan', label: 'Plan', icon: ClipboardList },
  ],
  card: FitnessCard,
}
