import { describe, it, expect } from 'vitest'
import { analyzeDrop, impactLines, type DropPositionInput, type DropContext } from './market-drop'

// Cierres reales del 30/10/2026 (cierre anterior 29/10) — el día que motivó el aviso.
const OCT30: DropPositionInput[] = [
  { ticker: 'INTC', shares: 11.9885, avgCostUsd: 60,  close: 65.76,   prevClose: 92.07 },
  { ticker: 'SOXL', shares: 5.5391,  avgCostUsd: 90,  close: 77.05,   prevClose: 102.39 },
  { ticker: 'TSM',  shares: 2.3603,  avgCostUsd: 380, close: 406.13,  prevClose: 431.81 },
  { ticker: 'SNDK', shares: 0.3123,  avgCostUsd: 1000, close: 1150.89, prevClose: 1330.05 },
  { ticker: 'QQQ',  shares: 1.3471,  avgCostUsd: 650, close: 690.49,  prevClose: 715.34 },
  { ticker: 'KO',   shares: 12.7284, avgCostUsd: 90,  close: 94.08,   prevClose: 92.82 },
]
const CTX: DropContext = {
  walletUsd: 92, spyPct: -1.8, usdClp: 950, netWorthClp: 20_000_000, safeClp: 2_000_000, monthlySpendClp: 900_000,
}

describe('analyzeDrop', () => {
  it('detecta la caída del 30/10 con números de flujo (no de snapshot)', () => {
    const r = analyzeDrop(OCT30, CTX)!
    expect(r).not.toBeNull()
    expect(r.triggers).toContain('portfolio')
    expect(r.triggers).toContain('position') // INTC −28,6% con peso > 8%
    expect(r.changeUsd).toBeCloseTo(-589.78, 1)  // −315,42 −140,36 −60,61 −55,95 −33,48 +16,04
    expect(r.losers[0].ticker).toBe('INTC')
    expect(r.losers.find(l => l.ticker === 'SOXL')!.leverage).toBe(3)
    expect(r.gainers.map(g => g.ticker)).toEqual(['KO'])
    expect(r.changeClp).toBe(Math.round(r.changeUsd * 950))
  })

  it('no dispara en un día normal', () => {
    const calm = OCT30.map(p => ({ ...p, close: p.prevClose! * 0.995 }))
    expect(analyzeDrop(calm, CTX)).toBeNull()
  })

  it('dispara por mercado aunque la cartera baje menos del umbral, si la pérdida es real', () => {
    const mild = OCT30.map(p => ({ ...p, close: p.prevClose! * 0.975 }))
    const r = analyzeDrop(mild, { ...CTX, spyPct: -3 })!
    expect(r.triggers).toEqual(['market'])
  })

  it('no dispara por mercado si a tu cartera le fue bien', () => {
    const up = OCT30.map(p => ({ ...p, close: p.prevClose! * 1.01 }))
    expect(analyzeDrop(up, { ...CTX, spyPct: -3 })).toBeNull()
  })

  it('ignora posiciones sin cierre de hoy en la variación', () => {
    const r = analyzeDrop([...OCT30, { ticker: 'XYZ', shares: 10, avgCostUsd: 5, close: null, prevClose: 6 }], CTX)!
    expect(r.losers.some(l => l.ticker === 'XYZ')).toBe(false)
  })

  it('cartera chica: piso absoluto de pérdida', () => {
    const tiny = [{ ticker: 'AAA', shares: 1, avgCostUsd: 100, close: 90, prevClose: 100 }]
    expect(analyzeDrop(tiny, { ...CTX, walletUsd: 0 })).toBeNull()
  })
})

describe('impactLines', () => {
  it('explica concentración, apalancado, colchón y perspectiva sin recomendar', () => {
    const lines = impactLines(analyzeDrop(OCT30, CTX)!)
    const text = lines.join(' ')
    expect(text).toMatch(/INTC/)
    expect(text).toMatch(/ETF 3×/)
    expect(text).toMatch(/Amortiguó: KO/)
    expect(text).toMatch(/patrimonio neto/)
    expect(text).toMatch(/ahorros y depósitos en pesos/)
    expect(text).not.toMatch(/compra|vende ahora|recomend/i)
  })
})
