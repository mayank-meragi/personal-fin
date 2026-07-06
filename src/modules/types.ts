import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'

export interface ModuleNavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Exact-match for the module's index route */
  end?: boolean
}

export interface ModuleRoute {
  /** Absolute path, e.g. "/finance/budgets" */
  path: string
  element: ComponentType
}

/**
 * One Life OS module. The shell renders routes and nav from this; the hub
 * renders `card`; the assistant merges every module's tools and overview.
 */
export interface ModuleDef {
  id: string
  name: string
  icon: LucideIcon
  /** One-liner under the name on the hub card */
  tagline: string
  routes: ModuleRoute[]
  navItems: ModuleNavItem[]
  /** Live-headline body rendered inside the hub card */
  card: ComponentType
}
