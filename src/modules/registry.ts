import { financeModule } from './finance'
import { fitnessModule } from './fitness'
import { healthModule } from './health'
import type { ModuleDef } from './types'

export type { ModuleDef, ModuleNavItem, ModuleRoute } from './types'

/** Every Life OS module, in hub display order. Add new modules here. */
export const modules: ModuleDef[] = [financeModule, fitnessModule, healthModule]

export function moduleForPath(pathname: string): ModuleDef | undefined {
  return modules.find((m) => pathname === `/${m.id}` || pathname.startsWith(`/${m.id}/`))
}
