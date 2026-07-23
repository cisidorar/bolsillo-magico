import { describe, it, expect } from 'vitest'
import { detectLeverage } from './leveraged-etfs'

describe('detectLeverage', () => {
  it('ticker conocido (SOXL) → apalancado 3x aunque no llegue nombre', () => {
    expect(detectLeverage('SOXL')).toEqual({ factor: 3, source: 'known' })
  })

  it('ticker conocido case-insensitive', () => {
    expect(detectLeverage('soxl')).toEqual({ factor: 3, source: 'known' })
  })

  it('ticker desconocido con nombre "...Bull 3X Shares" → detecta por nombre', () => {
    const r = detectLeverage('XYZL', 'Direxion Daily Semiconductor Bull 3X Shares')
    expect(r).toEqual({ factor: 3, source: 'name' })
  })

  it('ticker normal sin apalancamiento en el nombre → null', () => {
    expect(detectLeverage('AAPL', 'Apple Inc')).toBeNull()
  })

  it('sin nombre y ticker desconocido → null', () => {
    expect(detectLeverage('ZZZZ')).toBeNull()
  })

  it('nombre con "3X" pero sin bull/bear/ultra/daily → no lo marca (evita falsos positivos)', () => {
    expect(detectLeverage('ZZZZ', 'Some Random Fund 3X Media Corp')).toBeNull()
  })
})
