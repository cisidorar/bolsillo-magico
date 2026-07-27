import { describe, it, expect } from 'vitest'
import { computeVolumeProfile } from './volume-profile'

describe('computeVolumeProfile', () => {
  it('null si no hay datos', () => {
    expect(computeVolumeProfile([], [])).toBeNull()
  })

  it('null si closes y volumes no calzan en longitud', () => {
    expect(computeVolumeProfile([1, 2, 3], [1, 2])).toBeNull()
  })

  it('rango degenerado (mismo precio todo el período) → un solo bin con todo el volumen', () => {
    const closes  = [100, 100, 100]
    const volumes = [10, 20, 30]
    const p = computeVolumeProfile(closes, volumes, 60, 10)
    expect(p).not.toBeNull()
    expect(p!.poc).toBe(100)
    expect(p!.bins).toHaveLength(1)
    expect(p!.bins[0].volume).toBe(60)
  })

  it('identifica el bin de mayor volumen como POC', () => {
    // rango 100-110, 10 bins de ancho 1. Concentramos volumen enorme en 105.
    const closes  = [100, 101, 102, 103, 104, 105, 105, 105, 106, 110]
    const volumes = [1,   1,   1,   1,   1,   1000, 900, 950, 1,   1]
    const p = computeVolumeProfile(closes, volumes, 60, 10)!
    expect(p.rangeLow).toBe(100)
    expect(p.rangeHigh).toBe(110)
    // el bin ganador debe cubrir el precio 105
    expect(p.poc).toBeGreaterThanOrEqual(104.5)
    expect(p.poc).toBeLessThanOrEqual(106)
  })

  it('respeta el lookback — datos viejos fuera de la ventana no cuentan', () => {
    // un precio absurdo con volumen gigante muy viejo, fuera del lookback de 3
    const closes  = [9999, 100, 101, 102]
    const volumes = [999999, 10, 10, 10]
    const p = computeVolumeProfile(closes, volumes, 3, 5)!
    expect(p.rangeHigh).toBeLessThan(200)
    expect(p.rangeLow).toBe(100)
  })

  it('la suma de volumen de todos los bins es igual al volumen total de la ventana', () => {
    const closes  = [100, 102, 104, 106, 108, 110]
    const volumes = [5, 8, 3, 12, 7, 9]
    const p = computeVolumeProfile(closes, volumes, 60, 4)!
    const totalBins   = p.bins.reduce((s, b) => s + b.volume, 0)
    const totalVolume = volumes.reduce((s, v) => s + v, 0)
    expect(totalBins).toBe(totalVolume)
  })

  it('bins ordenados de menor a mayor precio', () => {
    const closes  = [100, 105, 110, 115, 120]
    const volumes = [1, 2, 3, 4, 5]
    const p = computeVolumeProfile(closes, volumes, 60, 5)!
    for (let i = 1; i < p.bins.length; i++) {
      expect(p.bins[i].priceLow).toBeGreaterThanOrEqual(p.bins[i - 1].priceLow)
    }
  })
})
