import { describe, it, expect } from 'vitest'
import { computeFibonacci } from './fibonacci'

function dates(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`)
}

describe('computeFibonacci', () => {
  it('null si no hay datos', () => {
    expect(computeFibonacci([], [], [])).toBeNull()
  })

  it('null si el rango es degenerado (high === low en todo el lookback)', () => {
    const highs = [100, 100, 100]
    const lows  = [100, 100, 100]
    expect(computeFibonacci(highs, lows, dates(3))).toBeNull()
  })

  it('máximo más reciente que el mínimo → retracement_down (posible corrección a la baja)', () => {
    // mínimo en el índice 0, máximo en el índice 4 (más reciente) → veníamos subiendo
    const highs = [90, 95, 100, 105, 110]
    const lows  = [80, 85, 90,  95,  100]
    const r = computeFibonacci(highs, lows, dates(5))
    expect(r).not.toBeNull()
    expect(r!.direction).toBe('retracement_down')
    expect(r!.swingHigh).toBe(110)
    expect(r!.swingLow).toBe(80)
  })

  it('mínimo más reciente que el máximo → retracement_up (posible rebote al alza)', () => {
    // máximo en el índice 0, mínimo en el índice 4 (más reciente) → veníamos bajando
    const highs = [110, 105, 100, 95, 90]
    const lows  = [100, 95,  90,  85, 80]
    const r = computeFibonacci(highs, lows, dates(5))
    expect(r).not.toBeNull()
    expect(r!.direction).toBe('retracement_up')
    expect(r!.swingHigh).toBe(110)
    expect(r!.swingLow).toBe(80)
  })

  it('niveles 0.5 y 0.618 quedan en el punto medio esperado del rango', () => {
    const highs = [90, 95, 100, 105, 110]
    const lows  = [80, 85, 90,  95,  100]
    const r = computeFibonacci(highs, lows, dates(5))!
    const level50  = r.levels.find(l => l.ratio === 0.5)!
    const level618 = r.levels.find(l => l.ratio === 0.618)!
    // retracement_down: price = high - range*ratio, range = 110-80 = 30
    expect(level50.price).toBeCloseTo(110 - 30 * 0.5, 5)
    expect(level618.price).toBeCloseTo(110 - 30 * 0.618, 5)
  })

  it('niveles ordenados de mayor a menor precio', () => {
    const highs = [90, 95, 100, 105, 110]
    const lows  = [80, 85, 90,  95,  100]
    const r = computeFibonacci(highs, lows, dates(5))!
    const prices = r.levels.map(l => l.price)
    const sorted = [...prices].sort((a, b) => b - a)
    expect(prices).toEqual(sorted)
  })

  it('respeta el lookback — un swing fuera de la ventana no se usa', () => {
    // swing extremo muy viejo, fuera del lookback de 3
    const highs = [1000, 90, 95, 100]
    const lows  = [1,    80, 85, 90]
    const r = computeFibonacci(highs, lows, dates(4), 3)!
    expect(r.swingHigh).toBe(100)
    expect(r.swingLow).toBe(80)
  })

  it('lanza null si los arrays no calzan en longitud', () => {
    expect(computeFibonacci([1, 2], [1], ['2026-01-01', '2026-01-02'])).toBeNull()
  })
})
