import { describe, it, expect } from 'vitest'
import { momentum12_1, conditionStat, quintiles, type ResearchSample } from './signal-research'

const sample = (date: string, ticker: string, ex20: number | null, flags: Record<string, boolean> = {}, values: Record<string, number | null> = {}): ResearchSample =>
  ({ date, ticker, ex20, ex60: null, flags, values })

describe('momentum12_1', () => {
  it('mide de t−252 a t−21, ignorando el último mes', () => {
    const closes = Array.from({ length: 300 }, () => 100)
    closes[299 - 252] = 50
    closes[299 - 21] = 100
    closes[299] = 1   // el último mes no cuenta
    expect(momentum12_1(closes, 299)).toBe(100)
  })
  it('null sin un año de historia', () => {
    expect(momentum12_1([1, 2, 3], 2)).toBeNull()
  })
})

describe('conditionStat', () => {
  it('agrupa por fecha: 3 acciones con la misma señal el mismo día pesan como 1 observación', () => {
    const all = [
      sample('2020-01-01', 'A', 10, { x: true }), sample('2020-01-01', 'B', 10, { x: true }), sample('2020-01-01', 'C', 10, { x: true }),
      sample('2020-01-08', 'A', -2, { x: true }),
      sample('2020-01-01', 'D', 0), sample('2020-01-08', 'D', 0),
    ]
    const s = conditionStat('x', all, r => !!r.flags.x)
    expect(s.n).toBe(4)
    expect(s.dates).toBe(2)
    expect(s.mean).toBe(4)   // (10 + −2) / 2 fechas, no (10·3 − 2) / 4 muestras
  })

  it('lift = media de la condición − media del universo', () => {
    const all = [
      sample('2020-01-01', 'A', 4, { x: true }), sample('2020-01-01', 'B', 0),
      sample('2020-01-08', 'A', 4, { x: true }), sample('2020-01-08', 'B', 0),
    ]
    const s = conditionStat('x', all, r => !!r.flags.x)
    expect(s.mean).toBe(4)
    expect(s.lift).toBe(2)   // universo promedia 2 cada fecha
  })

  it('estable solo si el lift tiene el mismo signo en ambas mitades', () => {
    const dates = ['2020-01-01', '2020-02-01', '2020-03-01', '2020-04-01']
    const all = dates.flatMap((d, i) => [
      sample(d, 'A', i < 2 ? 5 : -5, { x: true }),
      sample(d, 'B', 0),
    ])
    const s = conditionStat('x', all, r => !!r.flags.x)
    expect(s.stable).toBe(false)
  })
})

describe('quintiles', () => {
  it('Q5−Q1 positivo cuando valores altos rinden más', () => {
    const all: ResearchSample[] = []
    for (const d of ['2020-01-01', '2020-01-08']) {
      for (let k = 0; k < 10; k++) all.push(sample(d, `T${k}`, k, {}, { f: k }))
    }
    const { rows, spread } = quintiles(all, 'f')
    expect(rows).toHaveLength(5)
    expect(spread).toBe(8)   // Q5 = (8+9)/2, Q1 = (0+1)/2
  })
})
