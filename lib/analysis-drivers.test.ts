import { describe, it, expect } from 'vitest'
import { categoryDrivers, monthPace, type CatTotal } from './analysis-drivers'

const cat = (id: string, total: number): CatTotal => ({ id, name: id, color: '#000', bg_color: '#fff', icon: 'Tag', total })

describe('categoryDrivers', () => {
  it('ordena subidas y bajadas y calcula % y parte del cambio', () => {
    const r = categoryDrivers(
      [cat('super', 300_000), cat('salud', 50_000), cat('ocio', 80_000)],
      { super: 200_000, salud: 90_000, ocio: 80_000 },
    )
    expect(r.netDelta).toBe(60_000)
    expect(r.up.map(c => c.id)).toEqual(['super'])
    expect(r.up[0].delta).toBe(100_000)
    expect(r.up[0].deltaPct).toBe(50)
    expect(r.up[0].shareOfChange).toBe(167)
    expect(r.down.map(c => c.id)).toEqual(['salud'])
    expect(r.down[0].delta).toBe(-40_000)
  })

  it('categoría nueva: deltaPct null', () => {
    const r = categoryDrivers([cat('viaje', 120_000)], {})
    expect(r.up[0].deltaPct).toBeNull()
    expect(r.up[0].delta).toBe(120_000)
  })

  it('descarta cambios menores al umbral', () => {
    const r = categoryDrivers([cat('a', 10_500)], { a: 10_000 })
    expect(r.up).toHaveLength(0)
    expect(r.down).toHaveLength(0)
  })

  it('la caída de una categoría que ya no aparece entra al neto', () => {
    const r = categoryDrivers([cat('a', 100_000)], { a: 100_000, b: 50_000 })
    expect(r.netDelta).toBe(-50_000)
  })

  it('respeta maxUp', () => {
    const r = categoryDrivers([cat('a', 5000), cat('b', 6000), cat('c', 7000), cat('d', 8000)], {}, { maxUp: 2 })
    expect(r.up.map(c => c.id)).toEqual(['d', 'c'])
  })
})

describe('monthPace', () => {
  const base = { day: 10, daysInMonth: 30, fixedStillDue: 0 }

  it('calcula uso del presupuesto, % del mes y brecha de proyección', () => {
    const p = monthPace({ ...base, budget: 600_000, spent: 300_000, projection: 700_000 })
    expect(p.budgetUsedPct).toBe(50)
    expect(p.expectedPct).toBe(33)
    expect(p.gap).toBe(100_000)
  })

  it('margen diario descuenta fijos pendientes y cuenta hoy', () => {
    // quedan 21 días (incluye hoy); 600k - 300k - 90k = 210k → 10k/día
    const p = monthPace({ ...base, budget: 600_000, spent: 300_000, projection: null, fixedStillDue: 90_000 })
    expect(p.allowancePerDay).toBe(10_000)
  })

  it('margen diario nunca es negativo', () => {
    const p = monthPace({ ...base, budget: 100_000, spent: 300_000, projection: null })
    expect(p.allowancePerDay).toBe(0)
  })

  it('sin presupuesto no hay brecha ni margen', () => {
    const p = monthPace({ ...base, budget: null, spent: 300_000, projection: 700_000 })
    expect(p.budgetUsedPct).toBeNull()
    expect(p.gap).toBeNull()
    expect(p.allowancePerDay).toBeNull()
  })
})

import { findAnomalies, topMerchants, categoryBaseline, type ExpenseLite } from './analysis-drivers'

const C = { id: 'c1', name: 'Salud', color: '#000', bg_color: '#fff', icon: 'Tag' }
const ex = (id: string, amount: number, date: string, description = 'x', recurring: string | null = null): ExpenseLite =>
  ({ id, amount, date, description, recurring_expense_id: recurring, category: C })

describe('findAnomalies', () => {
  const hist = ['2026-04-02', '2026-04-10', '2026-05-03', '2026-05-12', '2026-06-04', '2026-06-20'].map((d, i) => ex(`h${i}`, 10_000, d))

  it('marca una compra ≥2.5× la mediana de su categoría', () => {
    const r = findAnomalies([...hist, ex('big', 60_000, '2026-07-05', 'Dentista')], '2026-07')
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ id: 'big', typical: 10_000, multiple: 6 })
  })

  it('ignora recurrentes y montos bajo el mínimo', () => {
    const r = findAnomalies([...hist, ex('rec', 60_000, '2026-07-05', 'Isapre', 'r1'), ex('small', 12_000, '2026-07-06')], '2026-07')
    expect(r).toHaveLength(0)
  })

  it('sin historial suficiente no hay anomalías', () => {
    expect(findAnomalies([ex('a', 10_000, '2026-06-01'), ex('big', 90_000, '2026-07-05')], '2026-07')).toHaveLength(0)
  })
})

describe('topMerchants', () => {
  it('agrupa por descripción normalizada y cuenta el mes anterior', () => {
    const list = [
      ex('1', 8000, '2026-07-01', 'Uber'), ex('2', 6000, '2026-07-09', 'uber '), ex('3', 5000, '2026-07-12', 'Café'),
      ex('4', 7000, '2026-06-03', 'Uber'),
    ]
    const r = topMerchants(list, '2026-07', '2026-06')
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ count: 2, total: 14_000, avg: 7000, prevCount: 1 })
  })
})

describe('categoryBaseline', () => {
  it('promedia solo meses previos y exige mínimo de meses', () => {
    const list = [ex('a', 100, '2026-04-01'), ex('b', 300, '2026-05-01'), ex('c', 200, '2026-06-01'), ex('d', 999, '2026-07-01')]
    expect(categoryBaseline(list, '2026-07').c1).toEqual({ avg: 200, months: 3 })
    expect(categoryBaseline(list.slice(0, 2), '2026-07').c1).toBeUndefined()
  })
})
