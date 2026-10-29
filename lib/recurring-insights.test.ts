import { describe, it, expect } from 'vitest'
import { upcomingCharges, priceImpact, categoryWeights } from './recurring-insights'

describe('upcomingCharges', () => {
  const items = [
    { id: 'a', name: 'Spotify', amount: 8250, dateStr: '2026-10-29' },
    { id: 'b', name: 'Corretaje', amount: 33500, dateStr: '2026-11-05' },
    { id: 'c', name: 'Netflix', amount: 18770, dateStr: '2026-11-11' },
    { id: 'd', name: 'Pasado', amount: 1000, dateStr: '2026-10-20' },
  ]
  it('toma hoy y los próximos 7 días, ordenados', () => {
    const r = upcomingCharges(items, '2026-10-29')
    expect(r.map(c => [c.name, c.days])).toEqual([['Spotify', 0], ['Corretaje', 7]])
  })
})

describe('priceImpact', () => {
  it('anualiza según periodicidad y ordena por impacto', () => {
    const r = priceImpact([
      { id: '1', name: 'Claude', delta: 1595, current: 23661, interval_months: 1, annual: false },
      { id: '2', name: 'ADT', delta: -37064, current: 30622, interval_months: 1, annual: false },
      { id: '3', name: 'Kida', delta: 8618, current: 75000, interval_months: 2, annual: false },
      { id: '4', name: 'Google', delta: 1000, current: 17900, interval_months: 1, annual: true },
    ])
    expect(r.moves.map(m => [m.name, m.annualImpact])).toEqual([['ADT', -444768], ['Kida', 51708], ['Claude', 19140], ['Google', 1000]])
    expect(r.netAnnual).toBe(-372920)
  })
})

describe('categoryWeights', () => {
  it('prorratea y calcula % del total', () => {
    const cat = (id: string) => ({ id, name: id, color: '#000' })
    const r = categoryWeights([
      { amount: 30000, interval_months: 1, annual: false, category: cat('subs') },
      { amount: 30000, interval_months: 1, annual: false, category: cat('subs') },
      { amount: 24000, interval_months: 2, annual: false, category: cat('kida') },
      { amount: 12000, interval_months: 1, annual: true, category: null },
    ])
    expect(r.map(c => [c.key, c.monthly, c.pct])).toEqual([['subs', 60000, 82], ['kida', 12000, 16], ['sin', 1000, 1]])
  })
})
