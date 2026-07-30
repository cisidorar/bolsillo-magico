import { describe, it, expect } from 'vitest'
import { computeRateSensitivity, MIN_OBSERVATIONS } from './rate-sensitivity'
import type { Observation } from './yoy-change'

// ── Series sintéticas de beta CONOCIDA — si el test no puede recuperarla, el
// número no sale a producción (regla explícita del roadmap M2). ────────────
function buildSyntheticSeries(n: number, betaPer10bp: number, opts: { noise?: boolean; flatRate?: boolean } = {}) {
  const bPerBp = betaPer10bp / 10
  const dates: string[] = []
  const dgs2: Observation[] = []
  const ticker: Observation[] = []

  let level = 4.00
  let price = 100
  const start = new Date('2025-01-01T12:00:00')

  for (let k = 0; k <= n; k++) {
    const d = new Date(start)
    d.setDate(d.getDate() + k)
    const dateStr = d.toISOString().slice(0, 10)
    dates.push(dateStr)

    if (k === 0) {
      dgs2.push({ date: dateStr, value: level })
      ticker.push({ date: dateStr, value: price })
      continue
    }

    // Secuencia determinista en bp, con variación real (no constante) —
    // salvo en el caso 'flatRate', donde la tasa no se mueve nunca.
    const bpChange = opts.flatRate ? 0 : ((k * 37) % 17) - 8   // -8..+8 pb
    level += bpChange / 100
    dgs2.push({ date: dateStr, value: level })

    const pctReturn = opts.noise
      ? (((k * 53) % 13) - 6) * 0.3        // retorno sin relación con la tasa
      : bPerBp * bpChange                   // relación lineal EXACTA con la tasa
    price = price * (1 + pctReturn / 100)
    ticker.push({ date: dateStr, value: price })
  }

  return { dgs2, ticker }
}

describe('computeRateSensitivity', () => {
  it('recupera con exactitud una beta inyectada a mano, sin ruido (r² ≈ 1)', () => {
    const { dgs2, ticker } = buildSyntheticSeries(150, -1.8)
    const r = computeRateSensitivity(ticker, dgs2)
    expect(r).not.toBeNull()
    expect(r!.n).toBe(150)
    expect(r!.betaPer10bp).toBeCloseTo(-1.8, 1)
    expect(r!.r2).toBeGreaterThan(0.99)
  })

  it('recupera una beta positiva igual de bien', () => {
    const { dgs2, ticker } = buildSyntheticSeries(150, 2.4)
    const r = computeRateSensitivity(ticker, dgs2)
    expect(r).not.toBeNull()
    expect(r!.betaPer10bp).toBeCloseTo(2.4, 1)
  })

  it('con menos observaciones que el mínimo, no hay resultado (aunque la relación sea perfecta)', () => {
    const { dgs2, ticker } = buildSyntheticSeries(MIN_OBSERVATIONS - 10, -1.8)
    const r = computeRateSensitivity(ticker, dgs2)
    expect(r).toBeNull()
  })

  it('con retornos sin relación real a la tasa (ruido), r² bajo → null', () => {
    const { dgs2, ticker } = buildSyntheticSeries(150, -1.8, { noise: true })
    const r = computeRateSensitivity(ticker, dgs2)
    expect(r).toBeNull()
  })

  it('si la tasa no se movió nunca en la ventana (varianza cero), null en vez de dividir por cero', () => {
    const { dgs2, ticker } = buildSyntheticSeries(150, -1.8, { flatRate: true })
    const r = computeRateSensitivity(ticker, dgs2)
    expect(r).toBeNull()
  })

  it('sin fechas en común entre ambas series, null', () => {
    const { dgs2 } = buildSyntheticSeries(150, -1.8)
    const tickerOtherDates: Observation[] = dgs2.map(o => ({ date: `1999-${o.date.slice(5)}`, value: 100 }))
    const r = computeRateSensitivity(tickerOtherDates, dgs2)
    expect(r).toBeNull()
  })
})
