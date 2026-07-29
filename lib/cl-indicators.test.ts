import { describe, it, expect } from 'vitest'
import { cumulativeInflationFactor, toTodayPesos, trailingAnnualInflation, realReturnPct, type IpcObservation } from './cl-indicators'

const series: IpcObservation[] = [
  { date: '2025-08-01', pctChange: 0 },
  { date: '2025-09-01', pctChange: 0.4 },
  { date: '2025-10-01', pctChange: 0 },
  { date: '2025-11-01', pctChange: 0.3 },
  { date: '2025-12-01', pctChange: -0.2 },
  { date: '2026-01-01', pctChange: 1.1 },
  { date: '2026-02-01', pctChange: 0.4 },
  { date: '2026-03-01', pctChange: 0.5 },
  { date: '2026-04-01', pctChange: 0.2 },
  { date: '2026-05-01', pctChange: 0.2 },
  { date: '2026-06-01', pctChange: -0.4 },
  { date: '2026-07-01', pctChange: 0.9 },
]

describe('cumulativeInflationFactor', () => {
  it('1 sin meses en el rango', () => {
    expect(cumulativeInflationFactor(series, '2026-07-01', '2026-07-01')).toBe(1)
  })
  it('1 si fromDate >= toDate', () => {
    expect(cumulativeInflationFactor(series, '2026-07-01', '2026-01-01')).toBe(1)
  })
  it('compone los meses estrictamente después de fromDate y hasta toDate', () => {
    // dic 2025 (exclusive) → mar 2026 (inclusive): ene(1.1) feb(0.4) mar(0.5)
    const factor = cumulativeInflationFactor(series, '2025-12-01', '2026-03-01')
    const expected = 1.011 * 1.004 * 1.005
    expect(factor).toBeCloseTo(expected, 6)
  })
})

describe('toTodayPesos', () => {
  it('sube un monto pasado a pesos de hoy según la inflación acumulada', () => {
    // $100.000 de dic 2025 a mar 2026 con el factor de arriba
    const result = toTodayPesos(100000, '2025-12-01', '2026-03-01', series)
    expect(result).toBe(Math.round(100000 * 1.011 * 1.004 * 1.005))
  })
  it('monto sin cambio si fromDate === toDate', () => {
    expect(toTodayPesos(50000, '2026-07-01', '2026-07-01', series)).toBe(50000)
  })
})

describe('trailingAnnualInflation', () => {
  it('null si no hay suficientes meses en la serie', () => {
    expect(trailingAnnualInflation(series.slice(-3), '2026-07-01', 12)).toBeNull()
  })
  it('compone los últimos 12 meses hasta asOfDate', () => {
    const result = trailingAnnualInflation(series, '2026-07-01', 12)
    const factor = series.reduce((f, o) => f * (1 + o.pctChange / 100), 1)
    expect(result).toBeCloseTo(Math.round((factor - 1) * 1000) / 10, 1)
    expect(result).not.toBeNull()
  })
  it('ignora meses posteriores a asOfDate', () => {
    const withFuture = [...series, { date: '2026-08-01', pctChange: 50 }]
    const result = trailingAnnualInflation(withFuture, '2026-07-01', 12)
    const resultNoFuture = trailingAnnualInflation(series, '2026-07-01', 12)
    expect(result).toBe(resultNoFuture)
  })
})

describe('realReturnPct', () => {
  it('el ejemplo canónico: 12% nominal con 4% de inflación es ~7,7% real, no 8%', () => {
    expect(realReturnPct(12, 4)).toBeCloseTo(7.7, 1)
  })
  it('0% real cuando el nominal empata con la inflación', () => {
    expect(realReturnPct(4, 4)).toBe(0)
  })
  it('negativo cuando la inflación supera el retorno nominal', () => {
    expect(realReturnPct(3, 5)).toBeLessThan(0)
  })
})
