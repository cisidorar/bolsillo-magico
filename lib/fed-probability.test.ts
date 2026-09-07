import { describe, it, expect } from 'vitest'
import { computeFedMeetingProbability, kalshiEventTicker } from './fed-probability'

describe('kalshiEventTicker', () => {
  it('arma el ticker de evento a partir de la fecha de reunión', () => {
    expect(kalshiEventTicker('2026-09-16')).toBe('KXFED-26SEP')
    expect(kalshiEventTicker('2026-12-09')).toBe('KXFED-26DEC')
    expect(kalshiEventTicker('2027-01-27')).toBe('KXFED-27JAN')
  })

  it('null con fecha mal formada', () => {
    expect(kalshiEventTicker('')).toBeNull()
    expect(kalshiEventTicker('2026')).toBeNull()
  })
})

describe('computeFedMeetingProbability', () => {
  // Caso real (sep 2026): rango vigente 3.50-3.75%, "coin flip" de subida.
  const septMarkets = [
    { floor_strike: 2.75, last_price_dollars: '0.9900' },
    { floor_strike: 3.00, last_price_dollars: '0.9900' },
    { floor_strike: 3.25, last_price_dollars: '0.9900' },
    { floor_strike: 3.50, last_price_dollars: '0.9900' },
    { floor_strike: 3.75, last_price_dollars: '0.5100' },
    { floor_strike: 4.00, last_price_dollars: '0.0200' },
    { floor_strike: 4.25, last_price_dollars: '0.0100' },
  ]

  it('ancla el rango vigente con DFF y deriva sube/mantiene/baja del precio de los contratos', () => {
    const result = computeFedMeetingProbability(septMarkets, 3.63)
    expect(result).not.toBeNull()
    expect(result!.rangeLowPct).toBe(3.5)
    expect(result!.rangeHighPct).toBe(3.75)
    expect(result!.pHikePct).toBe(51)   // precio del contrato "sobre 3.75%"
    expect(result!.pCutPct).toBe(1)     // 100 - precio del contrato "sobre 3.50%" (99)
    expect(result!.pHoldPct).toBe(48)
    // Los tres siempre suman 100 exacto, incluso con redondeo independiente.
    expect(result!.pHikePct + result!.pHoldPct + result!.pCutPct).toBe(100)
  })

  it('mercado muy confiado en una subida (evita el error del heurístico ingenuo)', () => {
    // Si "sobre 3.75%" tuviera 95%, un heurístico que busca "el primer precio
    // bajo cierto umbral" se saltaría de largo el rango vigente real. Anclar
    // con DFF (no con las probabilidades) evita justamente ese error.
    const markets = [
      { floor_strike: 3.50, last_price_dollars: '0.9900' },
      { floor_strike: 3.75, last_price_dollars: '0.9500' },
      { floor_strike: 4.00, last_price_dollars: '0.1000' },
    ]
    const result = computeFedMeetingProbability(markets, 3.63)
    expect(result!.rangeLowPct).toBe(3.5)
    expect(result!.rangeHighPct).toBe(3.75)
    expect(result!.pHikePct).toBe(95)
    expect(result!.pCutPct).toBe(1)
    expect(result!.pHoldPct).toBe(4)
  })

  it('null si Kalshi no tiene listado el rango vigente todavía', () => {
    const result = computeFedMeetingProbability(
      [{ floor_strike: 5.00, last_price_dollars: '0.5000' }],
      3.63,
    )
    expect(result).toBeNull()
  })

  it('null con lista de mercados vacía', () => {
    expect(computeFedMeetingProbability([], 3.63)).toBeNull()
  })

  it('redondeo: los tres porcentajes siempre suman 100 aunque el redondeo independiente no cuadre', () => {
    // hike=33.4 (→33), low=66.6 → cut=33.4 (→33) → hold quedaría en 34, no 33+33+33=99
    const markets = [
      { floor_strike: 3.50, last_price_dollars: '0.6660' },
      { floor_strike: 3.75, last_price_dollars: '0.3340' },
    ]
    const result = computeFedMeetingProbability(markets, 3.6)
    expect(result!.pHikePct + result!.pHoldPct + result!.pCutPct).toBe(100)
  })
})
