import { describe, it, expect } from 'vitest'
import { computeRentaFijaSummary } from './renta-fija-summary'

describe('computeRentaFijaSummary', () => {
  it('sin ahorro ni depósitos, todo en cero', () => {
    const r = computeRentaFijaSummary([], [], '2026-08-03')
    expect(r).toEqual({
      totalCurrentValue: 0, availableToday: 0, committed: 0,
      nearestMaturityDate: null, earnedCombined: 0, weightedRatePct: 0,
    })
  })

  it('solo ahorro: todo es líquido, nada comprometido', () => {
    const savings = [{ balance: 1_791_647, annual_rate: 6, start_date: '2026-07-01' }]
    const r = computeRentaFijaSummary(savings, [], '2026-08-03')
    expect(r.earnedCombined).toBe(9464)          // verificado con Cas
    expect(r.availableToday).toBe(1_791_647 + 9464)
    expect(r.committed).toBe(0)
    expect(r.nearestMaturityDate).toBeNull()
    expect(r.weightedRatePct).toBe(6)             // única fuente, pondera a su propia tasa
    expect(r.totalCurrentValue).toBe(r.availableToday)
  })

  it('solo un depósito activo: todo comprometido, nada líquido', () => {
    const deposits = [{ amount: 335_000, interest_rate: 0.39667, start_date: '2026-08-04', maturity_date: '2026-09-08' }]
    const r = computeRentaFijaSummary([], deposits, '2026-08-04')
    expect(r.committed).toBe(335_000)
    expect(r.availableToday).toBe(0)
    expect(r.nearestMaturityDate).toBe('2026-09-08')
    expect(r.earnedCombined).toBe(0)   // día de inicio, nada devengado todavía
  })

  it('un depósito ya vencido pasa a estar disponible, con su interés completo, y deja de pesar en la tasa promedio', () => {
    const deposits = [{ amount: 335_000, interest_rate: 0.39667, start_date: '2026-08-04', maturity_date: '2026-09-08' }]
    const r = computeRentaFijaSummary([], deposits, '2026-09-09')   // un día después del vencimiento
    expect(r.committed).toBe(0)
    expect(r.availableToday).toBe(335_000 + 1329)   // capital + interés total del período
    expect(r.nearestMaturityDate).toBeNull()          // no hay depósitos activos
    expect(r.weightedRatePct).toBe(0)                 // plata parada, no pesa en la tasa
  })

  it('mezcla ahorro + depósito activo: la tasa ponderada combina TAE anual con la tasa del período anualizada', () => {
    const savings  = [{ balance: 1_000_000, annual_rate: 6, start_date: '2026-08-03' }]   // recién hoy, 0 devengado
    const deposits = [{ amount: 1_000_000, interest_rate: 1, start_date: '2026-08-03', maturity_date: '2026-09-02' }]  // 30 días, 1% del período
    const r = computeRentaFijaSummary(savings, deposits, '2026-08-03')
    // Capital 50/50 — la tasa ponderada debe quedar ENTRE 6% (ahorro) y la anualización de 1%/30d (~12,7%)
    expect(r.weightedRatePct).toBeGreaterThan(6)
    expect(r.weightedRatePct).toBeLessThan(13)
    expect(r.committed).toBe(1_000_000)
    expect(r.availableToday).toBe(1_000_000)   // ahorro, sin interés devengado aún el mismo día
  })
})
