import { describe, it, expect } from 'vitest'
import { adjustmentWindow, computeRentAdjustment, shouldNotifyAdjustment, monthStart } from './rent-adjustment'

const obs = (pairs: [string, number][]) => pairs.map(([date, pctChange]) => ({ date, pctChange }))

describe('adjustmentWindow', () => {
  it('diciembre 2026 usa may–oct 2026 (último IPC publicado antes del día 5)', () => {
    expect(adjustmentWindow('2026-12-01')).toEqual([
      '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01',
    ])
  })
  it('marzo 2026 usa ago-25 a ene-26 (aviso real de la corredora)', () => {
    expect(adjustmentWindow('2026-03-01')).toEqual([
      '2025-08-01', '2025-09-01', '2025-10-01', '2025-11-01', '2025-12-01', '2026-01-01',
    ])
  })
  it('acepta cualquier día del mes', () => {
    expect(adjustmentWindow('2026-12-15')[5]).toBe('2026-10-01')
  })
})

describe('computeRentAdjustment', () => {
  // Aviso de Etchepare y Asociados, marzo 2026: renta $450.402 → $454.920.
  const etchepare = obs([
    ['2025-08-01', 0.04], ['2025-09-01', 0.44], ['2025-10-01', 0.04],
    ['2025-11-01', 0.26], ['2025-12-01', -0.19], ['2026-01-01', 0.41],
  ])
  it('compone el IPC (acumulado): reproduce el aviso de la corredora', () => {
    const r = computeRentAdjustment(450_402, etchepare, '2026-03-01')
    expect(r.complete).toBe(true)
    expect(r.cumulativePct).toBeCloseTo(1.0027, 3)
    // La corredora usa 12 decimales ($454.920); con 2 decimales difiere ≤ $5.
    expect(Math.abs(r.newRent - 454_920)).toBeLessThanOrEqual(5)
    expect(r.delta).toBe(r.newRent - 450_402)
    expect(r.floored).toBe(false)
  })
  it('IPC acumulado negativo: la renta se mantiene', () => {
    const neg = obs([
      ['2026-05-01', -0.3], ['2026-06-01', 0.1], ['2026-07-01', -0.2],
      ['2026-08-01', 0.0], ['2026-09-01', -0.1], ['2026-10-01', 0.1],
    ])
    const r = computeRentAdjustment(335_000, neg, '2026-12-01')
    expect(r.floored).toBe(true)
    expect(r.newRent).toBe(335_000)
    expect(r.delta).toBe(0)
    expect(r.cumulativePct).toBeLessThan(0)
  })
  it('ventana incompleta (falta el IPC de octubre): no calcula', () => {
    const partial = obs([
      ['2026-05-01', 0.2], ['2026-06-01', 0.2], ['2026-07-01', 0.2],
      ['2026-08-01', 0.2], ['2026-09-01', 0.2],
    ])
    const r = computeRentAdjustment(335_000, partial, '2026-12-01')
    expect(r.complete).toBe(false)
    expect(r.cumulativePct).toBeNull()
    expect(r.newRent).toBe(335_000)
    expect(r.windowMonths.at(-1)).toEqual({ date: '2026-10-01', pct: null })
  })
  it('redondea la renta al peso', () => {
    const flat = obs(adjustmentMonths('2026-12-01', 0.5))
    const r = computeRentAdjustment(335_000, flat, '2026-12-01')
    expect(Number.isInteger(r.newRent)).toBe(true)
    expect(r.newRent).toBe(Math.round(335_000 * Math.pow(1.005, 6)))
  })
})

function adjustmentMonths(adj: string, pct: number): [string, number][] {
  return adjustmentWindow(adj).map(d => [d, pct])
}

describe('shouldNotifyAdjustment', () => {
  const complete = computeRentAdjustment(335_000, obs(adjustmentMonths('2026-12-01', 0.3)), '2026-12-01')
  const incomplete = computeRentAdjustment(335_000, [], '2026-12-01')
  it('avisa apenas la ventana está completa', () => {
    expect(shouldNotifyAdjustment({ adjustment: complete, alreadyNotified: false, today: '2026-11-19' })).toBe(true)
  })
  it('no repite si ya se avisó', () => {
    expect(shouldNotifyAdjustment({ adjustment: complete, alreadyNotified: true, today: '2026-11-19' })).toBe(false)
  })
  it('no avisa con la ventana incompleta', () => {
    expect(shouldNotifyAdjustment({ adjustment: incomplete, alreadyNotified: false, today: '2026-11-19' })).toBe(false)
  })
  it('no avisa un reajuste viejo (más de 2 meses atrás)', () => {
    expect(shouldNotifyAdjustment({ adjustment: complete, alreadyNotified: false, today: '2027-03-01' })).toBe(false)
  })
})

describe('monthStart', () => {
  it('normaliza al día 1', () => expect(monthStart('2026-12-17')).toBe('2026-12-01'))
})
