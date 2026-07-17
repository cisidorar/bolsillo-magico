import { analyze, type DailyCandles, type RatingLabel } from './technical'

// ── Evaluación de señales a posteriori ────────────────────────────────────────
// La única forma real de saber si el motor técnico sirve es medir qué pasó
// DESPUÉS de cada señal, con la propia historia del ticker. Esto NO es una
// opinión sobre el futuro: es una foto de cómo le fue a la regla en el pasado
// de esta acción — sirve para calibrar cuánto confiar en ella, no para
// prometer que se repite.
//
// Metodología: se recorre el último año de ruedas y, día por día, se corre
// analyze() con SOLO los datos hasta ese día (sin mirar el futuro — sería
// trampa). Cuando el rating CAMBIA a compra/compra_fuerte/venta/venta_fuerte
// (no cada día que se mantiene: eso duplicaría el mismo movimiento muchas
// veces), se registra el evento. El retorno futuro (20 y 60 ruedas ≈ 1 y 3
// meses) sí usa la historia completa, porque ahí ya estamos mirando en
// retrospectiva a propósito.

export interface SignalEvent {
  date:  string
  label: RatingLabel
  price: number
  return20: number | null   // % a ~1 mes (20 ruedas) después de la señal
  return60: number | null   // % a ~3 meses (60 ruedas) después de la señal
}

export interface LabelStat {
  label:        RatingLabel
  count:        number
  avgReturn20:  number | null
  avgReturn60:  number | null
  hitRate20:    number | null   // % de veces que la señal "acertó" a 20 ruedas
                                  // (compra: subió · venta: bajó o se evitó una caída)
}

export interface SignalBacktestResult {
  events:     SignalEvent[]   // más reciente primero
  stats:      LabelStat[]
  windowDays: number
}

const EVAL_WINDOW = 260   // ~1 año hábil de transiciones a evaluar
const MIN_HISTORY  = 260  // SMA200 + margen: antes de esto analyze() no opina de tendencia

const BUY_LABELS:  RatingLabel[] = ['compra', 'compra_fuerte']
const SELL_LABELS: RatingLabel[] = ['venta', 'venta_fuerte']

export function backtestSignals(candles: DailyCandles): SignalBacktestResult {
  const n = candles.closes.length
  const start = Math.max(MIN_HISTORY, n - EVAL_WINDOW)
  const events: SignalEvent[] = []
  let prevLabel: RatingLabel | null = null

  const fwdReturn = (idx: number, daysFwd: number): number | null => {
    const j = idx + daysFwd
    if (j >= n) return null
    const base = candles.closes[idx]
    return base > 0 ? Math.round(((candles.closes[j] - base) / base) * 1000) / 10 : null
  }

  for (let i = start; i < n; i++) {
    // Solo datos HASTA i: la señal no puede ver el futuro
    const slice: DailyCandles = {
      closes:  candles.closes.slice(0, i + 1),
      dates:   candles.dates.slice(0, i + 1),
      highs:   candles.highs.slice(0, i + 1),
      lows:    candles.lows.slice(0, i + 1),
      volumes: candles.volumes.slice(0, i + 1),
    }
    const label = analyze(slice).rating.label
    const isEntry = label !== prevLabel && (BUY_LABELS.includes(label) || SELL_LABELS.includes(label))
    if (isEntry) {
      events.push({
        date: candles.dates[i], label, price: candles.closes[i],
        return20: fwdReturn(i, 20), return60: fwdReturn(i, 60),
      })
    }
    prevLabel = label
  }

  const labelsPresent = [...new Set(events.map(e => e.label))]
  const stats: LabelStat[] = labelsPresent.map(label => {
    const evs = events.filter(e => e.label === label)
    const r20s = evs.map(e => e.return20).filter((v): v is number => v !== null)
    const r60s = evs.map(e => e.return60).filter((v): v is number => v !== null)
    const isBuy = BUY_LABELS.includes(label)
    const hits  = r20s.filter(v => isBuy ? v > 0 : v < 0)
    return {
      label,
      count: evs.length,
      avgReturn20: r20s.length > 0 ? Math.round((r20s.reduce((s, v) => s + v, 0) / r20s.length) * 10) / 10 : null,
      avgReturn60: r60s.length > 0 ? Math.round((r60s.reduce((s, v) => s + v, 0) / r60s.length) * 10) / 10 : null,
      hitRate20:   r20s.length > 0 ? Math.round((hits.length / r20s.length) * 1000) / 10 : null,
    }
  })

  return { events: events.reverse(), stats, windowDays: n - start }
}
