import { describe, it, expect } from 'vitest'
import { planTotals, planByCategory, overCap, qtyLabel, perDay, type PlanLine } from './trip-plan-items'

const base: PlanLine = {
  trip_category: 'alojamiento', est_amount: 100, kind: 'reserva', quantity: 1,
  unit_amount: null, cap_amount: null, optional: false, enabled: true, paid_at: null,
}
const L = (o: Partial<PlanLine>): PlanLine => ({ ...base, ...o })

describe('planTotals', () => {
  it('separa reservas y gasto durante', () => {
    const t = planTotals([L({ est_amount: 600 }), L({ kind: 'durante', trip_category: 'comida', est_amount: 400 })])
    expect(t).toEqual({ before: 600, during: 400, total: 1000, optionalOff: 0 })
  })
  it('ignora pagados y opcionales apagados', () => {
    const t = planTotals([
      L({ est_amount: 500, paid_at: '2026-10-01' }),
      L({ kind: 'durante', est_amount: 300, optional: true, enabled: false }),
      L({ kind: 'durante', est_amount: 200, optional: true, enabled: true }),
    ])
    expect(t).toEqual({ before: 0, during: 200, total: 200, optionalOff: 300 })
  })
})

describe('planByCategory', () => {
  it('agrupa por categoría', () => {
    const c = planByCategory([L({ est_amount: 10 }), L({ est_amount: 5, kind: 'durante' }), L({ trip_category: 'comida', est_amount: 7, kind: 'durante' })])
    expect(c.alojamiento).toEqual({ before: 10, during: 5 })
    expect(c.comida).toEqual({ before: 0, during: 7 })
  })
})

describe('overCap', () => {
  it('sin tope es 0', () => expect(overCap(L({}))).toBe(0))
  it('usa precio unitario', () => expect(overCap(L({ est_amount: 500000, quantity: 4, unit_amount: 125000, cap_amount: 120000 }))).toBe(5000))
  it('dentro del tope es 0', () => expect(overCap(L({ est_amount: 400000, quantity: 4, unit_amount: 100000, cap_amount: 120000 }))).toBe(0))
  it('cantidad 1 compara contra el total', () => expect(overCap(L({ est_amount: 130, cap_amount: 120 }))).toBe(10))
})

describe('helpers', () => {
  it('qtyLabel solo con cantidad > 1', () => {
    expect(qtyLabel({ quantity: 4, unit_amount: 100 }, n => `$${n}`)).toBe('4 × $100')
    expect(qtyLabel({ quantity: 1, unit_amount: 100 }, n => `$${n}`)).toBeNull()
  })
  it('perDay redondea hacia arriba', () => {
    expect(perDay(480000, 8)).toBe(60000)
    expect(perDay(100, 3)).toBe(34)
  })
})
