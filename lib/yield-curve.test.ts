import { describe, it, expect } from 'vitest'
import { computeYieldCurve } from './yield-curve'

describe('computeYieldCurve', () => {
  it('curva normal (10Y > 2Y) → no invertida', () => {
    const r = computeYieldCurve(4.2, 3.8)
    expect(r.spread).toBeCloseTo(0.4, 5)
    expect(r.inverted).toBe(false)
  })

  it('curva invertida (10Y < 2Y) → invertida', () => {
    const r = computeYieldCurve(3.8, 4.5)
    expect(r.spread).toBeCloseTo(-0.7, 5)
    expect(r.inverted).toBe(true)
  })

  it('spread exactamente cero → no se considera invertida', () => {
    const r = computeYieldCurve(4.0, 4.0)
    expect(r.spread).toBe(0)
    expect(r.inverted).toBe(false)
  })
})
