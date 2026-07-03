import { describe, expect, it } from 'vitest'
import { quickParse, categorize } from '../quickParse'
import { defaultCategories } from '../../defaults/categories'

const cats = defaultCategories.categories

describe('quickParse', () => {
  it('parses "2 tea of 5" as quantity × unit price', () => {
    const [entry] = quickParse('2 tea of 5', cats)
    expect(entry).toMatchObject({
      description: 'tea',
      quantity: 2,
      unitAmount: 5,
      totalAmount: 10,
      category: 'food-drink',
      type: 'expense',
    })
  })

  it('parses "tea 5" as a single total', () => {
    const [entry] = quickParse('tea 5', cats)
    expect(entry).toMatchObject({ description: 'tea', totalAmount: 5, category: 'food-drink' })
  })

  it('parses "5 tea" (amount first) as a single total', () => {
    const [entry] = quickParse('5 tea', cats)
    expect(entry).toMatchObject({ description: 'tea', totalAmount: 5 })
  })

  it('splits "coffee 30 and auto 60" into two entries', () => {
    const entries = quickParse('coffee 30 and auto 60', cats)
    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({ description: 'coffee', totalAmount: 30, category: 'food-drink' })
    expect(entries[1]).toMatchObject({ description: 'auto', totalAmount: 60, category: 'transport' })
  })

  it('splits on commas and newlines too', () => {
    expect(quickParse('tea 10, coffee 20\nauto 30', cats)).toHaveLength(3)
  })

  it('handles ₹ symbols and decimals', () => {
    const [entry] = quickParse('uber ₹249.50', cats)
    expect(entry).toMatchObject({ totalAmount: 249.5, category: 'transport' })
  })

  it('classifies income keywords as income', () => {
    const [entry] = quickParse('salary 90000', cats)
    expect(entry).toMatchObject({ type: 'income', category: 'salary', totalAmount: 90000 })
  })

  it('supports @ as unit-price separator', () => {
    const [entry] = quickParse('3 coffee @ 40', cats)
    expect(entry).toMatchObject({ quantity: 3, totalAmount: 120 })
  })

  it('returns empty for unparseable input', () => {
    expect(quickParse('hello there', cats)).toEqual([])
    expect(quickParse('', cats)).toEqual([])
  })

  it('rejects zero amounts', () => {
    expect(quickParse('tea 0', cats)).toEqual([])
  })
})

describe('categorize', () => {
  it('falls back to "other" when nothing matches', () => {
    expect(categorize('mystery item', cats).id).toBe('other')
  })

  it('matches hints case-insensitively', () => {
    expect(categorize('SWIGGY order', cats).id).toBe('food-drink')
  })
})
