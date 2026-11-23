import { describe, it, expect } from 'vitest'
import { looksLikeSplit, splitFactorFromAdjusted } from './splits'

const pt = (date: string, close: number, volume: number) => ({ date, close, volume })

describe('looksLikeSplit', () => {
  it('caso real SNDK 20-nov-2026: 755→79 con volumen ×8 sobre el promedio', () => {
    expect(looksLikeSplit(pt('2026-11-19', 755.16, 15_023_549), pt('2026-11-20', 79.24, 125_826_339), 13_500_000)).toBe(true)
  })

  it('los desplomes reales del día (SOXL −31,8%, INTC −28,6%, SNDK −22%) no son split', () => {
    expect(looksLikeSplit(pt('a', 45.3, 50_000_000), pt('b', 30.88, 90_000_000))).toBe(false)
    expect(looksLikeSplit(pt('a', 92.07, 40_000_000), pt('b', 65.76, 150_000_000))).toBe(false)
    expect(looksLikeSplit(pt('a', 1037.4, 14e6), pt('b', 806.43, 40e6))).toBe(false)
  })

  it('un −89% real sin el volumen del split no pasa', () => {
    expect(looksLikeSplit(pt('a', 100, 1_000_000), pt('b', 11, 2_000_000))).toBe(false)
  })

  it('split 2×1 y 10×1 se sospechan', () => {
    expect(looksLikeSplit(pt('a', 200, 1e6), pt('b', 101, 2.1e6))).toBe(true)
    expect(looksLikeSplit(pt('a', 1000, 1e6), pt('b', 98, 10e6))).toBe(true)
  })

  it('reverse split 1×10: precio ×10, volumen ÷10', () => {
    expect(looksLikeSplit(pt('a', 2, 10_000_000), pt('b', 20.5, 1_000_000))).toBe(true)
  })

  it('un salto alcista de +30% con volumen alto no es reverse split', () => {
    expect(looksLikeSplit(pt('a', 10, 1e6), pt('b', 13, 6e6))).toBe(false)
  })

  it('datos inválidos no revientan', () => {
    expect(looksLikeSplit(pt('a', 0, 0), pt('b', 5, 5))).toBe(false)
    expect(looksLikeSplit(pt('a', 5, 5), pt('b', NaN, 5))).toBe(false)
  })
})

describe('splitFactorFromAdjusted', () => {
  it('SNDK: guardado 755,16 vs ajustado 94,395 = 8×1 (no 10×1)', () => {
    expect(splitFactorFromAdjusted(755.16, 94.395)).toBe(8)
  })
  it('sin diferencia real = no era split', () => {
    expect(splitFactorFromAdjusted(100, 100)).toBeNull()
    expect(splitFactorFromAdjusted(100, 99)).toBeNull()
  })
  it('reverse 1×10', () => {
    expect(splitFactorFromAdjusted(2, 20)).toBeCloseTo(0.1)
  })
  it('split no entero 3×2 = 1,5', () => {
    expect(splitFactorFromAdjusted(150, 100)).toBe(1.5)
  })
  it('entradas inválidas', () => {
    expect(splitFactorFromAdjusted(0, 5)).toBeNull()
    expect(splitFactorFromAdjusted(5, NaN)).toBeNull()
  })
})
