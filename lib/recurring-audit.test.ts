import { describe, it, expect } from 'vitest'
import { annualizedCost, totalPaid, detectPriceChange } from './recurring-audit'

describe('annualizedCost', () => {
  it('mensual: multiplica por 12', () => {
    expect(annualizedCost({ amount: 7900, billing_month: null })).toBe(94800)
  })
  it('anual: el monto ya es el anual, no se multiplica', () => {
    expect(annualizedCost({ amount: 600000, billing_month: 3 })).toBe(600000)
  })
})

describe('totalPaid', () => {
  it('suma todos los gastos, sin importar el orden', () => {
    expect(totalPaid([{ amount: 100, date: '2026-01-01' }, { amount: 200, date: '2026-02-01' }])).toBe(300)
  })
  it('0 sin gastos', () => {
    expect(totalPaid([])).toBe(0)
  })
})

describe('detectPriceChange', () => {
  it('sin cambio: menos de 2 gastos', () => {
    expect(detectPriceChange([{ amount: 100, date: '2026-01-01' }]).changed).toBe(false)
  })

  it('sin cambio: todos los montos iguales', () => {
    const r = detectPriceChange([
      { amount: 6900, date: '2026-01-01' },
      { amount: 6900, date: '2026-02-01' },
      { amount: 6900, date: '2026-03-01' },
    ])
    expect(r.changed).toBe(false)
  })

  it('detecta un alza (Spotify $6.900 → $7.900), ignorando el orden de entrada', () => {
    const r = detectPriceChange([
      { amount: 7900, date: '2026-04-01' },
      { amount: 6900, date: '2026-02-01' },
      { amount: 6900, date: '2026-01-01' },
      { amount: 6900, date: '2026-03-01' },
    ])
    expect(r.changed).toBe(true)
    expect(r.delta).toBe(1000)
    expect(r.previousAmount).toBe(6900)
    expect(r.currentAmount).toBe(7900)
    expect(r.changedAt).toBe('2026-04-01')
  })

  it('detecta una baja', () => {
    const r = detectPriceChange([
      { amount: 10000, date: '2026-01-01' },
      { amount: 8000, date: '2026-02-01' },
    ])
    expect(r.changed).toBe(true)
    expect(r.delta).toBe(-2000)
  })

  it('una racha de montos iguales no dispara falso positivo — usa el último distinto', () => {
    const r = detectPriceChange([
      { amount: 5000, date: '2026-01-01' },
      { amount: 6000, date: '2026-02-01' },
      { amount: 6000, date: '2026-03-01' },
      { amount: 6000, date: '2026-04-01' },
    ])
    expect(r.changed).toBe(true)
    expect(r.previousAmount).toBe(5000)
    expect(r.currentAmount).toBe(6000)
    expect(r.changedAt).toBe('2026-04-01')
  })
})
