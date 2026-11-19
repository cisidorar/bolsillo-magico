import { describe, it, expect } from 'vitest'
import { normalizeFeatures, DEFAULT_FEATURES, FEATURE_KEYS } from './features'

describe('normalizeFeatures', () => {
  it('sin dato guardado, todo apagado', () => {
    expect(normalizeFeatures(null)).toEqual(DEFAULT_FEATURES)
    expect(normalizeFeatures(undefined)).toEqual(DEFAULT_FEATURES)
    expect(normalizeFeatures('x')).toEqual(DEFAULT_FEATURES)
  })
  it('solo true exacto enciende un módulo', () => {
    const f = normalizeFeatures({ inversiones: true, propiedad: 'true', liquidaciones: 1 })
    expect(f).toEqual({ inversiones: true, propiedad: false, liquidaciones: false })
  })
  it('ignora claves desconocidas y cubre todas las conocidas', () => {
    const f = normalizeFeatures({ inversiones: true, otra: true })
    expect(Object.keys(f).sort()).toEqual([...FEATURE_KEYS].sort())
  })
})
