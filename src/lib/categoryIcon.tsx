import {
  ArrowLeftRight,
  BarChart3,
  Briefcase,
  Car,
  Cigarette,
  Clapperboard,
  Fuel,
  Gift,
  GraduationCap,
  HeartPulse,
  Home,
  type LucideIcon,
  PawPrint,
  Percent,
  PiggyBank,
  Plane,
  Receipt,
  Repeat,
  Scissors,
  Shield,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Tag,
  TrendingUp,
  Utensils,
} from 'lucide-react'
import type { Category } from './types'

/**
 * Perfin house rule: "No emoji in product UI. Category identity comes from
 * color + line icon." Known category ids map directly; anything else
 * (AI-invented categories) falls back to keyword matching, then a generic tag.
 */
const BY_ID: Record<string, LucideIcon> = {
  'food-drink': Utensils,
  transport: Car,
  groceries: ShoppingCart,
  bills: Receipt,
  shopping: ShoppingBag,
  health: HeartPulse,
  entertainment: Clapperboard,
  vices: Cigarette,
  investments: TrendingUp,
  'mutual-funds': BarChart3,
  travel: Plane,
  subscriptions: Repeat,
  education: GraduationCap,
  'personal-care': Scissors,
  salary: Briefcase,
  'other-income': PiggyBank,
  other: Tag,
  transfer: ArrowLeftRight,
}

const KEYWORD_ICONS: [RegExp, LucideIcon][] = [
  [/travel|flight|trip|vacation/, Plane],
  [/rent|housing|home|mortgage/, Home],
  [/educat|school|tuition|course/, GraduationCap],
  [/pet\b/, PawPrint],
  [/gift/, Gift],
  [/insurance/, Shield],
  [/fuel|petrol|diesel/, Fuel],
  [/phone|mobile|internet|broadband/, Smartphone],
  [/invest|mutual fund|stock|sip\b/, TrendingUp],
  [/interest|dividend|cashback|discount/, Percent],
  [/smoke|cigarette|sutta|alcohol|beer|wine|vape/, Cigarette],
  [/subscri|membership/, Repeat],
  [/salon|haircut|grooming|spa/, Scissors],
]

/** Line icon for a category, per Perfin's icon house rule. */
export function categoryIcon(category: Pick<Category, 'id' | 'name' | 'hints'> | null | undefined): LucideIcon {
  if (!category) return Tag
  if (BY_ID[category.id]) return BY_ID[category.id]
  const haystack = `${category.name} ${category.hints.join(' ')}`.toLowerCase()
  for (const [pattern, icon] of KEYWORD_ICONS) {
    if (pattern.test(haystack)) return icon
  }
  return Tag
}

const VIZ_COLORS = [
  'var(--viz-1)',
  'var(--viz-2)',
  'var(--viz-3)',
  'var(--viz-4)',
  'var(--viz-5)',
  'var(--viz-6)',
  'var(--viz-7)',
]

/** Deterministic data-viz color per category id — same category, same color, always. */
export function categoryColor(categoryId: string): string {
  let hash = 0
  for (let i = 0; i < categoryId.length; i++) hash = (hash * 31 + categoryId.charCodeAt(i)) >>> 0
  return VIZ_COLORS[hash % VIZ_COLORS.length]
}

export const TRANSFER_COLOR = 'var(--info-500)'
