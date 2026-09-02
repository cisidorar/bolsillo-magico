import { describe, it, expect } from 'vitest'
import { computeConviction, isActionableBuyNow, computeMarketRegime, riskRewardRatio } from './conviction'
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
    verdict: 'x', entryPlan: 'x', buy: [], sell: [], sellPlan: 'x', sellPlanSplit: null,
    alarm: 95, priceZone: 'justo', buyZone: null, rating: rating(),
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

  // M4 (roadmap macro/tasas, jul 2026): razón contextual de tasas — nunca
  // debe mover el score, solo agregar una razón cuando corresponde.
  describe('contexto de tasas (M4)', () => {
    it('mercado espera alzas + ticker sensible en contra: agrega la razón sin tocar el score', () => {
      const a = baseAnalysis()
      const withoutContext = computeConviction(a)
      const withContext = computeConviction(a, null, null, {
        direction: 'alzas',
        sensitivity: { betaPer10bp: -1.8, r2: 0.25, n: 150 },
      })
      expect(withContext.score).toBe(withoutContext.score)
      expect(withContext.reasons.some(r => r.includes('Sensible a tasas'))).toBe(true)
      expect(withoutContext.reasons.some(r => r.includes('Sensible a tasas'))).toBe(false)
    })

    it('sensibilidad bajo el umbral: no agrega la razón', () => {
      const a = baseAnalysis()
      const r = computeConviction(a, null, null, {
        direction: 'alzas',
        sensitivity: { betaPer10bp: -0.3, r2: 0.15, n: 150 },
      })
      expect(r.reasons.some(rr => rr.includes('Sensible a tasas'))).toBe(false)
    })

    it('mercado espera alzas pero el ticker se mueve A FAVOR (beta positivo): no agrega la razón', () => {
      const a = baseAnalysis()
      const r = computeConviction(a, null, null, {
        direction: 'alzas',
        sensitivity: { betaPer10bp: 1.8, r2: 0.25, n: 150 },
      })
      expect(r.reasons.some(rr => rr.includes('Sensible a tasas'))).toBe(false)
    })

    it('mercado estable o a la baja: no agrega la razón aunque el ticker sea sensible', () => {
      const a = baseAnalysis()
      const r1 = computeConviction(a, null, null, { direction: 'estable', sensitivity: { betaPer10bp: -1.8, r2: 0.25, n: 150 } })
      const r2 = computeConviction(a, null, null, { direction: 'bajas',   sensitivity: { betaPer10bp: -1.8, r2: 0.25, n: 150 } })
      expect(r1.reasons.some(rr => rr.includes('Sensible a tasas'))).toBe(false)
      expect(r2.reasons.some(rr => rr.includes('Sensible a tasas'))).toBe(false)
    })

    it('rating de venta: no agrega la razón (el contexto de tasas solo aplica a decisiones de COMPRA)', () => {
      const a = baseAnalysis({ rating: rating({ label: 'venta_fuerte', action: 'Venta fuerte', score: -6, pros: 0, cons: 3 }) })
      const r = computeConviction(a, null, null, {
        direction: 'alzas',
        sensitivity: { betaPer10bp: -1.8, r2: 0.25, n: 150 },
      })
      expect(r.reasons.some(rr => rr.includes('Sensible a tasas'))).toBe(false)
    })

    it('sin sensitivity (null, evidencia insuficiente): no agrega la razón ni revienta', () => {
      const a = baseAnalysis()
      const r = computeConviction(a, null, null, { direction: 'alzas', sensitivity: null })
      expect(r.reasons.some(rr => rr.includes('Sensible a tasas'))).toBe(false)
    })

    it('sin rateContext (undefined, compatibilidad hacia atrás): se comporta igual que antes', () => {
      const a = baseAnalysis()
      const r = computeConviction(a)
      expect(r.reasons.some(rr => rr.includes('Sensible a tasas'))).toBe(false)
    })
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

  // D4 (roadmap de calidad de decisión): en régimen bajista el listón sube —
  // 'compra' ya no basta, exige 'compra_fuerte'.
  it('régimen bajista + tier "compra" (no fuerte) → NO es accionable', () => {
    const conviction = { tier: 'compra' as const }
    expect(isActionableBuyNow({ buy: [{ now: true }] }, conviction, 'bajista')).toBe(false)
  })

  it('régimen bajista + tier "compra_fuerte" → sí es accionable', () => {
    const conviction = { tier: 'compra_fuerte' as const }
    expect(isActionableBuyNow({ buy: [{ now: true }] }, conviction, 'bajista')).toBe(true)
  })

  it('régimen alcista o sin régimen → se comporta igual que antes (compra basta)', () => {
    const conviction = { tier: 'compra' as const }
    expect(isActionableBuyNow({ buy: [{ now: true }] }, conviction, 'alcista')).toBe(true)
    expect(isActionableBuyNow({ buy: [{ now: true }] }, conviction, undefined)).toBe(true)
  })
})

