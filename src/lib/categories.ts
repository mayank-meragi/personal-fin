import type { Category, TransactionType } from './types'

/** "Mutual Funds" under "Investments" displays as "Investments › Mutual Funds". */
export function categoryDisplayName(category: Category, all: Category[]): string {
  if (!category.parent) return category.name
  const parent = all.find((c) => c.id === category.parent)
  return parent ? `${parent.name} › ${category.name}` : category.name
}

export interface CategoryGroup {
  parent: Category
  children: Category[]
}

/**
 * Categories of a type arranged for grouped selects: top-level categories in
 * file order, each carrying its subcategories. Orphaned subcategories (parent
 * missing or of another type) surface as top-level so nothing disappears.
 */
export function groupedCategories(all: Category[], type: TransactionType): CategoryGroup[] {
  const ofType = all.filter((c) => c.type === type)
  const topLevel = ofType.filter((c) => !c.parent || !ofType.some((p) => p.id === c.parent))
  return topLevel.map((parent) => ({
    parent,
    children: ofType.filter((c) => c.parent === parent.id),
  }))
}
