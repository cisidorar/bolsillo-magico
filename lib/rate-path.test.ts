import { describe, it, expect } from 'vitest'
import { computeRatePath } from './rate-path'

describe('computeRatePath', () => {
  it('spread grande y positivo → alzas esperadas, movimientos redondeados', () => {
    // Caso real aproximado: FOMC 29 jul 2026 — DFF ~3.63%, DGS2 bien por arriba.
    const r = computeRatePath(4.13, 3.63)   // +50pb
    expect(r.spreadBp).toBe(50)
    expect(r.direction).toBe('alzas')
    expect(r.impliedMoves).toBe(2)
  })

  it('spread grande y negativo → bajas esperadas', () => {
    const r = computeRatePath(3.13, 3.63)   // -50pb
    expect(r.spreadBp).toBe(-50)
    expect(r.direction).toBe('bajas')
    expect(r.impliedMoves).toBe(-2)
  })

  it('spread chico (ruido) → estable, no se lee como señal', () => {
    const r = computeRatePath(3.68, 3.63)   // +5pb
    expect(r.direction).toBe('estable')
  })

  it('spread justo en el umbral no cuenta como señal (estrictamente mayor)', () => {
    const r = computeRatePath(3.78, 3.63)   // +15pb exacto
    expect(r.direction).toBe('estable')
  })

  it('un solo movimiento de 25pb redondea a ~1, no a 0', () => {
    const r = computeRatePath(3.88, 3.63)   // +25pb
    expect(r.impliedMoves).toBe(1)
    expect(r.direction).toBe('alzas')
  })

  it('tasas iguales → spread 0, estable, sin movimientos', () => {
    const r = computeRatePath(3.63, 3.63)
    expect(r.spreadBp).toBe(0)
    expect(r.direction).toBe('estable')
    expect(r.impliedMoves).toBe(0)
  })
})
