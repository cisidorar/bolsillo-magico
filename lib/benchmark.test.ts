import { describe, it, expect } from 'vitest'
import { computeSpyBenchmark, type DateClose, type CashFlowEvent, type PositionLite } from './benchmark'

// Historia sintética de SPY: sube de $400 a $500 en línea recta a lo largo
// de 5 fechas — fácil de verificar a mano.
const spyHistory: DateClose[] = [
  { date: '2025-01-01', close: 400 },
  { date: '2025-02-01', close: 425 },
  { date: '2025-03-01', close: 450 },
  { date: '2025-04-01', close: 475 },
  { date: '2025-05-01', close: 500 },
]

describe('computeSpyBenchmark', () => {
  it('null sin datos', () => {
    expect(computeSpyBenchmark([], spyHistory, [], new Map())).toBeNull()
    expect(computeSpyBenchmark([{ date: '2025-01-01', usd: 100 }], [], [], new Map())).toBeNull()
  })

  it('compra única, sin ventas: shadow crece igual que SPY', () => {
    const flows: CashFlowEvent[] = [{ date: '2025-01-01', usd: 4000 }]   // 10 acciones sombra
    const positions: PositionLite[] = [{ ticker: 'AAPL', shares: 10 }]
    const latest = new Map([['AAPL', 500]])   // la acción real también terminó en $500/u
    const r = computeSpyBenchmark(flows, spyHistory, positions, latest)
    expect(r).not.toBeNull()
    expect(r!.spyShares).toBeCloseTo(10, 5)
    expect(r!.shadowValueUsd).toBeCloseTo(5000, 5)   // 10 × 500
    expect(r!.realValueUsd).toBeCloseTo(5000, 5)      // misma trayectoria → empate
    expect(r!.diffUsd).toBeCloseTo(0, 5)
  })

  it('acción real terminó mejor que SPY → diff positivo', () => {
    const flows: CashFlowEvent[] = [{ date: '2025-01-01', usd: 4000 }]
    const positions: PositionLite[] = [{ ticker: 'NVDA', shares: 10 }]
    const latest = new Map([['NVDA', 800]])   // la acción se disparó más que SPY
    const r = computeSpyBenchmark(flows, spyHistory, positions, latest)!
    expect(r.realValueUsd).toBeGreaterThan(r.shadowValueUsd)
    expect(r.diffUsd).toBeGreaterThan(0)
    expect(r.diffPct).toBeGreaterThan(0)
  })

  it('venta reduce la posición sombra en el mismo monto y fecha', () => {
    const flows: CashFlowEvent[] = [
      { date: '2025-01-01', usd: 4000 },    // compra: +10 shadow shares
      { date: '2025-03-01', usd: -2250 },   // venta parcial a precio SPY de esa fecha (450): −5 shadow shares
    ]
    const positions: PositionLite[] = [{ ticker: 'AAPL', shares: 5 }]   // le queda la mitad real también
    const latest = new Map([['AAPL', 500]])
    const r = computeSpyBenchmark(flows, spyHistory, positions, latest)!
    expect(r.spyShares).toBeCloseTo(5, 5)
    expect(r.shadowValueUsd).toBeCloseTo(2500, 5)   // 5 × 500
  })

  it('fecha sin dato exacto usa el cierre disponible más cercano hacia atrás', () => {
    const flows: CashFlowEvent[] = [{ date: '2025-01-15', usd: 4000 }]   // no hay fila para el 15 — cae al cierre del 1
    const positions: PositionLite[] = [{ ticker: 'AAPL', shares: 10 }]
    const latest = new Map([['AAPL', 500]])
    const r = computeSpyBenchmark(flows, spyHistory, positions, latest)!
    expect(r.spyShares).toBeCloseTo(10, 5)   // mismo precio que el 2025-01-01 ($400)
  })

  it('ticker sin cierre conocido no aporta al valor real (no revienta)', () => {
    const flows: CashFlowEvent[] = [{ date: '2025-01-01', usd: 4000 }]
    const positions: PositionLite[] = [{ ticker: 'SINDATA', shares: 10 }]
    const r = computeSpyBenchmark(flows, spyHistory, positions, new Map())!
    expect(r.realValueUsd).toBe(0)
  })
})
