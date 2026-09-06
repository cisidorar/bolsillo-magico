import { describe, it, expect } from 'vitest'
import { defaultRiskTier, effectiveRiskTier } from './risk-tiers'

describe('defaultRiskTier', () => {
  it('índice amplio diversificado → bajo riesgo', () => {
    expect(defaultRiskTier('VOO')).toBe('bajo')
  })

  it('AVUV (factor fund diversificado) → bajo riesgo, aunque sea un ETF (pedido de Cas)', () => {
    expect(defaultRiskTier('AVUV')).toBe('bajo')
  })

  it('blue-chip defensiva → bajo riesgo', () => {
    expect(defaultRiskTier('KO')).toBe('bajo')
  })

  it('acción individual de crecimiento sin lista propia → riesgo (default), no bajo ni alto', () => {
    expect(defaultRiskTier('NVDA')).toBe('medio')
    expect(defaultRiskTier('AAPL')).toBe('medio')
    expect(defaultRiskTier('TSM')).toBe('medio')
    expect(defaultRiskTier('GOOGL')).toBe('medio')
    expect(defaultRiskTier('INTC')).toBe('medio')
  })

  it('ETF apalancado (vía detectLeverage) → riesgo alto, aunque sea un ETF', () => {
    expect(defaultRiskTier('SOXL')).toBe('alto')
    expect(defaultRiskTier('TQQQ')).toBe('alto')
  })

  it('trust de cripto → riesgo alto', () => {
    expect(defaultRiskTier('IBIT')).toBe('alto')
    expect(defaultRiskTier('GBTC')).toBe('alto')
  })

  it('no distingue mayúsculas/minúsculas del ticker', () => {
    expect(defaultRiskTier('voo')).toBe('bajo')
    expect(defaultRiskTier('soxl')).toBe('alto')
  })

  it('apalancado detectado solo por nombre (fondo nuevo no listado) → riesgo alto', () => {
    expect(defaultRiskTier('XYZ', 'Some New Fund Bull 3X Shares Daily')).toBe('alto')
  })
})

describe('effectiveRiskTier', () => {
  it('sin override → usa el default curado', () => {
    expect(effectiveRiskTier('VOO', null)).toBe('bajo')
    expect(effectiveRiskTier('NVDA', undefined)).toBe('medio')
  })

  it('con override → el override manda, sin importar el default', () => {
    expect(effectiveRiskTier('IBIT', 'medio')).toBe('medio')
    expect(effectiveRiskTier('VOO', 'alto')).toBe('alto')
  })
})
