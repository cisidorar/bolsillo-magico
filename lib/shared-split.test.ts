import { describe, it, expect } from 'vitest'
import {
  splitByWeights, equalWeights, incomeWeights, exactValid, groupBalance, suggestedTransfers,
  tripStage, cardAmount, sumCardAmounts, representativeIncome, spentByCategory,
} from './shared-split'

const A = 'a', B = 'b', C = 'c'
const sum = (r: Record<string, number>) => Object.values(r).reduce((s, v) => s + v, 0)

describe('splitByWeights', () => {
  it('50/50 impar: el extra va a quien NO pagó', () => {
    expect(splitByWeights(1001, equalWeights([A, B]), A)).toEqual({ a: 500, b: 501 })
    expect(splitByWeights(1001, equalWeights([A, B]), B)).toEqual({ a: 501, b: 500 })
  })
  it('tres personas parejo suma exacto', () => {
    const r = splitByWeights(100, equalWeights([A, B, C]), A)
    expect(sum(r)).toBe(100)
    expect(r.a).toBe(33) // el pagador se queda con el menor
    expect(r.b + r.c).toBe(67)
  })
  it('por sueldo 62/38', () => {
    const w = incomeWeights([{ id: A, income: 1240000 }, { id: B, income: 760000 }])!
    const r = splitByWeights(480000, w, A)
    expect(r).toEqual({ a: 297600, b: 182400 })
  })
  it('por sueldo con 3 personas suma exacto', () => {
    const w = incomeWeights([{ id: A, income: 1000000 }, { id: B, income: 700000 }, { id: C, income: 300000 }])!
    for (const amt of [1, 7, 999, 123457, 480001]) expect(sum(splitByWeights(amt, w, B))).toBe(amt)
  })
  it('sin ingreso no adivina', () => {
    expect(incomeWeights([{ id: A, income: 1000 }, { id: B, income: 0 }])).toBeNull()
  })
  it('una sola persona se queda con todo', () => {
    expect(splitByWeights(5000, equalWeights([A]), A)).toEqual({ a: 5000 })
  })
  it('rechaza montos inválidos', () => {
    expect(() => splitByWeights(0, equalWeights([A]), A)).toThrow('invalid_amount')
    expect(() => splitByWeights(10.5, equalWeights([A]), A)).toThrow('invalid_amount')
    expect(() => splitByWeights(10, [], A)).toThrow('invalid_participants')
  })
  it('siempre suma exacto, muchos montos y personas', () => {
    for (let n = 1; n <= 6; n++) {
      const ids = Array.from({ length: n }, (_, i) => `u${i}`)
      const w = ids.map((id, i) => ({ id, w: 1 + i * 37 }))
      for (let amt = 1; amt < 400; amt += 13) expect(sum(splitByWeights(amt, w, ids[0]))).toBe(amt)
    }
  })
})

describe('exactValid', () => {
  it('debe sumar el total', () => {
    expect(exactValid(1000, { a: 300, b: 700 })).toBe(true)
    expect(exactValid(1000, { a: 300, b: 600 })).toBe(false)
    expect(exactValid(1000, { a: -100, b: 1100 })).toBe(false)
  })
})

describe('groupBalance', () => {
  const e = (paid_by: string, amount: number, shares: Record<string, number>) => ({ amount, paid_by, shares })
  it('neto por persona suma cero', () => {
    const b = groupBalance([e(A, 300, { a: 100, b: 100, c: 100 })], [], [A, B, C])
    expect(b.net).toEqual({ a: 200, b: -100, c: -100 })
    expect(b.total).toBe(300)
  })
  it('saldar baja la deuda', () => {
    const b = groupBalance([e(A, 300, { a: 100, b: 100, c: 100 })], [{ from_user: B, to_user: A, amount: 100 }], [A, B, C])
    expect(b.net).toEqual({ a: 100, b: 0, c: -100 })
  })
  it('un pagador con parte 0 es solo acreedor', () => {
    const b = groupBalance([e(A, 100, { b: 100 })], [], [A, B])
    expect(b.net).toEqual({ a: 100, b: -100 })
  })
  it('sin gastos todo es cero', () => {
    expect(groupBalance([], [], [A, B]).net).toEqual({ a: 0, b: 0 })
  })
})

