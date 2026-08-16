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

// ago 2026 (Cas: "me gustaria que cuando compre los dolares altiro hubiera
// comprado [SPY]... para que sea justo" + "en el valor del portafolio quiero
// que sumes lo que esta en la billetera"): el flujo de caja de la sombra
// ahora son APORTES a la billetera (dinero nuevo entrando), no compras/
// ventas de acciones — una venta ya no puede "romper" la sombra porque ya no
// genera un evento de flujo. El valor real ahora es posiciones + efectivo en
// la billetera. Ver comentario de metodología completo en lib/benchmark.ts.
describe('computeSpyBenchmark', () => {
  it('null sin datos', () => {
    expect(computeSpyBenchmark([], spyHistory, [], new Map())).toBeNull()
    expect(computeSpyBenchmark([{ date: '2025-01-01', usd: 100 }], [], [], new Map())).toBeNull()
  })

  it('aporte único, sin efectivo suelto: shadow crece igual que SPY', () => {
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

  it('efectivo disponible en la billetera se suma al valor real', () => {
    const flows: CashFlowEvent[] = [{ date: '2025-01-01', usd: 4000 }]
    const positions: PositionLite[] = [{ ticker: 'AAPL', shares: 5 }]
    const latest = new Map([['AAPL', 500]])
    const withoutCash = computeSpyBenchmark(flows, spyHistory, positions, latest)!
    const withCash    = computeSpyBenchmark(flows, spyHistory, positions, latest, 1500)!
    expect(withoutCash.realValueUsd).toBeCloseTo(2500, 5)         // 5 × 500
    expect(withCash.realValueUsd).toBeCloseTo(4000, 5)            // 2500 + 1500 efectivo
    expect(withCash.shadowValueUsd).toBeCloseTo(withoutCash.shadowValueUsd, 5)  // la sombra no cambia
  })

  it('una venta grande ya no distorsiona la sombra — solo mueve valor a efectivo de billetera', () => {
    // Aportó $1000 una vez (2.5 acciones sombra), compró una acción que se
    // disparó y la vendió por mucho más de lo que la sombra vale — esa venta
    // NO es un evento de flujo (ya no hay posición abierta ni cashflow extra),
    // solo aumenta el efectivo disponible en la billetera.
    const flows: CashFlowEvent[] = [{ date: '2025-01-01', usd: 1000 }]
    const positions: PositionLite[] = []   // se vendió todo
    const latest = new Map<string, number>()
    const r = computeSpyBenchmark(flows, spyHistory, positions, latest, 5000)!
    expect(r.shadowValueUsd).toBeCloseTo(1250, 5)   // 2.5 × 500, intacta
    expect(r.realValueUsd).toBeCloseTo(5000, 5)     // 0 en posiciones + 5000 de efectivo
    expect(r.diffUsd).toBeCloseTo(3750, 5)
    expect(r.degenerate).toBe(false)
    expect(r.distorted).toBe(false)   // 300% de diffPct no se dispara por una venta — solo por revalorización real
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

  // `degenerate`/`distorted` son legado del modelo anterior (cash flow por
  // compra/venta de acción, donde una venta grande podía forzar la sombra a
  // negativo o casi vaciarla). Los callers reales (inversiones/page.tsx,
  // weekly-report cron) ya solo mandan aportes (+) como flujo, así que estos
  // casos no deberían ocurrir en producción — se prueba acá solo que la
  // función sigue siendo defensiva si alguna vez recibe un flujo negativo.
  it('flujo negativo directo (no usado por los callers reales) sigue sin generar sombra negativa', () => {
    const flows: CashFlowEvent[] = [
      { date: '2025-01-01', usd: 1000 },
      { date: '2025-03-01', usd: -5000 },
    ]
    const positions: PositionLite[] = [{ ticker: 'NVDA', shares: 10 }]
    const latest = new Map([['NVDA', 253.294]])
    const r = computeSpyBenchmark(flows, spyHistory, positions, latest)!
    expect(r.degenerate).toBe(true)
    expect(r.shadowValueUsd).toBe(0)
    expect(r.spyShares).toBe(0)
    expect(r.diffPct).toBeNull()
  })

  it('caso normal (solo aportes): degenerate=false', () => {
    const flows: CashFlowEvent[] = [{ date: '2025-01-01', usd: 4000 }]
    const positions: PositionLite[] = [{ ticker: 'AAPL', shares: 10 }]
    const latest = new Map([['AAPL', 500]])
    const r = computeSpyBenchmark(flows, spyHistory, positions, latest)!
    expect(r.degenerate).toBe(false)
  })

  it('% moderado (<=300%): distorted=false', () => {
    const flows: CashFlowEvent[] = [{ date: '2025-01-01', usd: 4000 }]
    const positions: PositionLite[] = [{ ticker: 'NVDA', shares: 10 }]
    const latest = new Map([['NVDA', 800]])   // 2x SPY, diffPct = 100%
    const r = computeSpyBenchmark(flows, spyHistory, positions, latest)!
    expect(r.distorted).toBe(false)
  })
})