describe('riskRewardRatio', () => {
  // Ago 2026: desempate de ranking cuando dos tickers empatan en score (bug
  // real NVDA/INTC 70/100 ambos con gatillo activo). Cubre el mismo cálculo
  // que usa computeConviction internamente, pero como función standalone.
  it('más recompensa por unidad de riesgo → ratio más alto', () => {
    const a = baseAnalysis({
      price: 100, alarm: 97,   // riesgo 3%
      resistanceLevels: [{ price: 115, touches: 2, firstDate: '2025-01-01', lastDate: '2025-05-01', weeksActive: 20, weeksSinceLast: 1, distPct: 15 }],   // recompensa 15%
    })
    expect(riskRewardRatio(a)).toBeCloseTo(5, 5)   // 15/3
  })

  it('sin alarm (sin stop definido) → null, no revienta', () => {
    const a = baseAnalysis({ alarm: null })
    expect(riskRewardRatio(a)).toBeNull()
  })

  it('sin resistencia por encima (sin recompensa medible) → null', () => {
    const a = baseAnalysis({ alarm: 95, resistanceLevels: [] })
    expect(riskRewardRatio(a)).toBeNull()
  })

  it('resistencia con distPct negativo (ya la pasó) → null, no un ratio negativo engañoso', () => {
    const a = baseAnalysis({
      alarm: 95,
      resistanceLevels: [{ price: 90, touches: 1, firstDate: '2025-01-01', lastDate: '2025-05-01', weeksActive: 5, weeksSinceLast: 1, distPct: -5 }],
    })
    expect(riskRewardRatio(a)).toBeNull()
  })

  it('alarm igual o por encima del precio (riesgo cero o negativo) → null', () => {
    const a = baseAnalysis({
      price: 100, alarm: 100,
      resistanceLevels: [{ price: 115, touches: 2, firstDate: '2025-01-01', lastDate: '2025-05-01', weeksActive: 20, weeksSinceLast: 1, distPct: 15 }],
    })
    expect(riskRewardRatio(a)).toBeNull()
  })
})

describe('computeMarketRegime', () => {
  it('SPY sobre su SMA200 y subiendo → alcista', () => {
    expect(computeMarketRegime({ aboveSma200: true, sma200Rising: true })).toBe('alcista')
  })

  it('SPY sobre su SMA200 con la media plana/sin dato → sigue siendo alcista (no penaliza lo que no se sabe)', () => {
    expect(computeMarketRegime({ aboveSma200: true, sma200Rising: null })).toBe('alcista')
  })

  it('SPY bajo su SMA200 y esa media bajando → bajista', () => {
    expect(computeMarketRegime({ aboveSma200: false, sma200Rising: false })).toBe('bajista')
  })

  it('SPY bajo su SMA200 pero la media todavía sin girar a la baja → mixto, no bajista de lleno', () => {
    expect(computeMarketRegime({ aboveSma200: false, sma200Rising: true })).toBe('mixto')
  })

  it('sin trend (historia insuficiente) → null', () => {
    expect(computeMarketRegime(null)).toBeNull()
    expect(computeMarketRegime({ aboveSma200: null, sma200Rising: null })).toBeNull()
  })
})
