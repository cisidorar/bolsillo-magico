import { describe, it, expect } from 'vitest'
import { averageSalaries, incomeShares } from './trip-guest'

describe('averageSalaries', () => {
  it('promedia los 6 sueldos del ejemplo del plan', () => {
    expect(averageSalaries([950000, 1100000, 870000, 1300000, 1000000, 980000]))
      .toEqual({ average: 1033333, months: 6 })
  })
  it('ignora vacíos, ceros y texto con puntos', () => {
    expect(averageSalaries(['1.000.000', '', null, 0, '500000'])).toEqual({ average: 750000, months: 2 })
  })
  it('sin sueldos devuelve null', () => {
    expect(averageSalaries(['', null, undefined])).toBeNull()
  })
})

describe('incomeShares', () => {
  it('reparte 63,5 / 36,5 con el ejemplo', () => {
    expect(incomeShares([1800000, 1033333])).toEqual([63.5, 36.5])
  })
  it('sin ingresos devuelve ceros', () => {
    expect(incomeShares([0, 0])).toEqual([0, 0])
  })
})
