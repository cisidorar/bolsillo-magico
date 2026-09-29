import { describe, it, expect } from 'vitest'
import { xLabelIndices } from '@/lib/chart-axis'

describe('xLabelIndices — eje X del gráfico de patrimonio', () => {
  it('siempre incluye el primero y el último', () => {
    const idx = xLabelIndices(25, 8)
    expect(idx[0]).toBe(0)
    expect(idx[idx.length - 1]).toBe(24)
  })

  it('no deja un label pegado al último (bug "28 Sep29 Sep")', () => {
    // 25 puntos semanales + hoy: antes el penúltimo label caía a 1 punto del último
    for (const n of [10, 17, 23, 24, 25, 26, 40]) {
      const idx = xLabelIndices(n, 8)
      const step = Math.ceil((n - 1) / 7)
      const penultimate = idx[idx.length - 2]
      expect(n - 1 - penultimate).toBeGreaterThanOrEqual(Math.ceil(step * 0.6))
    }
  })

  it('con pocos puntos los muestra todos', () => {
    expect(xLabelIndices(4, 8)).toEqual([0, 1, 2, 3])
  })
})
