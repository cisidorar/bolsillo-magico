import { describe, it, expect } from 'vitest'
import {
  daysBetween, addDaysStr, totalInterest, earnedToDate, progressPct, daysToMaturity, annualizeRate,
  withoutSuperseded, supersededSince,
  type DepositLike,
} from './term-deposits'

describe('daysBetween', () => {
  it('cuenta días calendario entre dos fechas', () => {
    expect(daysBetween('2026-08-04', '2026-09-08')).toBe(35)
  })
})

describe('addDaysStr', () => {
  it('suma días a una fecha', () => {
    expect(addDaysStr('2026-08-04', 35)).toBe('2026-09-08')
  })
})

describe('totalInterest / earnedToDate / progressPct / daysToMaturity — depósito real verificado con Cas (Banco de Chile)', () => {
  const d: DepositLike = { amount: 335_000, interest_rate: 0.39667, start_date: '2026-08-04', maturity_date: '2026-09-08' }

  it('interés total del período coincide con "Ganancia" del banco ($1.329)', () => {
    expect(totalInterest(d)).toBe(1329)
  })

  it('monto + interés coincide con "Monto a recibir" del banco ($336.329)', () => {
    expect(d.amount + totalInterest(d)).toBe(336_329)
  })

  it('a los 17 de 35 días, el devengo lineal es proporcional (17/35 del total)', () => {
    expect(earnedToDate(d, '2026-08-21')).toBe(Math.round(totalInterest(d) * 17 / 35))
  })

  it('el día de inicio no ha devengado nada', () => {
    expect(earnedToDate(d, '2026-08-04')).toBe(0)
  })

  it('progressPct llega a 100% justo en el vencimiento', () => {
    expect(progressPct(d, '2026-09-08')).toBe(100)
  })

  it('daysToMaturity es 0 el día del vencimiento', () => {
    expect(daysToMaturity(d, '2026-09-08')).toBe(0)
  })
})

describe('annualizeRate', () => {
  it('10% anual a 365 días se anualiza a sí mismo', () => {
    expect(annualizeRate(10, 365)).toBeCloseTo(10, 5)
  })

  it('un período corto con capitalización compuesta anualiza más alto que el nominal × (365/días)', () => {
    // 0,39667% a 35 días → nominal-anualizado simple sería ~4,14%; compuesto es un poco más.
    const naiveAnnualized = 0.39667 * (365 / 35)
    expect(annualizeRate(0.39667, 35)).toBeGreaterThan(naiveAnnualized)
  })

  it('plazo 0 no revienta (división por cero)', () => {
    expect(annualizeRate(1, 0)).toBe(0)
  })
})

describe('cadena de renovaciones — caso real Banco de Chile (sep 2026)', () => {
  const rows = [
    { id: 'a', renewed_from_id: null, start_date: '2026-08-04', amount: 335000 },
    { id: 'b', renewed_from_id: null, start_date: '2026-09-02', amount: 500000 },
    { id: 'c', renewed_from_id: 'a',  start_date: '2026-09-08', amount: 336329 },
  ]

  it('withoutSuperseded saca el ciclo ya renovado, deja el vigente y los independientes', () => {
    expect(withoutSuperseded(rows).map(r => r.id)).toEqual(['b', 'c'])
  })

  it('sin renovaciones no cambia nada', () => {
    expect(withoutSuperseded(rows.slice(0, 2)).map(r => r.id)).toEqual(['a', 'b'])
  })

  it('supersededSince marca desde cuándo dejó de contar el ciclo viejo', () => {
    expect(supersededSince(rows).get('a')).toBe('2026-09-08')
    expect(supersededSince(rows).has('b')).toBe(false)
  })
})