describe('suggestedTransfers', () => {
  it('deja a todos a mano', () => {
    const t = suggestedTransfers({ a: 200, b: -100, c: -100 })
    expect(t).toEqual([{ from: 'b', to: 'a', amount: 100 }, { from: 'c', to: 'a', amount: 100 }])
  })
  it('cadena cruzada', () => {
    const t = suggestedTransfers({ a: 150, b: -50, c: -100 })
    const net: Record<string, number> = { a: 150, b: -50, c: -100 }
    for (const x of t) { net[x.from] += x.amount; net[x.to] -= x.amount }
    expect(Object.values(net).every(v => v === 0)).toBe(true)
  })
  it('sin deudas no hay transferencias', () => {
    expect(suggestedTransfers({ a: 0, b: 0 })).toEqual([])
  })
})

describe('tripStage', () => {
  const g = (start: string | null, end: string | null, closed: string | null = null) => ({ start_date: start, end_date: end, closed_at: closed })
  it('sin fechas: planificando', () => expect(tripStage(g(null, null), '2026-10-18', false)).toBe('planning'))
  it('antes de salir', () => expect(tripStage(g('2026-12-01', '2026-12-10'), '2026-10-18', false)).toBe('planning'))
  it('durante el viaje', () => expect(tripStage(g('2026-12-01', '2026-12-10'), '2026-12-05', true)).toBe('traveling'))
  it('después: por saldar si hay saldo', () => expect(tripStage(g('2026-12-01', '2026-12-10'), '2026-12-20', true)).toBe('settling'))
  it('después y cuadrado: cerrado', () => expect(tripStage(g('2026-12-01', '2026-12-10'), '2026-12-20', false)).toBe('closed'))
  it('cerrado a mano gana', () => expect(tripStage(g(null, null, '2026-12-01T00:00:00Z'), '2026-10-18', true)).toBe('closed'))
})

describe('cardAmount (D4: cuadratura de tarjeta)', () => {
  it('suma tu parte más lo que pagaste por el otro', () => {
    // Pagaste $480.000 con tu Visa, tu parte es $297.600
    expect(cardAmount({ amount: 297600, card_extra: 182400 })).toBe(480000)
  })
  it('sin card_extra es solo el monto', () => {
    expect(cardAmount({ amount: 5000 })).toBe(5000)
    expect(cardAmount({ amount: 5000, card_extra: null })).toBe(5000)
    expect(cardAmount({ amount: 5000, card_extra: 0 })).toBe(5000)
  })
  it('el estado de cuenta cuadra con el banco', () => {
    const rows = [
      { amount: 12000, card_extra: 0 },
      { amount: 297600, card_extra: 182400 },
      { amount: 3000 },
    ]
    expect(sumCardAmounts(rows)).toBe(12000 + 480000 + 3000)
  })
})

describe('reparto según ingresos', () => {
  it('promedio de los últimos 3 meses, ignora meses sin ingreso', () => {
    expect(representativeIncome([1200000, 1000000, 0, 800000, 500000])).toBe(1000000)
    expect(representativeIncome([0, 0])).toBeNull()
    expect(representativeIncome([])).toBeNull()
  })
})

describe('spentByCategory', () => {
  it('agrupa por categoría del viaje', () => {
    const r = spentByCategory([
      { trip_category: 'alojamiento', amount: 480000 },
      { trip_category: 'comida', amount: 90000 },
      { trip_category: 'comida', amount: 45000 },
    ])
    expect(r.alojamiento).toBe(480000)
    expect(r.comida).toBe(135000)
    expect(r.otros).toBe(0)
  })
})
