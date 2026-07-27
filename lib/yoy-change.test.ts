import { describe, it, expect } from 'vitest'
import { computeYoyChange, type Observation } from './yoy-change'

// Serie mensual simulando un índice tipo CPI: publicado el día 1 de cada mes,
// enero 2025 (100) a julio 2026 (109), subiendo ~0.5/mes.
function monthlySeries(): Observation[] {
  const obs: Observation[] = []
  let value = 100
  for (let y = 2025; y <= 2026; y++) {
    for (let m = 1; m <= 12; m++) {
      if (y === 2026 && m > 7) break
      obs.push({ date: `${y}-${String(m).padStart(2, '0')}-01`, value })
      value += 0.5
    }
  }
  return obs
}

describe('computeYoyChange', () => {
  it('null si no hay observaciones', () => {
    expect(computeYoyChange([], '2026-07-01')).toBeNull()
  })

  it('calcula la variación contra el mismo mes del año anterior', () => {
    const obs = monthlySeries()
    const r = computeYoyChange(obs, '2026-07-01')!
    expect(r.currentDate).toBe('2026-07-01')
    expect(r.yearAgoDate).toBe('2025-07-01')
    // jul-2026 es el índice 18 (0-based, ene-2025=0) → 100 + 18*0.5 = 109
    // jul-2025 es el índice 6 → 100 + 6*0.5 = 103
    expect(r.currentValue).toBeCloseTo(109, 5)
    expect(r.yearAgoValue).toBeCloseTo(103, 5)
    expect(r.pctChange).toBeCloseTo(((109 - 103) / 103) * 100, 5)
  })

  it('asOfDate posterior al último dato → usa el más reciente disponible', () => {
    const obs = monthlySeries()
    const r = computeYoyChange(obs, '2026-08-15')!
    expect(r.currentDate).toBe('2026-07-01')
  })

  it('null si hay menos de un año de historia', () => {
    const obs = monthlySeries().filter(o => o.date < '2025-08-01')   // solo 7 meses
    expect(computeYoyChange(obs, '2026-07-01')).toBeNull()
  })

  it('null si el valor de hace un año es cero (evita división por cero)', () => {
    const obs: Observation[] = [
      { date: '2025-07-01', value: 0 },
      { date: '2026-07-01', value: 10 },
    ]
    expect(computeYoyChange(obs, '2026-07-01')).toBeNull()
  })

  it('funciona con el arreglo desordenado (ordena internamente)', () => {
    const obs = [...monthlySeries()].reverse()
    const r = computeYoyChange(obs, '2026-07-01')!
    expect(r.currentDate).toBe('2026-07-01')
    expect(r.yearAgoDate).toBe('2025-07-01')
  })

  it('cuando no hay dato exacto de hace un año, usa el más cercano hacia atrás', () => {
    // quitamos jul-2025 — debería caer a jun-2025
    const obs = monthlySeries().filter(o => o.date !== '2025-07-01')
    const r = computeYoyChange(obs, '2026-07-01')!
    expect(r.yearAgoDate).toBe('2025-06-01')
  })
})
