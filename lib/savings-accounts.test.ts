import { describe, it, expect } from 'vitest'
import { daysElapsed, dailyRate, earnedSoFar, dailyInterest, projectedInterest } from './savings-accounts'

describe('daysElapsed', () => {
  it('cuenta días completos transcurridos desde start_date', () => {
    const now = new Date('2026-08-03T15:00:00')
    expect(daysElapsed('2026-07-01', now)).toBe(33)
  })

  it('el día de inicio no genera interés (0 días, no negativo)', () => {
    const now = new Date('2026-08-03T10:00:00')
    expect(daysElapsed('2026-08-03', now)).toBe(0)
  })

  it('fecha futura (reloj desalineado) no da negativo', () => {
    const now = new Date('2026-08-03T10:00:00')
    expect(daysElapsed('2026-08-10', now)).toBe(0)
  })
})

describe('dailyRate', () => {
  it('6% TEA da una tasa diaria efectiva ≈0.01596%', () => {
    expect(dailyRate(6)).toBeCloseTo(0.00015965, 6)
  })
})

describe('earnedSoFar', () => {
  it('coincide con el cálculo real verificado con Cas: $1.791.647 al 6% TEA, 33 días → $9.464', () => {
    const now = new Date('2026-08-03T15:00:00')
    expect(earnedSoFar(1_791_647, 6, '2026-07-01', now)).toBe(9464)
  })

  it('0 días transcurridos → 0 interés ganado', () => {
    const now = new Date('2026-08-03T10:00:00')
    expect(earnedSoFar(1_000_000, 6, '2026-08-03', now)).toBe(0)
  })
})

describe('dailyInterest', () => {
  it('coincide con el cálculo real verificado con Cas: $1.791.647 al 6% TEA → $286/día', () => {
    expect(dailyInterest(1_791_647, 6)).toBe(286)
  })
})

describe('projectedInterest', () => {
  it('proyección a 0 días es 0', () => {
    expect(projectedInterest(1_000_000, 6, 0)).toBe(0)
  })

  it('proyección a 365 días ≈ el nominal de la tasa anual', () => {
    expect(projectedInterest(1_000_000, 6, 365)).toBe(60000)
  })
})
