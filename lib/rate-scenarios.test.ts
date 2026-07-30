import { describe, it, expect } from 'vitest'
import { computeRateScenarios } from './rate-scenarios'

describe('computeRateScenarios', () => {
  it('calcula el impacto exacto de un escenario +25pb sobre una sola posición', () => {
    // beta -1.8%/10pb, +25pb → -1.8 * 2.5 = -4.5% sobre 10.000 = -450
    const r = computeRateScenarios([{ ticker: 'NVDA', valueUsd: 10_000, betaPer10bp: -1.8 }])
    const sube = r.scenarios.find(s => s.label === 'sube')!
    expect(sube.totalImpactUsd).toBeCloseTo(-450, 5)
    expect(sube.totalImpactPct).toBeCloseTo(-4.5, 5)
  })

  it('el escenario "mantiene" (0pb) siempre da impacto cero', () => {
    const r = computeRateScenarios([{ ticker: 'NVDA', valueUsd: 10_000, betaPer10bp: -1.8 }])
    const mantiene = r.scenarios.find(s => s.label === 'mantiene')!
    expect(mantiene.totalImpactUsd).toBe(0)
  })

  it('el escenario "baja" (-25pb) invierte el signo del impacto de "sube"', () => {
    const r = computeRateScenarios([{ ticker: 'NVDA', valueUsd: 10_000, betaPer10bp: -1.8 }])
    const sube = r.scenarios.find(s => s.label === 'sube')!
    const baja = r.scenarios.find(s => s.label === 'baja')!
    expect(baja.totalImpactUsd).toBeCloseTo(-sube.totalImpactUsd, 5)
  })

  it('suma el impacto de varias posiciones con beta de distinto signo', () => {
    const r = computeRateScenarios([
      { ticker: 'NVDA', valueUsd: 10_000, betaPer10bp: -1.8 },   // sube +25pb → -450
      { ticker: 'KO',   valueUsd: 5_000,  betaPer10bp: 0.4  },   // sube +25pb → 5000*0.4*2.5/100 = +50
    ])
    const sube = r.scenarios.find(s => s.label === 'sube')!
    expect(sube.totalImpactUsd).toBeCloseTo(-400, 5)   // -450 + 50
  })

  it('tickers sin beta confiable (null) quedan afuera del cálculo y se listan aparte', () => {
    const r = computeRateScenarios([
      { ticker: 'NVDA', valueUsd: 10_000, betaPer10bp: -1.8 },
      { ticker: 'XYZ',  valueUsd: 3_000,  betaPer10bp: null },
    ])
    expect(r.excludedTickers).toEqual(['XYZ'])
    expect(r.consideredValueUsd).toBe(10_000)   // XYZ no suma al total considerado
  })

  it('ETF apalancado 3× multiplica el impacto por el factor', () => {
    const normal      = computeRateScenarios([{ ticker: 'A',    valueUsd: 10_000, betaPer10bp: -1.0 }])
    const apalancado  = computeRateScenarios([{ ticker: 'SOXL', valueUsd: 10_000, betaPer10bp: -1.0, leverageFactor: 3 }])
    const impactoNormal     = normal.scenarios.find(s => s.label === 'sube')!.totalImpactUsd
    const impactoApalancado = apalancado.scenarios.find(s => s.label === 'sube')!.totalImpactUsd
    expect(impactoApalancado).toBeCloseTo(impactoNormal * 3, 5)
  })

  it('sin ninguna posición, 3 escenarios en cero y % null (sin cartera considerada)', () => {
    const r = computeRateScenarios([])
    expect(r.scenarios).toHaveLength(3)
    for (const s of r.scenarios) {
      expect(s.totalImpactUsd).toBe(0)
      expect(s.totalImpactPct).toBeNull()
    }
    expect(r.consideredValueUsd).toBe(0)
  })

  it('todas las posiciones sin beta confiable: cartera considerada en 0, todas excluidas', () => {
    const r = computeRateScenarios([
      { ticker: 'A', valueUsd: 5_000, betaPer10bp: null },
      { ticker: 'B', valueUsd: 3_000, betaPer10bp: null },
    ])
    expect(r.excludedTickers).toEqual(['A', 'B'])
    expect(r.consideredValueUsd).toBe(0)
    expect(r.scenarios.every(s => s.totalImpactUsd === 0)).toBe(true)
  })
})
