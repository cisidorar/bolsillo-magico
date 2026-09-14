import { describe, it, expect } from 'vitest'
import {
  propertySummary, monthBills, pendingIncome, overdueOwnerBills,
  monthSummary, recentMonthKeys, monthOf, type SummaryCharge,
} from './property-summary'

function charge(over: Partial<SummaryCharge> & { due_date: string; amount: number }): SummaryCharge {
  return {
    direction: 'out', responsible: 'owner', penalty: 0, inflation_adj: 0,
    paid_date: null, paid_amount: null, confirmed: false, auto_debit: false,
    ...over,
  }
}

describe('monthOf', () => {
  it('extrae YYYY-MM de una fecha', () => {
    expect(monthOf('2026-09-14')).toBe('2026-09')
  })
})

describe('recentMonthKeys', () => {
  it('devuelve los últimos N meses terminando en hoy', () => {
    expect(recentMonthKeys('2026-09-14', 4)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09'])
  })

  it('cruza el año hacia atrás sin romper el orden', () => {
    expect(recentMonthKeys('2026-02-10', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })

  it('con count=1 devuelve solo el mes de hoy', () => {
    expect(recentMonthKeys('2026-09-14', 1)).toEqual(['2026-09'])
  })
})

describe('monthSummary', () => {
  const today = '2026-09-14'

  it('un mes sin ningún cobro generado queda cerrado (nada que preocupe)', () => {
    expect(monthSummary([], '2026-06', today).status).toBe('closed')
  })

  it('un mes con todo pagado queda cerrado', () => {
    const charges = [
      charge({ due_date: '2026-08-05', amount: 100, paid_date: '2026-08-05', paid_amount: 100 }),
      charge({ due_date: '2026-08-08', amount: 200, paid_date: '2026-08-08', paid_amount: 200 }),
    ]
    const r = monthSummary(charges, '2026-08', today)
    expect(r.status).toBe('closed')
    expect(r.pendingCount).toBe(0)
    expect(r.overdueCount).toBe(0)
  })

  it('el mes actual con pendientes sin vencer queda "due", no "overdue"', () => {
    const charges = [charge({ due_date: '2026-09-21', amount: 13595 })] // aún no vence
    const r = monthSummary(charges, '2026-09', today)
    expect(r.status).toBe('due')
    expect(r.pendingCount).toBe(1)
    expect(r.overdueCount).toBe(0)
  })

  it('un mes pasado con algo impago queda "overdue" aunque sea de hace tiempo', () => {
    const charges = [charge({ due_date: '2026-04-30', amount: 5000 })]
    const r = monthSummary(charges, '2026-04', today)
    expect(r.status).toBe('overdue')
    expect(r.overdueCount).toBe(1)
  })

  it('overdue manda sobre pending cuando el mes tiene de los dos', () => {
    const charges = [
      charge({ due_date: '2026-09-05', amount: 1000 }), // vencido (antes de hoy)
      charge({ due_date: '2026-09-25', amount: 2000 }), // pendiente, no vence aún
    ]
    const r = monthSummary(charges, '2026-09', today)
    expect(r.status).toBe('overdue')
    expect(r.overdueCount).toBe(1)
    expect(r.pendingCount).toBe(1)
  })

  it('separa los montos: lo vencido no se mezcla con lo que aún no vence', () => {
    const charges = [
      charge({ due_date: '2026-09-05', amount: 1000, penalty: 200 }), // vencido, con recargo
      charge({ due_date: '2026-09-25', amount: 2000 }),               // pendiente
      charge({ due_date: '2026-09-08', amount: 9999, paid_date: '2026-09-08', paid_amount: 9999 }),
    ]
    const r = monthSummary(charges, '2026-09', today)
    // El vencido suma su recargo (chargeOutstanding), el pagado no suma en ninguno.
    expect(r.overdueTotal).toBe(1200)
    expect(r.pendingTotal).toBe(2000)
  })

  it('un mes cerrado no arrastra montos', () => {
    const charges = [charge({ due_date: '2026-08-05', amount: 100, paid_date: '2026-08-05', paid_amount: 100 })]
    const r = monthSummary(charges, '2026-08', today)
    expect(r.pendingTotal).toBe(0)
    expect(r.overdueTotal).toBe(0)
  })

  it('un mes futuro con un recordatorio estimado pendiente queda "upcoming", no "due"', () => {
    const charges = [charge({ due_date: '2026-10-21', amount: 13595 })]
    const r = monthSummary(charges, '2026-10', today)
    expect(r.status).toBe('upcoming')
  })

  it('solo mira los cobros de ESE mes, no de otros', () => {
    const charges = [
      charge({ due_date: '2026-04-30', amount: 5000 }), // vencido, pero de abril
      charge({ due_date: '2026-09-25', amount: 2000 }),
    ]
    const r = monthSummary(charges, '2026-09', today)
    expect(r.status).toBe('due')
    expect(r.overdueCount).toBe(0)
  })
})

describe('propertySummary / monthBills / pendingIncome / overdueOwnerBills (regresión)', () => {
  // Cobertura mínima de humo — estas funciones ya se validan en producción
  // hace meses (P1), esto solo confirma que monthOf pasar a export no las rompió.
  it('siguen funcionando tras exportar monthOf', () => {
    const today = '2026-09-14'
    const charges = [
      charge({ due_date: '2026-09-05', amount: 335000, direction: 'in', responsible: 'tenant', paid_date: '2026-09-05', paid_amount: 335000 }),
      charge({ due_date: '2026-09-21', amount: 13595 }),
    ]
    const s = propertySummary(charges, today, 335000, 200000)
    expect(s.ownerBillsCount).toBe(1)
    expect(monthBills(charges, today).length).toBe(1)
    expect(pendingIncome(charges, today).length).toBe(0)
    expect(overdueOwnerBills(charges, today).length).toBe(0)
  })
})
