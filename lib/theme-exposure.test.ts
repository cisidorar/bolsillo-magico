import { describe, it, expect } from 'vitest'
import { themeOf, computeThemeExposure, checkThemeCap, themesNearCap, THEME_CAP_PCT } from './theme-exposure'

// Cartera real de Cas al cierre del 20-nov-2026 (valores de mercado, US$) —
// el caso que motivó el módulo: seis tickers, una sola apuesta.
const CARTERA = [
  { ticker: 'KO',   valueUsd: 1234 }, { ticker: 'INTC', valueUsd: 615 }, { ticker: 'TSM',  valueUsd: 752 },
  { ticker: 'QQQ',  valueUsd: 820 },  { ticker: 'SOXL', valueUsd: 171 }, { ticker: 'NVDA', valueUsd: 371 },
  { ticker: 'VOO',  valueUsd: 493 },  { ticker: 'SNDK', valueUsd: 198 }, { ticker: 'IBIT', valueUsd: 278 },
  { ticker: 'AVUV', valueUsd: 273 },  { ticker: 'MU',   valueUsd: 181 }, { ticker: 'AAPL', valueUsd: 226 },
  { ticker: 'PFE',  valueUsd: 94 },
]
const TOTAL = CARTERA.reduce((s, p) => s + p.valueUsd, 0) + 501   // + efectivo

describe('themeOf', () => {
  it('reconoce semis/IA y cripto, ignora lo demás', () => {
    expect(themeOf('NVDA')).toBe('semis_ia')
    expect(themeOf('soxl')).toBe('semis_ia')
    expect(themeOf('IBIT')).toBe('cripto')
    expect(themeOf('KO')).toBeNull()
    expect(themeOf('MSFT')).toBeNull()   // negocio distinto, no se mezcla
  })
})

describe('computeThemeExposure', () => {
  it('la cartera real de nov-2026 supera el tope de semis/IA contando SOXL ×3', () => {
    const [semis] = computeThemeExposure(CARTERA, TOTAL)
    expect(semis.theme).toBe('semis_ia')
    expect(semis.tickers.sort()).toEqual(['INTC', 'MU', 'NVDA', 'SNDK', 'SOXL', 'TSM'])
    // sin apalancar: 615+752+171+371+198+181 = 2288 · efectivo con SOXL×3: +342
    expect(semis.valueUsd).toBe(2288)
    expect(semis.effectiveUsd).toBe(2630)
    expect(semis.pct).toBeGreaterThan(THEME_CAP_PCT)
  })

  it('cartera vacía o sin total no revienta', () => {
    expect(computeThemeExposure([], 1000)).toEqual([])
    expect(computeThemeExposure(CARTERA, 0)).toEqual([])
  })

  it('un ETF apalancado cuenta por su factor', () => {
    const [e] = computeThemeExposure([{ ticker: 'SOXL', valueUsd: 100 }], 1000)
    expect(e.effectiveUsd).toBe(300)
    expect(e.pct).toBe(30)
  })
})

describe('checkThemeCap', () => {
  const exposures = computeThemeExposure(CARTERA, TOTAL)

  it('bloquea comprar más semis cuando el tema ya pasó el tope', () => {
    const c = checkThemeCap('AMD', exposures, TOTAL)!
    expect(c.blocked).toBe(true)
    expect(c.maxAddUsd).toBe(0)
    expect(c.label).toBe('semiconductores / IA')
  })

  it('no limita acciones sin tema (KO, AAPL, VOO)', () => {
    expect(checkThemeCap('KO', exposures, TOTAL)).toBeNull()
    expect(checkThemeCap('VOO', exposures, TOTAL)).toBeNull()
  })

  it('con espacio bajo el tope, calcula cuánto cabe (y SOXL cabe 1/3)', () => {
    const exp = computeThemeExposure([{ ticker: 'NVDA', valueUsd: 200 }], 1000)   // 20% → caben 15 puntos = 150
    expect(checkThemeCap('AMD', exp, 1000)!.maxAddUsd).toBe(150)
    expect(checkThemeCap('SOXL', exp, 1000)!.maxAddUsd).toBe(50)
    expect(checkThemeCap('AMD', exp, 1000)!.blocked).toBe(false)
  })

  it('tema sin posiciones: cabe hasta el tope completo', () => {
    expect(checkThemeCap('IBIT', [], 1000)!.maxAddUsd).toBe(350)
  })
})

describe('themesNearCap', () => {
  it('avisa desde el 80% del tope', () => {
    const near = computeThemeExposure([{ ticker: 'NVDA', valueUsd: 290 }], 1000)   // 29% ≥ 28%
    expect(themesNearCap(near)).toHaveLength(1)
    const far = computeThemeExposure([{ ticker: 'NVDA', valueUsd: 100 }], 1000)
    expect(themesNearCap(far)).toHaveLength(0)
  })
})
