// ── Análisis técnico: matemática determinista sobre velas diarias ────────────
// Ninguna señal es recomendación de inversión: son indicadores informativos
// con las convenciones estándar (RSI 14 de Wilder, SMA simples, pivotes).

export interface DailyCandles {
  closes: number[]   // cierres diarios, oldest → newest
  dates:  string[]   // 'YYYY-MM-DD' por cada punto
}

export type SignalTone = 'mint' | 'gold' | 'coral' | 'neutral'

export interface TechnicalSignal {
  kind:   string
  tone:   SignalTone
  title:  string
  detail: string
}

export interface TechnicalAnalysis {
  price:        number
  asOf:         string          // fecha del último cierre
  sma20:        number | null
  sma50:        number | null
  sma200:       number | null
  rsi14:        number | null
  high52:       number
  low52:        number
  distHighPct:  number          // % bajo el máximo 52s (negativo = bajo el máximo)
  distLowPct:   number          // % sobre el mínimo 52s
  supports:     number[]        // hasta 2, más cercanos bajo el precio
  resistances:  number[]        // hasta 2, más cercanos sobre el precio
  signals:      TechnicalSignal[]
}

// ── Indicadores ───────────────────────────────────────────────────────────────

/** Media móvil simple del último punto (null si no hay suficientes datos). */
export function smaLast(closes: number[], n: number): number | null {
  if (closes.length < n) return null
  let s = 0
  for (let i = closes.length - n; i < closes.length; i++) s += closes[i]
  return s / n
}

/** RSI de Wilder (suavizado exponencial estándar). */
export function rsiWilder(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null
  let gain = 0, loss = 0
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1]
    if (d >= 0) gain += d; else loss -= d
  }
  let avgGain = gain / period
  let avgLoss = loss / period
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period
  }
  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - 100 / (1 + rs)
}

/**
 * Pivotes: mínimos/máximos locales con ventana de `w` días a cada lado.
 * Se agrupan niveles a menos de `clusterPct`% entre sí (promedio del grupo).
 */
export function pivotLevels(
  closes: number[],
  w = 5,
  clusterPct = 1.5,
): { lows: number[]; highs: number[] } {
  const lows: number[] = []
  const highs: number[] = []
  for (let i = w; i < closes.length - w; i++) {
    let isLow = true, isHigh = true
    for (let j = i - w; j <= i + w; j++) {
      if (closes[j] < closes[i]) isLow = false
      if (closes[j] > closes[i]) isHigh = false
    }
    if (isLow) lows.push(closes[i])
    if (isHigh) highs.push(closes[i])
  }
  const cluster = (levels: number[]): number[] => {
    const sorted = [...levels].sort((a, b) => a - b)
    const out: number[][] = []
    for (const v of sorted) {
      const g = out[out.length - 1]
      if (g && (v - g[g.length - 1]) / g[g.length - 1] * 100 <= clusterPct) g.push(v)
      else out.push([v])
    }
    return out.map(g => g.reduce((s, x) => s + x, 0) / g.length)
  }
  return { lows: cluster(lows), highs: cluster(highs) }
}

/** Cruce reciente entre dos series de SMA (dorado/muerte) en los últimos `lookback` días. */
function recentCross(closes: number[], fast: number, slow: number, lookback = 10): 'golden' | 'death' | null {
  if (closes.length < slow + lookback) return null
  const smaAt = (endIdx: number, n: number): number => {
    let s = 0
    for (let i = endIdx - n + 1; i <= endIdx; i++) s += closes[i]
    return s / n
  }
  const last = closes.length - 1
  const nowDiff  = smaAt(last, fast) - smaAt(last, slow)
  const prevDiff = smaAt(last - lookback, fast) - smaAt(last - lookback, slow)
  if (prevDiff <= 0 && nowDiff > 0) return 'golden'
  if (prevDiff >= 0 && nowDiff < 0) return 'death'
  return null
}

// ── Análisis completo ────────────────────────────────────────────────────────

