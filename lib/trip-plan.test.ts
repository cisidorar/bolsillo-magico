import { describe, it, expect } from 'vitest'
import { budgetTotal, myBudgetShare, monthlyCapacity, tripAffordability } from './trip-plan'

describe('budget', () => {
  it('suma y reparte', () => {
    expect(budgetTotal({ alojamiento: 600000, transporte: 300000 })).toBe(900000)
    expect(myBudgetShare(900000, 3, null)).toBe(300000)
    expect(myBudgetShare(1000, 3, null)).toBe(334)
    expect(myBudgetShare(900000, 2, 0.62)).toBe(558000)
    expect(myBudgetShare(0, 2, null)).toBe(0)
  })
})

describe('monthlyCapacity', () => {
  it('promedia solo meses con ingreso', () => {
    expect(monthlyCapacity([{ income: 1000000, spent: 800000 }, { income: 1000000, spent: 600000 }, { income: 0, spent: 50000 }])).toBe(300000)
    expect(monthlyCapacity([{ income: 0, spent: 1 }])).toBeNull()
  })
})

describe('tripAffordability', () => {
  const base = { today: '2026-10-18', startDate: '2027-01-15' as string | null }
  it('alcanza holgado', () => {
    const r = tripAffordability({ ...base, myShare: 400000, covered: 0, capacity: 300000 })
    expect(r.months).toBe(3)
    expect(r.perMonth).toBe(133334)
    expect(r.verdict).toBe('yes')
  })
  it('justo', () => {
    expect(tripAffordability({ ...base, myShare: 800000, covered: 0, capacity: 300000 }).verdict).toBe('tight')
  })
  it('no alcanza', () => {
    expect(tripAffordability({ ...base, myShare: 2000000, covered: 0, capacity: 300000 }).verdict).toBe('no')
    expect(tripAffordability({ ...base, myShare: 100, covered: 0, capacity: -5000 }).verdict).toBe('no')
  })
  it('ya cubierto', () => {
    expect(tripAffordability({ ...base, myShare: 300000, covered: 300000, capacity: null }).verdict).toBe('ready')
  })
  it('sin ingresos no adivina', () => {
    expect(tripAffordability({ ...base, myShare: 300000, covered: 0, capacity: null }).verdict).toBe('unknown')
  })
  it('sin fecha dice en cuántos meses lo juntas', () => {
    const r = tripAffordability({ today: '2026-10-18', startDate: null, myShare: 900000, covered: 0, capacity: 200000 })
    expect(r.perMonth).toBeNull()
    expect(r.monthsToSave).toBe(5)
    expect(r.verdict).toBe('tight')
  })
})
