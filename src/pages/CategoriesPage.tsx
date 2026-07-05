import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, PiggyBank, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useCategories } from '../hooks/useData'
import { groupedCategories } from '../lib/categories'
import { categoryColor, categoryIcon } from '../lib/categoryIcon'
import { generateCategory, GeminiError, hasGeminiKey, NoGeminiKeyError } from '../lib/gemini'
import type { Category } from '../lib/types'

/** Toggle chip for a category's spending/savings nature */
function cnSavings(savings?: boolean): string {
  return savings
    ? 'inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--positive-100)] px-2 py-1 text-[10px] font-bold text-[var(--positive-600)]'
    : 'inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-2 py-1 text-[10px] font-medium text-muted-foreground ring-1 ring-[var(--border-subtle)]'
}

export default function CategoriesPage() {
  const { categories, addCategory, updateCategory } = useCategories()
  const [catDesc, setCatDesc] = useState('')
  const [catBusy, setCatBusy] = useState(false)
  const [catError, setCatError] = useState<string | null>(null)
  const [catPreview, setCatPreview] = useState<Category | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function suggestCategory() {
    const desc = catDesc.trim()
    if (!desc || catBusy) return
    setCatBusy(true)
    setCatError(null)
    setCatPreview(null)
    try {
      setCatPreview(await generateCategory(desc, categories))
    } catch (e) {
      if (e instanceof NoGeminiKeyError) setCatError('Add a Gemini key in Settings to create categories with AI.')
      else setCatError(e instanceof GeminiError ? e.message : 'Could not create a category from that.')
    } finally {
      setCatBusy(false)
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon-sm" asChild aria-label="Back to settings">
          <Link to="/settings">
            <ChevronLeft />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">Categories</h1>
      </div>

      <Card>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              className="h-9 min-w-0 flex-1"
              placeholder='Describe one — "vices: cigarettes, alcohol"…'
              value={catDesc}
              onChange={(e) => setCatDesc(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void suggestCategory()
              }}
            />
            <Button
              size="sm"
              className="h-9"
              disabled={catBusy || !catDesc.trim() || !hasGeminiKey()}
              onClick={() => void suggestCategory()}
            >
              <Sparkles data-icon="inline-start" />
              {catBusy ? 'Thinking…' : 'Create with AI'}
            </Button>
          </div>
          {catError && <p className="text-xs text-[var(--negative-600)]">{catError}</p>}
          {notice && <p className="text-xs text-[var(--positive-600)]">{notice}</p>}
          {catPreview && (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-[var(--surface-sunken)] p-3">
              <span className="text-lg">{catPreview.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[var(--text-strong)]">
                  {catPreview.parent
                    ? `${categories.find((c) => c.id === catPreview.parent)?.name} › ${catPreview.name}`
                    : catPreview.name}{' '}
                  <span className="font-normal text-muted-foreground">
                    ({catPreview.savings ? 'savings' : catPreview.type})
                  </span>
                </p>
                <p className="truncate text-xs text-muted-foreground">matches: {catPreview.hints.join(', ')}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setCatPreview(null)}>
                Discard
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  addCategory(catPreview)
                  setCatPreview(null)
                  setCatDesc('')
                  setNotice(`Category "${catPreview.name}" added.`)
                  setTimeout(() => setNotice(null), 2500)
                }}
              >
                Add
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {groupedCategories(categories, 'expense').map(({ parent, children }) => {
          const color = categoryColor(parent.id)
          const Icon = categoryIcon(parent)
          return (
            <Card key={parent.id} className="p-4">
              <div className="flex items-start gap-3">
                <span
                  className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-md)]"
                  style={{ background: `color-mix(in oklch, ${color} 16%, white)`, color }}
                >
                  <Icon className="size-[18px]" strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[var(--text-strong)]">{parent.name}</p>
                  {parent.hints.length > 0 && (
                    <p className="truncate text-xs text-muted-foreground">{parent.hints.slice(0, 4).join(', ')} etc.</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => updateCategory(parent.id, { savings: !parent.savings || undefined })}
                  className={cnSavings(parent.savings)}
                  title="Savings outflow is reported as saved, not spent"
                >
                  <PiggyBank className="size-3" />
                  {parent.savings ? 'Savings' : 'Spending'}
                </button>
              </div>
              {children.length > 0 && (
                <div className="grid grid-cols-4 gap-2 border-t border-[var(--border-subtle)] pt-3 sm:grid-cols-5">
                  {children.map((c) => {
                    const cColor = categoryColor(c.id)
                    const CIcon = categoryIcon(c)
                    return (
                      <div key={c.id} className="flex flex-col items-center gap-1.5 text-center" title={c.hints.join(', ')}>
                        <span
                          className="flex size-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface-sunken)]"
                          style={{ color: cColor }}
                        >
                          <CIcon className="size-[18px]" strokeWidth={2} />
                        </span>
                        <span className="line-clamp-2 inline-flex items-center gap-0.5 text-[10px] font-medium leading-tight text-muted-foreground">
                          {c.name}
                          {c.savings && <PiggyBank className="size-3 shrink-0 text-[var(--positive-600)]" />}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
          )
        })}
      </div>

      <div>
        <h2 className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Income</h2>
        <div className="flex flex-wrap gap-1.5">
          {categories
            .filter((c) => c.type === 'income')
            .map((c) => {
              const color = categoryColor(c.id)
              const Icon = categoryIcon(c)
              return (
                <span
                  key={c.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-card)] py-1 pr-2.5 pl-1 text-xs font-medium shadow-[var(--shadow-xs)] ring-1 ring-[var(--border-subtle)]"
                  title={c.hints.join(', ')}
                >
                  <span
                    className="flex size-5 items-center justify-center rounded-full"
                    style={{ background: `color-mix(in oklch, ${color} 16%, white)`, color }}
                  >
                    <Icon className="size-3" strokeWidth={2} />
                  </span>
                  {c.name}
                </span>
              )
            })}
        </div>
      </div>
    </div>
  )
}