export function analyze(candles: DailyCandles): TechnicalAnalysis {
  const { closes, dates } = candles
  const price = closes[closes.length - 1]
  const asOf  = dates[dates.length - 1]

  // 52 semanas ≈ últimos 252 días hábiles
  const win252 = closes.slice(-252)
  const high52 = Math.max(...win252)
  const low52  = Math.min(...win252)

  const sma20  = smaLast(closes, 20)
  const sma50  = smaLast(closes, 50)
  const sma200 = smaLast(closes, 200)
  const rsi14  = rsiWilder(closes, 14)

  const { lows, highs } = pivotLevels(win252)
  const supports    = lows.filter(l => l < price).sort((a, b) => b - a).slice(0, 2)
  const resistances = highs.filter(h => h > price).sort((a, b) => a - b).slice(0, 2)

  const distHighPct = Math.round(((price - high52) / high52) * 1000) / 10
  const distLowPct  = Math.round(((price - low52) / low52) * 1000) / 10

  // ── Señales (informativas, con umbrales estándar) ────────────────────────
  const signals: TechnicalSignal[] = []
  const pct = (a: number, b: number) => Math.abs((a - b) / b) * 100

  if (rsi14 !== null) {
    if (rsi14 <= 30) signals.push({
      kind: 'rsi_oversold', tone: 'mint', title: `RSI ${Math.round(rsi14)} — zona de sobreventa`,
      detail: 'Bajo 30 suele leerse como caída sobre-extendida. Ojo: puede seguir bajando.',
    })
    else if (rsi14 >= 70) signals.push({
      kind: 'rsi_overbought', tone: 'gold', title: `RSI ${Math.round(rsi14)} — zona de sobrecompra`,
      detail: 'Sobre 70 suele leerse como subida sobre-extendida; históricamente aumenta la probabilidad de pausa o retroceso.',
    })
  }

  const cross = recentCross(closes, 50, 200)
  if (cross === 'golden') signals.push({
    kind: 'golden_cross', tone: 'mint', title: 'Cruce dorado reciente (SMA50 sobre SMA200)',
    detail: 'La media de 50 días superó a la de 200 hace poco — señal clásica de cambio de tendencia al alza.',
  })
  if (cross === 'death') signals.push({
    kind: 'death_cross', tone: 'coral', title: 'Cruce de la muerte reciente (SMA50 bajo SMA200)',
    detail: 'La media de 50 días cayó bajo la de 200 hace poco — señal clásica de cambio de tendencia a la baja.',
  })

  if (sma200 !== null) {
    signals.push(price >= sma200
      ? { kind: 'above_sma200', tone: 'neutral', title: 'Sobre su media de 200 días',
          detail: `Cotiza ${Math.round(pct(price, sma200) * 10) / 10}% por encima de la SMA200 — tendencia de largo plazo aún alcista.` }
      : { kind: 'below_sma200', tone: 'gold', title: 'Bajo su media de 200 días',
          detail: `Cotiza ${Math.round(pct(price, sma200) * 10) / 10}% por debajo de la SMA200 — tendencia de largo plazo debilitada.` })
  }

  if (supports.length > 0 && pct(price, supports[0]) <= 3) signals.push({
    kind: 'near_support', tone: 'mint', title: `Cerca de soporte en ${fmtLevel(supports[0])}`,
    detail: 'Zona donde el precio rebotó antes. Si la pierde con claridad, el soporte deja de ser válido.',
  })
  if (resistances.length > 0 && pct(price, resistances[0]) <= 3) signals.push({
    kind: 'near_resistance', tone: 'gold', title: `Cerca de resistencia en ${fmtLevel(resistances[0])}`,
    detail: 'Zona donde el precio se devolvió antes. Superarla con volumen suele leerse como fortaleza.',
  })

  if (distHighPct >= -2) signals.push({
    kind: 'near_52w_high', tone: 'gold', title: 'En zona de máximos de 52 semanas',
    detail: 'Está a menos de 2% de su máximo anual.',
  })
  if (distLowPct <= 5) signals.push({
    kind: 'near_52w_low', tone: 'coral', title: 'En zona de mínimos de 52 semanas',
    detail: 'Está a menos de 5% de su mínimo anual. Barato no siempre significa oportunidad.',
  })

  return { price, asOf, sma20, sma50, sma200, rsi14, high52, low52, distHighPct, distLowPct, supports, resistances, signals }
}

function fmtLevel(v: number): string {
  return '$' + v.toLocaleString('es-CL', { maximumFractionDigits: v >= 100 ? 0 : 2 })
}
