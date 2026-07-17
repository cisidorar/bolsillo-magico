import { describe, it, expect } from 'vitest'
import {
  analyze, smaLast, smaSeries, rsiWilder, macd,
  atrSeries, chandelierStop, positionSizeUsd,
  type DailyCandles,
} from './technical'

// ── Fixtures sintéticas ───────────────────────────────────────────────────────
// Series construidas a mano cuyas propiedades conocemos con certeza. La meta
// NO es validar cada número, sino CONGELAR las reglas de decisión que ya
// calibramos (casos reales KO/SNDK/INTC/MELI): que una iteración futura no
// vuelva a introducir "Compra permanente en uptrend", "asegura ganancia" en
// euforia comprable, planes de compra en tendencia bajista, etc.

/** Días hábiles consecutivos desde 2025-01-06 (lunes). */
function tradingDates(n: number): string[] {
  const out: string[] = []
  const d = new Date('2025-01-06T12:00:00Z')
  while (out.length < n) {
    const dow = d.getUTCDay()
    if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

function toCandles(closes: number[], volumes?: number[]): DailyCandles {
  return {
    closes,
    dates:   tradingDates(closes.length),
    highs:   closes.map(c => c * 1.01),
    lows:    closes.map(c => c * 0.99),
    volumes: volumes ?? closes.map(() => 1_000_000),
  }
}

/** Tendencia alcista suave (+~0.1%/día) con oscilación para RSI moderado. */
function uptrendCloses(n = 320): number[] {
  return Array.from({ length: n }, (_, i) => 100 * Math.pow(1.001, i) + Math.sin(i / 4) * 1.5)
}

/** Plano 200 días y luego parabólico +1.5%/día — euforia tipo SNDK. */
function euphoricCloses(): number[] {
  const flat = Array.from({ length: 220 }, (_, i) => 100 + Math.sin(i / 4))
  const boom = Array.from({ length: 100 }, (_, i) => 100 * Math.pow(1.015, i + 1))
  return [...flat, ...boom]
}

/** Tendencia bajista sostenida (−~0.15%/día) con oscilación. */
function downtrendCloses(n = 320): number[] {
  return Array.from({ length: n }, (_, i) => 150 * Math.pow(0.9985, i) + Math.sin(i / 4) * 1.2)
}

// ── Indicadores puros ─────────────────────────────────────────────────────────

describe('indicadores', () => {
  it('smaLast promedia los últimos n', () => {
    expect(smaLast([1, 2, 3, 4, 5], 5)).toBe(3)
    expect(smaLast([1, 2, 3], 5)).toBeNull()
  })

  it('smaSeries queda alineada con closes', () => {
    const s = smaSeries([2, 4, 6, 8], 2)
    expect(s).toHaveLength(4)
    expect(s[0]).toBeNull()
    expect(s[1]).toBe(3)
    expect(s[3]).toBe(7)
  })

  it('rsiWilder respeta los extremos', () => {
    const allUp   = Array.from({ length: 30 }, (_, i) => 100 + i)
    const allDown = Array.from({ length: 30 }, (_, i) => 100 - i)
    expect(rsiWilder(allUp)).toBe(100)
    expect(rsiWilder(allDown)).toBe(0)
  })

  it('macd devuelve series alineadas', () => {
    const closes = uptrendCloses(100)
    const { macdLine, signalLine, histogram } = macd(closes)
    expect(macdLine).toHaveLength(100)
    expect(signalLine).toHaveLength(100)
    expect(histogram).toHaveLength(100)
  })

  it('atrSeries: rango constante da ATR igual al rango', () => {
    const n = 40
    const closes = Array.from({ length: n }, () => 100)
    const highs  = closes.map(c => c + 1)
    const lows   = closes.map(c => c - 1)
    const atr = atrSeries(highs, lows, closes, 14)
    expect(atr[n - 1]).toBeCloseTo(2, 5)   // TR = high − low = 2 todos los días
    expect(atr[13]).toBeNull()             // alineación: null hasta tener period+1 datos
  })

  it('chandelierStop queda bajo el máximo reciente por mult×ATR', () => {
    const highs = Array.from({ length: 30 }, (_, i) => 100 + i)   // máximo = 129
    expect(chandelierStop(highs, 2, 22, 3)).toBe(129 - 6)
  })

  it('positionSizeUsd: la regla del 1% dimensiona por distancia al stop', () => {
    // Portafolio $10.000, riesgo 1% = $100; stop a −5% → posición máx $2.000
    const s = positionSizeUsd(10_000, 100, 95, 1)
    expect(s).not.toBeNull()
    expect(s!.riskUsd).toBe(100)
    expect(s!.stopDistPct).toBe(5)
    expect(s!.maxUsd).toBe(2000)
  })

  it('positionSizeUsd: nunca sugiere más que el portafolio completo', () => {
    // Stop pegado al precio (−0.5%): sin tope sería 2× el portafolio
    const s = positionSizeUsd(10_000, 100, 99.5, 1)
    expect(s!.maxUsd).toBeLessThanOrEqual(10_000)
  })

  it('positionSizeUsd: sin stop bajo el precio no hay sugerencia', () => {
    expect(positionSizeUsd(10_000, 100, null)).toBeNull()
    expect(positionSizeUsd(10_000, 100, 101)).toBeNull()
    expect(positionSizeUsd(0, 100, 95)).toBeNull()
  })
})

// ── Escenario 1: uptrend sano sin gatillos ────────────────────────────────────

describe('uptrend sano', () => {
  const a = analyze(toCandles(uptrendCloses()))

  it('detecta la tendencia de fondo', () => {
    expect(a.trend.aboveSma200).toBe(true)
    expect(a.trend.sma200Rising).toBe(true)
  })

  it('nunca lee Venta con tendencia sana', () => {
    expect(['venta', 'venta_fuerte']).not.toContain(a.rating.label)
  })

  it('el plan de salida es "dejar correr": nada ejecutable hoy y con alarma', () => {
    expect(a.sell.some(t => t.now)).toBe(false)
    expect(a.alarm).not.toBeNull()
    expect(a.alarm!).toBeLessThan(a.price)
  })

  it('expone la volatilidad (ATR) y la alarma respeta el aire de 3×ATR o el nivel estructural', () => {
    expect(a.atr14).not.toBeNull()
    expect(a.atrPct).toBeGreaterThan(0)
    // La alarma nunca queda pegada al precio: como mínimo conserva el mayor
    // entre el nivel estructural y el chandelier — siempre bajo el precio
    expect(a.alarm!).toBeLessThan(a.price)
    expect(a.alarm!).toBeGreaterThan(a.price * 0.7)   // y tampoco absurdamente lejos en un uptrend suave
  })

  it('los tramos de compra suman 100% cuando existen', () => {
    if (a.buy.length > 0) {
      expect(a.buy.reduce((s, t) => s + t.pct, 0)).toBe(100)
    }
  })
})

// ── Escenario 2: euforia (caso SNDK +145% sobre SMA200) ──────────────────────

describe('euforia parabólica', () => {
  const a = analyze(toCandles(euphoricCloses()))

  it('está muy sobre su promedio y lo señala como extremo', () => {
    expect(a.trend.distPct!).toBeGreaterThanOrEqual(40)
    expect(a.signals.some(s => s.kind === 'overextended_extreme')).toBe(true)
  })

  it('el veredicto lidera con euforia, no con "tendencia sana"', () => {
    expect(a.verdict.toLowerCase()).toContain('euforia')
  })

  it('no ofrece comprar HOY: todo tramo de compra queda condicionado', () => {
    expect(a.buy.every(t => !t.now)).toBe(true)
  })

  it('el radar no anuncia "romper techo = comprar" en euforia', () => {
    expect(a.watch.some(w => w.kind === 'watch_breakout')).toBe(false)
  })

  it('para quien la tiene: asegurar una parte AHORA (zona caliente)', () => {
    expect(a.sell.some(t => t.now)).toBe(true)
  })

  it('la euforia castiga el score de tendencia (−2)', () => {
    expect(a.rating.trendScore).toBeLessThanOrEqual(0)
  })
})

// ── Escenario 3: tendencia bajista ────────────────────────────────────────────

describe('tendencia bajista', () => {
  const a = analyze(toCandles(downtrendCloses()))

  it('detecta el estado', () => {
    expect(a.trend.aboveSma200).toBe(false)
  })

  it('sin plan de compra: bajista = fuera del radar', () => {
    expect(a.buy).toHaveLength(0)
    expect(a.entryPlan).toContain('Sin base')
  })

  it('salida total ejecutable hoy, sin alarma pendiente', () => {
    expect(a.sell).toHaveLength(1)
    expect(a.sell[0].pct).toBe(100)
    expect(a.sell[0].now).toBe(true)
    expect(a.alarm).toBeNull()
  })

  it('el texto de salida no asume que el usuario va perdiendo (caso MELI +10%)', () => {
    expect(a.sellPlan).not.toContain('recuperar tu precio de compra')
    expect(a.sellPlan.toLowerCase()).toContain('si vas ganando')
  })

  it('nunca lee Compra bajo el promedio largo', () => {
    expect(['compra', 'compra_fuerte']).not.toContain(a.rating.label)
  })

  it('el copy es imperativo, no una lista de avisos (jul 2026 — a pedido de Cas)', () => {
    // "No compres" / "Vende" al frente, no "ten en cuenta que" o "es posible que"
    expect(a.entryPlan).toMatch(/^No compres/)
    expect(a.sellPlan).toMatch(/^Vende/)
  })
})

// ── Escenario 4: salto brusco (split no ajustado, caso SNDK +3675% anual) ────

describe('integridad de datos', () => {
  it('un cambio diario de ±40% dispara la advertencia data_jump', () => {
    const closes = uptrendCloses()
    closes[closes.length - 30] = closes[closes.length - 31] * 1.6   // +60% en un día
    const a = analyze(toCandles(closes))
    expect(a.signals.some(s => s.kind === 'data_jump')).toBe(true)
  })
})

// ── Escenario 5: volumen inusual dentro de la semana (cadencia semanal) ──────

describe('volumen inusual', () => {
  it('un spike hace 3 días sigue visible (no solo el último día)', () => {
    const closes = uptrendCloses()
    const volumes = closes.map(() => 1_000_000)
    const idx = closes.length - 4                    // hace 3 días hábiles
    volumes[idx] = 3_000_000
    closes[idx]  = closes[idx - 1] * 1.03            // +3% ese día
    const a = analyze(toCandles(closes, volumes))
    expect(a.volumeSignal).toBe('up')
  })
})
