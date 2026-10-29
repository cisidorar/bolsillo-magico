import { describe, it, expect } from 'vitest'
import { fixedShare, risingCategories, budgetMismatches } from './trend-insights'
import type { ExpenseLite } from './analysis-drivers'

const cat = (id: string) => ({ id, name: id, color: '#000', bg_color: '#fff', icon: 'Tag' })
const ex = (c: string, amount: number, date: string, rec: string | null = null): ExpenseLite =>
  ({ id: `${c}${date}${amount}`, amount, date, description: 'x', recurring_expense_id: rec, category: cat(c) })

describe('fixedShare', () => {
  it('separa fijo de total por mes', () => {
    const r = fixedShare([ex('a', 300, '2026-06-01', 'r'), ex('a', 700, '2026-06-02'), ex('a', 100, '2026-07-01')], ['2026-06', '2026-07'])
    expect(r[0]).toEqual({ key: '2026-06', fixed: 300, total: 1000, pct: 30 })
    expect(r[1].pct).toBe(0)
  })
})

describe('risingCategories', () => {
  const keys = ['2026-05', '2026-06', '2026-07']
  it('detecta 3 meses seguidos al alza', () => {
    const r = risingCategories([ex('ocio', 10_000, '2026-05-01'), ex('ocio', 20_000, '2026-06-01'), ex('ocio', 30_000, '2026-07-01')], keys)
    expect(r).toHaveLength(1)
    expect(r[0].growthPct).toBe(200)
  })
  it('ignora si no es monótono o es chico', () => {
    expect(risingCategories([ex('a', 10_000, '2026-05-01'), ex('a', 30_000, '2026-06-01'), ex('a', 20_000, '2026-07-01')], keys)).toHaveLength(0)
    expect(risingCategories([ex('a', 1_000, '2026-05-01'), ex('a', 2_000, '2026-06-01'), ex('a', 3_000, '2026-07-01')], keys)).toHaveLength(0)
  })
})

describe('budgetMismatches', () => {
  const keys = ['2026-05', '2026-06', '2026-07']
  it('marca límite muy bajo y muy alto', () => {
    const list = [
      ex('edu', 30_000, '2026-05-01'), ex('edu', 35_000, '2026-06-01'), ex('edu', 40_000, '2026-07-01'),
      ex('fam', 20_000, '2026-05-01'), ex('fam', 25_000, '2026-06-01'), ex('fam', 15_000, '2026-07-01'),
    ]
    const r = budgetMismatches(list, keys, { edu: 5_000, fam: 160_000 })
    expect(r.map(x => [x.category.id, x.kind, x.typical])).toEqual([['fam', 'high', 20_000], ['edu', 'low', 35_000]])
  })
  it('sin desvío relevante no marca nada', () => {
    const list = [ex('a', 50_000, '2026-05-01'), ex('a', 52_000, '2026-06-01'), ex('a', 48_000, '2026-07-01')]
    expect(budgetMismatches(list, keys, { a: 50_000 })).toHaveLength(0)
  })
})
