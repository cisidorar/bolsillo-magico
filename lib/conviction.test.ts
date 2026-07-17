import { describe, it, expect } from 'vitest'
import { computeConviction, isActionableBuyNow } from './conviction'
import type { TechnicalAnalysis, TechnicalRating } from './technical'
import type { LabelStat } from './signal-backtest'

function rating(overrides: Partial<TechnicalRating> = {}): TechnicalRating {
  return {
    label: 'compra', action: 'Compra', score: 3, trendScore: 1, triggerScore: 2,
    pros: 2, cons: 0, caution: false, ...overrides,
  }
}

/** Analysis mínima pero completa — cada test sobreescribe solo lo relevante. */
function baseAnalysis(overrides: Partial<TechnicalAnalysis> = {}): TechnicalAnalysis {
  return {
    price: 100, asOf: '2025-06-01',
    verdict: 'x', entryPlan: 'x', buy: [], sell: [], sellPlan: 'x',
    alarm: 95, rating: rating(),
    trend: { aboveSma200: true, weeksInState: 10, sma200Rising: true, sma200: 90, distPct: 11 },
    rsi14: 55, atr14: 2, atrPct: 2, divergence: null, macdCross: null, volumeSignal: null,
    supportLevels: [], resistanceLevels: [],
    high52: 110, low52: 80, distHighPct: -9, distLowPct: 25,
    returns: { m1: 2, m6: 10, y1: 20 },
    chart: [], signals: [], watch: [],
    sma20: 98, sma50: 95, sma200: 90,
    supports: [], resistances: [],
    ...overrides,
  }
}

describe('computeConviction', () => {
  it('rating compra_fuerte + buen riesgo/recompensa da score alto y tier compra_fuerte/compra', () => {
    const a = baseAnalysis({
      rating: rating({ label: 'compra_fuerte', action: 'Compra fuerte', score: 6, trendScore: 2, triggerScore: 4 }),
      alarm: 97,   // riesgo 3%
      resistanceLevels: [{ price: 115, touches: 2, firstDate: '2025-01-01', lastDate: '2025-05-01', weeksActive: 20, weeksSinceLast: 1, distPct: 15 }],   // recompensa 15%
    })
    const r = computeConviction(a)
    expect(r.score).toBeGreaterThanOrEqual(55)
    expect(['compra_fuerte', 'compra']).toContain(r.tier)
    expect(r.reasons.length).toBeGreaterThan(0)
  })

  it('rating de venta da score bajo y tier evitar/venta', () => {
    const a = baseAnalysis({
      rating: rating({ label: 'venta_fuerte', action: 'Venta fuerte', score: -6, trendScore: -2, triggerScore: -4, pros: 0, cons: 3 }),
      alarm: null,
    })
    const r = computeConviction(a)
    expect(r.score).toBeLessThan(40)
    expect(['evitar', 'venta']).toContain(r.tier)
  })

  it('riesgo/recompensa en contra baja el score aunque el rating diga compra', () => {
    const good = baseAnalysis({
      alarm: 90,   // riesgo 10%
      resistanceLevels: [{ price: 105, touches: 2, firstDate: '2025-01-01', lastDate: '2025-05-01', weeksActive: 20, weeksSinceLast: 1, distPct: 30 }],   // recompensa 30% → rr=3
    })
    const bad = baseAnalysis({
      alarm: 90,   // riesgo 10%
      resistanceLevels: [{ price: 102, touches: 2, firstDate: '2025-01-01', lastDate: '2025-05-01', weeksActive: 20, weeksSinceLast: 1, distPct: 2 }],    // recompensa 2% → rr=0.2
    })
    expect(computeConviction(good).score).toBeGreaterThan(computeConviction(bad).score)
  })

  it('track record con pocas repeticiones pesa poco (se acerca a neutral, no a 100)', () => {
    const a = baseAnalysis()
    const fewReps: LabelStat[]  = [{ label: 'compra', count: 1, avgReturn20: 20, avgReturn60: 30, hitRate20: 100 }]
    const manyReps: LabelStat[] = [{ label: 'compra', count: 12, avgReturn20: 20, avgReturn60: 30, hitRate20: 100 }]
    const rFew  = computeConviction(a, fewReps)
    const rMany = computeConviction(a, manyReps)
    // Con la misma señal de 100% de acierto, más repeticiones debe pesar MÁS
    // (score más alto), no menos — la confianza crece con la evidencia.
    expect(rMany.score).toBeGreaterThanOrEqual(rFew.score)
  })

  it('track record de señales de venta no infla la convicción de compra', () => {
    const a = baseAnalysis({ rating: rating({ label: 'compra' }) })
    const sellStats: LabelStat[] = [{ label: 'venta', count: 10, avgReturn20: -20, avgReturn60: -30, hitRate20: 90 }]
    const r1 = computeConviction(a)
    const r2 = computeConviction(a, sellStats)
    expect(r2.score).toBe(r1.score)   // stat de 'venta' no aplica cuando el label actual es 'compra'
  })

  it('fuerza relativa negativa vs SPY resta puntos', () => {
    const a = baseAnalysis({ returns: { m1: 2, m6: -5, y1: 10 } })
    const worseThanMarket = computeConviction(a, null, 20)   // SPY +20% vs ticker -5%
    const betterThanMarket = computeConviction(a, null, -20) // SPY -20% vs ticker -5%
    expect(betterThanMarket.score).toBeGreaterThan(worseThanMarket.score)
  })

  it('sin ningún dato extra (solo técnico) no revienta y da un score válido', () => {
    const a = baseAnalysis({ alarm: null, resistanceLevels: [] })
    const r = computeConviction(a)
    expect(r.score).toBeGreaterThanOrEqual(0)
    expect(r.score).toBeLessThanOrEqual(100)
  })
})

describe('isActionableBuyNow', () => {
  // Regresión (jul 2026, a pedido de Cas): el panel "¿Qué comprar hoy?" decía
  // "la mejor compra hoy es X" con tier de convicción alto, mientras el
  // detalle de X (que mira a.buy) decía "no compres hoy" por falta de
  // gatillo técnico — mismo dato, dos lecturas contradictorias.
  it('tier de compra sin ningún tramo "now" en a.buy → NO es accionable hoy', () => {
    const conviction = { tier: 'compra_fuerte' as const }
    expect(isActionableBuyNow({ buy: [{ now: false }, { now: false }] }, conviction)).toBe(false)
  })

  it('tier de compra CON un tramo "now" en a.buy → sí es accionable hoy', () => {
    const conviction = { tier: 'compra' as const }
    expect(isActionableBuyNow({ buy: [{ now: false }, { now: true }] }, conviction)).toBe(true)
  })

  it('tramo "now" presente pero tier no es de compra → no es accionable', () => {
    const conviction = { tier: 'neutral' as const }
    expect(isActionableBuyNow({ buy: [{ now: true }] }, conviction)).toBe(false)
  })
})
