import { describe, expect, it } from 'vitest'
import {
  computeImportHash,
  detectHeaderRow,
  extractRows,
  guessMapping,
  normalizeDesc,
  parseBankCsv,
  parseDateCell,
  sanitizeAmount,
} from '../csv'

describe('detectHeaderRow / parseBankCsv', () => {
  it('skips bank preamble lines to find the header', () => {
    const text = [
      'Account Statement for XXXX1234',
      'From 01/06/2026 to 30/06/2026',
      'Txn Date,Narration,Withdrawal Amt,Deposit Amt,Balance',
      '01/06/2026,UPI-SWIGGY,250.00,,10000.00',
      '02/06/2026,SALARY JUN,,90000.00,100000.00',
    ].join('\n')
    const parsed = parseBankCsv(text)
    expect(parsed.headers).toEqual(['Txn Date', 'Narration', 'Withdrawal Amt', 'Deposit Amt', 'Balance'])
    expect(parsed.rows).toHaveLength(2)
  })

  it('uses the first row when nothing looks like a header', () => {
    expect(detectHeaderRow([['a', 'b'], ['c', 'd']])).toBe(0)
  })
})

describe('guessMapping', () => {
  it('detects the Indian-bank debit/credit column shape', () => {
    const m = guessMapping(['Txn Date', 'Narration', 'Withdrawal Amt', 'Deposit Amt', 'Balance'])
    expect(m).toMatchObject({ mode: 'debitCredit', dateCol: 0, descCol: 1, debitCol: 2, creditCol: 3 })
  })

  it('falls back to single amount column', () => {
    const m = guessMapping(['Date', 'Description', 'Amount'])
    expect(m).toMatchObject({ mode: 'single', amountCol: 2 })
  })
})

describe('sanitizeAmount', () => {
  it('handles Indian digit grouping and currency symbols', () => {
    expect(sanitizeAmount('₹1,50,000.00')).toEqual({ value: 150000, indicator: undefined })
  })
  it('reads Cr/Dr suffixes', () => {
    expect(sanitizeAmount('1,500.00 Cr')).toEqual({ value: 1500, indicator: 'cr' })
    expect(sanitizeAmount('99.5 DR')).toEqual({ value: 99.5, indicator: 'dr' })
  })
  it('treats negatives and parentheses as debit', () => {
    expect(sanitizeAmount('-500')).toEqual({ value: 500, indicator: 'dr' })
    expect(sanitizeAmount('(500)')).toEqual({ value: 500, indicator: 'dr' })
  })
  it('returns null for empty or junk cells', () => {
    expect(sanitizeAmount('')).toBeNull()
    expect(sanitizeAmount('--')).toBeNull()
  })
})

describe('parseDateCell', () => {
  it('parses DD/MM/YYYY with mixed separators', () => {
    expect(parseDateCell('03/06/2026', 'DD/MM/YYYY')).toBe('2026-06-03')
    expect(parseDateCell('03-06-2026', 'DD/MM/YYYY')).toBe('2026-06-03')
  })
  it('parses YYYY-MM-DD', () => {
    expect(parseDateCell('2026-06-03', 'YYYY-MM-DD')).toBe('2026-06-03')
  })
  it('expands 2-digit years and drops time suffixes', () => {
    expect(parseDateCell('03/06/26 10:30', 'DD/MM/YYYY')).toBe('2026-06-03')
  })
  it('rejects junk', () => {
    expect(parseDateCell('Opening Balance', 'DD/MM/YYYY')).toBeNull()
  })
})

describe('normalizeDesc / computeImportHash', () => {
  it('strips reference numbers so re-exports hash identically', () => {
    expect(normalizeDesc('UPI-SWIGGY-9876543210-PAYMENT')).toBe(normalizeDesc('UPI-SWIGGY-1234567890-PAYMENT'))
  })
  it('is stable across amount formatting', () => {
    expect(computeImportHash('2026-06-01', 250, 'UPI SWIGGY')).toBe(
      computeImportHash('2026-06-01', 250.0, 'upi  swiggy'),
    )
  })
})

describe('extractRows', () => {
  const raw = {
    headers: ['Txn Date', 'Narration', 'Withdrawal Amt', 'Deposit Amt'],
    rows: [
      ['01/06/2026', 'UPI-SWIGGY', '250.00', ''],
      ['02/06/2026', 'SALARY JUN', '', '90,000.00'],
      ['Opening Balance', '', '', ''],
    ],
  }
  const mapping = guessMapping(raw.headers)

  it('produces typed rows and skips junk lines', () => {
    const rows = extractRows(raw, mapping)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ date: '2026-06-01', amount: 250, type: 'expense' })
    expect(rows[1]).toMatchObject({ date: '2026-06-02', amount: 90000, type: 'income' })
  })
})
