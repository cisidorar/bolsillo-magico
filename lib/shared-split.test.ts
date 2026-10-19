import { describe, it, expect } from 'vitest'
import {
  splitAmount, ratioToPct, groupBalance, balanceFor, tripStage,
  cardAmount, sumCardAmounts, incomeRatio, representativeIncome, spentByCategory,
} from './shared-split'

const A = 'user-a', B = 'user-b'

describe('splitAmount', () => {
  it('reparte según el % y suma exacto', () => {
    const r = splitAmount(480000, 'group', 0.62, true)
    expect(r.shareA + r.shareB).toBe(480000)
    expect(r.shareA).toBe(297600)
    expect(r.shareB).toBe(182400)
  })

  it('el peso del redondeo queda con quien pagó', () => {
    // 100 * 0.625 = 62.5: A pagó → B redondea su parte, A absorbe el resto
    const paidByA = splitAmount(101, 'group', 0.625, true)
    const paidByB = splitAmount(101, 'group', 0.625, false)
    expect(paidByA.shareA + paidByA.shareB).toBe(101)
    expect(paidByB.shareA + paidByB.shareB).toBe(101)
    // shareB(A pagó) = round(101*0.375)=round(37.875)=38 → A=63
    expect(paidByA).toEqual({ shareA: 63, shareB: 38 })
    // shareA(B pagó) = round(101*0.625)=round(63.125)=63 → B=38
    expect(paidByB).toEqual({ shareA: 63, shareB: 38 })
  })

  it('50/50 con monto impar', () => {
    // el otro redondea su parte hacia arriba (500,5 → 501); el pagador absorbe el resto
    expect(splitAmount(1001, 'equal', null, true)).toEqual({ shareA: 500, shareB: 501 })
    expect(splitAmount(1001, 'equal', null, false)).toEqual({ shareA: 501, shareB: 500 })
  })

  it('100% de uno', () => {
    expect(splitAmount(50000, 'only_a', null, false)).toEqual({ shareA: 50000, shareB: 0 })
    expect(splitAmount(50000, 'only_b', null, true)).toEqual({ shareA: 0, shareB: 50000 })
  })

  it('montos exactos', () => {
    expect(splitAmount(1000, 'exact', null, true, 300)).toEqual({ shareA: 300, shareB: 700 })
    expect(() => splitAmount(1000, 'exact', null, true, 1200)).toThrow('invalid_exact_share')
    expect(() => splitAmount(1000, 'exact', null, true)).toThrow('invalid_exact_share')
  })

  it('sin % acordado no adivina', () => {
    expect(() => splitAmount(1000, 'group', null, true)).toThrow('ratio_not_agreed')
  })

  it('rechaza montos inválidos', () => {
    expect(() => splitAmount(0, 'equal', null, true)).toThrow('invalid_amount')
    expect(() => splitAmount(10.5, 'equal', null, true)).toThrow('invalid_amount')
  })

  it('siempre suma exacto, para muchos montos y porcentajes', () => {
    for (const ratio of [0.5, 0.62, 0.3333, 0.7071, 0.05, 0.95]) {
      for (let amount = 1; amount < 500; amount += 7) {
        for (const payerIsA of [true, false]) {
          const r = splitAmount(amount, 'group', ratio, payerIsA)
          expect(r.shareA + r.shareB).toBe(amount)
          expect(r.shareA).toBeGreaterThanOrEqual(0)
          expect(r.shareB).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })
})

describe('ratioToPct', () => {
  it('suma 100', () => {
    expect(ratioToPct(0.62)).toEqual({ a: 62, b: 38 })
    expect(ratioToPct(0.625)).toEqual({ a: 63, b: 37 })
  })
})

describe('groupBalance', () => {
  const expenses = [
    { amount: 480000, paid_by: A, share_a: 297600, share_b: 182400 },
    { amount: 220000, paid_by: A, share_a: 136400, share_b: 83600 },
    { amount: 135000, paid_by: B, share_a: 83700, share_b: 51300 },
    { amount: 60000,  paid_by: B, share_a: 37200, share_b: 22800 },
  ]

  it('B le debe a A lo que A puso de más', () => {
    const b = groupBalance(expenses, [], A, B)
    expect(b.paidA).toBe(700000)
    expect(b.paidB).toBe(195000)
    expect(b.shareA).toBe(554900)
    expect(b.shareB).toBe(340100)
    expect(b.netA).toBe(145100)
    expect(b.total).toBe(895000)
    expect(balanceFor(b, true)).toBe(145100)
    expect(balanceFor(b, false)).toBe(-145100)
  })

  it('saldar deja el saldo en cero', () => {
    const b = groupBalance(expenses, [{ from_user: B, to_user: A, amount: 145100 }], A, B)
    expect(b.netA).toBe(0)
  })

  it('un saldo parcial deja el resto', () => {
    const b = groupBalance(expenses, [{ from_user: B, to_user: A, amount: 100000 }], A, B)
    expect(b.netA).toBe(45100)
  })

  it('una transferencia de más invierte la deuda', () => {
    const b = groupBalance(expenses, [{ from_user: B, to_user: A, amount: 150000 }], A, B)
    expect(b.netA).toBe(-4900)
  })

  it('sin gastos todo es cero', () => {
    const b = groupBalance([], [], A, B)
    expect(b.netA).toBe(0)
    expect(b.total).toBe(0)
  })
})

describe('tripStage', () => {
  const base = { member_b: B, start_date: '2027-02-15', end_date: '2027-02-22', closed_at: null }

  it('invitación pendiente', () => {
    expect(tripStage({ ...base, member_b: null }, '2026-10-18', 0)).toBe('invited')
  })
  it('antes de salir: planificar', () => {
    expect(tripStage(base, '2026-10-18', 0)).toBe('planning')
    expect(tripStage(base, '2027-02-14', 0)).toBe('planning')
  })
  it('durante el viaje', () => {
    expect(tripStage(base, '2027-02-15', 0)).toBe('traveling')
    expect(tripStage(base, '2027-02-22', 100)).toBe('traveling')
  })
  it('después de volver: por saldar si hay saldo', () => {
    expect(tripStage(base, '2027-02-23', 100)).toBe('settling')
    expect(tripStage(base, '2027-02-23', -100)).toBe('settling')
  })
  it('después de volver y cuadrado: cerrado', () => {
    expect(tripStage(base, '2027-02-23', 0)).toBe('closed')
  })
  it('cerrado a mano gana sobre todo', () => {
    expect(tripStage({ ...base, closed_at: '2027-03-01T00:00:00Z' }, '2027-02-20', 500)).toBe('closed')
  })
  it('sin fechas: planificando', () => {
    expect(tripStage({ member_b: B, start_date: null, end_date: null, closed_at: null }, '2026-10-18', 0)).toBe('planning')
  })
  it('solo fecha de salida: ese día es el viaje, después se cuadra', () => {
    const g = { member_b: B, start_date: '2027-02-15', end_date: null, closed_at: null }
    expect(tripStage(g, '2027-02-15', 10)).toBe('traveling')
    expect(tripStage(g, '2027-02-16', 10)).toBe('settling')
  })
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
  it('proporción de A', () => {
    expect(incomeRatio(1240000, 760000)).toBe(0.62)
  })
  it('si falta información no adivina', () => {
    expect(incomeRatio(null, 760000)).toBeNull()
    expect(incomeRatio(1000000, null)).toBeNull()
    expect(incomeRatio(0, 0)).toBeNull()
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
