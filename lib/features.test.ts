import { describe, it, expect } from 'vitest'
import { normalizeFeatures, DEFAULT_FEATURES, FEATURE_KEYS, FEATURE_PRESETS, hasFeature } from './features'

describe('normalizeFeatures', () => {
  it('sin dato guardado, todo apagado', () => {
    expect(normalizeFeatures(null)).toEqual(DEFAULT_FEATURES)
    expect(normalizeFeatures(undefined)).toEqual(DEFAULT_FEATURES)
    expect(normalizeFeatures('x')).toEqual(DEFAULT_FEATURES)
  })
  it('solo true exacto enciende un módulo', () => {
    const f = normalizeFeatures({ inversiones: true, propiedad: 'true', liquidaciones: 1 })
    expect(f).toEqual({ ...DEFAULT_FEATURES, inversiones: true })
  })
  it('ignora claves desconocidas y cubre todas las conocidas', () => {
    const f = normalizeFeatures({ inversiones: true, otra: true })
    expect(Object.keys(f).sort()).toEqual([...FEATURE_KEYS].sort())
  })
})

describe('hasFeature y presets', () => {
  it('sin requisito o sin datos, se ve', () => {
    expect(hasFeature(undefined, 'ia')).toBe(true)
    expect(hasFeature(DEFAULT_FEATURES)).toBe(true)
  })
  it('con varios requisitos basta uno', () => {
    expect(hasFeature({ ...DEFAULT_FEATURES, ahorro: true }, ['inversiones', 'ahorro'])).toBe(true)
    expect(hasFeature(DEFAULT_FEATURES, ['inversiones', 'ahorro'])).toBe(false)
  })
  it('los presets cubren todas las claves', () => {
    for (const p of FEATURE_PRESETS) expect(Object.keys(p.features).sort()).toEqual([...FEATURE_KEYS].sort())
  })
})
