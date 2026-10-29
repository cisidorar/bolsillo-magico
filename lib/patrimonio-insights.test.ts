import { describe, it, expect } from 'vitest'
import { liquidityLadder, gainSinceStart, activeLeases } from './patrimonio-insights'

describe('liquidityLadder', () => {
  it('reparte ahorro, depósitos por vencimiento e inversión', () => {
    const r = liquidityLadder({
      savings: 1_000_000, invested: 7_000_000, today: '2026-10-29',
      deposits: [
        { value: 500_000, maturity_date: '2026-10-01' },   // vencido → hoy
        { value: 380_000, maturity_date: '2026-11-06' },   // 8 días
        { value: 200_000, maturity_date: '2026-12-15' },   // 47 días
        { value: 100_000, maturity_date: '2027-03-01' },   // >90
      ],
    })
    expect(r.map(b => [b.key, b.total])).toEqual([
      ['now', 1_500_000], ['invested', 7_000_000], ['d30', 380_000], ['d90', 200_000], ['later', 100_000],
    ])
  })
  it('omite tramos vacíos', () => {
    expect(liquidityLadder({ savings: 0, invested: 0, deposits: [], today: '2026-10-29' })).toEqual([])
  })
})

describe('gainSinceStart', () => {
  it('compara valor actual contra lo pagado en CLP', () => {
    const r = gainSinceStart([{ total_paid_clp: 6_000_000, purchase_date: '2026-03-02' }, { total_paid_clp: 1_000_000, purchase_date: '2026-01-10' }], 7_350_000)
    expect(r).toEqual({ contributed: 7_000_000, value: 7_350_000, gain: 350_000, pct: 5, since: '2026-01-10' })
  })
  it('sin aportes no hay resultado', () => {
    expect(gainSinceStart([], 1)).toBeNull()
    expect(gainSinceStart([{ total_paid_clp: null, purchase_date: '2026-01-01' }], 1)).toBeNull()
  })
})

describe('activeLeases', () => {
  it('solo contratos vigentes hoy', () => {
    const r = activeLeases([
      { rent_amount: 500_000, start_date: '2026-01-01', end_date: null, property: { alias: 'Depto' } },
      { rent_amount: 400_000, start_date: '2025-01-01', end_date: '2025-12-31', property: { alias: 'Antiguo' } },
      { rent_amount: 300_000, start_date: '2027-01-01', end_date: null, property: null },
    ], '2026-10-29')
    expect(r).toEqual([{ property: 'Depto', rent: 500_000, end_date: null }])
  })
})
