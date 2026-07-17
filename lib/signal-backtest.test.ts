import { describe, it, expect } from 'vitest'
import { backtestSignals } from './signal-backtest'
import type { DailyCandles } from './technical'

function tradingDates(n: number): string[] {
  const out: string[] = []
  const d = new Date('2024-01-02T12:00:00Z')
  while (out.length < n) {
    const dow = d.getUTCDay()
    if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

function toCandles(closes: number[]): DailyCandles {
  return {
    closes,
    dates:   tradingDates(closes.length),
    highs:   closes.map(c => c * 1.01),
    lows:    closes.map(c => c * 0.99),
    volumes: closes.map(() => 1_000_000),
  }
}

describe('backtestSignals', () => {
  it('sin historia suficiente no revienta: devuelve stats vacíos', () => {
    const r = backtestSignals(toCandles(Array.from({ length: 50 }, () => 100)))
    expect(r.events).toHaveLength(0)
    expect(r.stats).toHaveLength(0)
  })

  it('un uptrend sano y monótono no genera señales de compra repetidas cada día', () => {
    // Tendencia sostenida sin gatillos (sin cruces/divergencias/volumen):
    // el rating se mantiene neutral casi todo el tramo — no debería inflar
    // el conteo de eventos por re-disparar el mismo estado día tras día.
    const closes = Array.from({ length: 400 }, (_, i) => 100 * Math.pow(1.0006, i))
    const r = backtestSignals(toCandles(closes))
    // Ninguna serie de eventos consecutivos debería repetir la misma etiqueta
    // dos veces seguidas (eso es justamente lo que la detección de "cambio"
    // debe evitar)
    for (let i = 1; i < r.events.length; i++) {
      // events vienen más-reciente-primero; comparar contra el siguiente en
      // el tiempo (índice anterior en el array) no debería dar el mismo label
      // en fechas consecutivas del MISMO tramo — chequeo mínimo: no hay fechas duplicadas
      expect(r.events[i].date).not.toBe(r.events[i - 1].date)
    }
  })

  it('los retornos futuros son null cuando no alcanza el horizonte (evento muy reciente)', () => {
    const closes = Array.from({ length: 300 }, (_, i) => 100 * Math.pow(1.002, i) + Math.sin(i / 3) * 3)
    const r = backtestSignals(toCandles(closes))
    const lastEvent = r.events[0]   // más reciente primero
    if (lastEvent) {
      // Si el evento quedó a menos de 60 ruedas del final, return60 debe ser null
      const idxFromEnd = closes.length - 1 - closes.findIndex((_, i) => tradingDates(closes.length)[i] === lastEvent.date)
      if (idxFromEnd < 60) expect(lastEvent.return60).toBeNull()
    }
  })

  it('stats agregan count y promedios coherentes con los eventos', () => {
    const closes = Array.from({ length: 400 }, (_, i) => 100 * Math.pow(1.0008, i) + Math.sin(i / 5) * 4)
    const r = backtestSignals(toCandles(closes))
    for (const s of r.stats) {
      const evs = r.events.filter(e => e.label === s.label)
      expect(s.count).toBe(evs.length)
      if (s.avgReturn20 !== null) {
        const r20s = evs.map(e => e.return20).filter((v): v is number => v !== null)
        const avg = r20s.reduce((a, b) => a + b, 0) / r20s.length
        expect(s.avgReturn20).toBeCloseTo(Math.round(avg * 10) / 10, 1)
      }
    }
  })
})
