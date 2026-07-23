import { describe, it, expect } from 'vitest'
import { computePortfolioHistory } from './portfolio-history'

describe('computePortfolioHistory', () => {
  it('devuelve vacío sin posiciones', () => {
    expect(computePortfolioHistory([], [])).toEqual([])
  })

  it('devuelve vacío si las posiciones no tienen shares', () => {
    const rows = [{ ticker: 'AAA', date: '2026-01-01', close: 10 }]
    expect(computePortfolioHistory(rows, [{ ticker: 'AAA', shares: 0 }])).toEqual([])
  })

  it('suma el valor de un solo ticker en cada fecha', () => {
    const rows = [
      { ticker: 'AAA', date: '2026-01-01', close: 10 },
      { ticker: 'AAA', date: '2026-01-02', close: 12 },
      { ticker: 'AAA', date: '2026-01-03', close: 11 },
    ]
    const points = computePortfolioHistory(rows, [{ ticker: 'AAA', shares: 2 }])
    expect(points).toEqual([
      { date: '2026-01-01', value: 20 },
      { date: '2026-01-02', value: 24 },
      { date: '2026-01-03', value: 22 },
    ])
  })

  it('agrega shares de múltiples filas del mismo ticker', () => {
    const rows = [{ ticker: 'AAA', date: '2026-01-01', close: 10 }]
    const points = computePortfolioHistory(rows, [
      { ticker: 'AAA', shares: 2 },
      { ticker: 'AAA', shares: 3 },
    ])
    expect(points).toEqual([{ date: '2026-01-01', value: 50 }])
  })

  it('carry-forward: usa el último cierre conocido cuando un ticker no tiene dato ese día', () => {
    const rows = [
      { ticker: 'AAA', date: '2026-01-01', close: 10 },
      { ticker: 'BBB', date: '2026-01-01', close: 5 },
      { ticker: 'BBB', date: '2026-01-02', close: 6 },
    ]
    const points = computePortfolioHistory(rows, [
      { ticker: 'AAA', shares: 1 },
      { ticker: 'BBB', shares: 1 },
    ])
    // 2026-01-02: AAA no tiene cierre ese día -> usa el de 01-01 (10)
    expect(points).toEqual([
      { date: '2026-01-01', value: 15 },
      { date: '2026-01-02', value: 16 },
    ])
  })

  it('no suma un ticker antes de su primer cierre disponible', () => {
    const rows = [
      { ticker: 'AAA', date: '2026-01-01', close: 10 },
      { ticker: 'BBB', date: '2026-01-02', close: 5 },
    ]
    const points = computePortfolioHistory(rows, [
      { ticker: 'AAA', shares: 1 },
      { ticker: 'BBB', shares: 1 },
    ])
    expect(points).toEqual([
      { date: '2026-01-01', value: 10 },
      { date: '2026-01-02', value: 15 },
    ])
  })

  it('recorta a windowDays los días más recientes', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      ticker: 'AAA',
      date: `2026-01-${String(i + 1).padStart(2, '0')}`,
      close: i + 1,
    }))
    const points = computePortfolioHistory(rows, [{ ticker: 'AAA', shares: 1 }], 3, 60)
    expect(points).toEqual([
      { date: '2026-01-08', value: 8 },
      { date: '2026-01-09', value: 9 },
      { date: '2026-01-10', value: 10 },
    ])
  })

  it('downsamplea a maxPoints conservando el último punto', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      ticker: 'AAA',
      date: `2026-01-${String(i + 1).padStart(2, '0')}`,
      close: i + 1,
    }))
    const points = computePortfolioHistory(rows, [{ ticker: 'AAA', shares: 1 }], 130, 5)
    // hasta maxPoints espaciados uniformemente, +1 si el último no cayó justo
    // en la muestra (se garantiza que el punto más reciente siempre aparece)
    expect(points.length).toBeLessThanOrEqual(6)
    expect(points[points.length - 1]).toEqual({ date: '2026-01-20', value: 20 })
  })
})
