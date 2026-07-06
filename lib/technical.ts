// ── Análisis técnico de largo plazo: matemática determinista sobre velas diarias ──
// Pensado para un inversionista que decide ~1 vez por semana, no para trading:
// tendencia de fondo con persistencia, niveles con historia (toques y vigencia),
// divergencias precio/RSI y rendimiento en ventanas largas.
// Ninguna señal es recomendación de inversión.

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

/** Nivel de soporte/resistencia con su historia. */
export interface LevelInfo {
  price:       number
  touches:     number   // cuántos pivotes formaron el nivel
  firstDate:   string   // primer toque
  lastDate:    string   // último toque
  weeksActive: number   // semanas desde el primer toque hasta hoy
}

export interface ChartPoint {
  date:   string
  close:  number
  sma200: number | null
}

export interface TechnicalAnalysis {
  price:        number
  asOf:         string
  verdict:      string                 // conclusión en 1-2 frases, generada por código
  // Tendencia de fondo
  trend: {
    aboveSma200:  boolean | null
    weeksInState: number | null        // semanas consecutivas sobre/bajo la SMA200
    sma200Rising: boolean | null       // pendiente de la media en ~3 meses
    sma200:       number | null
    distPct:      number | null        // % del precio vs SMA200
  }
  // Momentum
  rsi14:        number | null
  divergence:   'bullish' | 'bearish' | null
  // Niveles con historia
  supportLevels:    LevelInfo[]        // hasta 2, más cercanos bajo el precio
  resistanceLevels: LevelInfo[]        // hasta 2, más cercanos sobre el precio
  // Contexto anual
  high52:       number
  low52:        number
  distHighPct:  number
  distLowPct:   number
  returns:      { m1: number | null; m6: number | null; y1: number | null }
  // Gráfico (~12 meses, downsampled)
  chart:        ChartPoint[]
  signals:      TechnicalSignal[]
  // Compatibilidad con consumidores simples
  sma20:        number | null
  sma50:        number | null
  sma200:       number | null
  supports:     number[]
  resistances:  number[]
}

// ── Indicadores base ──────────────────────────────────────────────────────────

export function smaLast(closes: number[], n: number): number | null {
  if (closes.length < n) return null
  let s = 0
  for (let i = closes.length - n; i < closes.length; i++) s += closes[i]
  return s / n
}

/** Serie completa de SMA(n), alineada con closes (null hasta tener n datos). */
export function smaSeries(closes: number[], n: number): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null)
  let sum = 0
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i]
    if (i >= n) sum -= closes[i - n]
    if (i >= n - 1) out[i] = sum / n
  }
  return out
}

/** RSI de Wilder — serie completa alineada con closes. */
export function rsiSeries(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null)
  if (closes.length < period + 1) return out
  let gain = 0, loss = 0
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1]
    if (d >= 0) gain += d; else loss -= d
  }
  let avgGain = gain / period
  let avgLoss = loss / period
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }
  return out
}

export function rsiWilder(closes: number[], period = 14): number | null {
  const s = rsiSeries(closes, period)
  return s[s.length - 1]
}

// ── Pivotes con índices (para niveles con historia y divergencias) ───────────

function pivotIndices(closes: number[], w = 5): { lows: number[]; highs: number[] } {
  const lows: number[] = []
  const highs: number[] = []
  for (let i = w; i < closes.length - w; i++) {
    let isLow = true, isHigh = true
    for (let j = i - w; j <= i + w; j++) {
      if (closes[j] < closes[i]) isLow = false
      if (closes[j] > closes[i]) isHigh = false
    }
    if (isLow) lows.push(i)
    if (isHigh) highs.push(i)
  }
  return { lows, highs }
}

/** Agrupa pivotes en niveles (<clusterPct% entre sí) conservando su historia. */
function clusterLevels(
  idxs: number[],
  closes: number[],
  dates: string[],
  lastIdx: number,
  clusterPct = 1.5,
): LevelInfo[] {
  const sorted = [...idxs].sort((a, b) => closes[a] - closes[b])
  const groups: number[][] = []
  for (const i of sorted) {
    const g = groups[groups.length - 1]
    if (g && (closes[i] - closes[g[g.length - 1]]) / closes[g[g.length - 1]] * 100 <= clusterPct) g.push(i)
    else groups.push([i])
  }
  return groups.map(g => {
    const price   = g.reduce((s, i) => s + closes[i], 0) / g.length
    const minIdx  = Math.min(...g)
    const maxIdx  = Math.max(...g)
    return {
      price,
      touches:     g.length,
      firstDate:   dates[minIdx],
      lastDate:    dates[maxIdx],
      weeksActive: Math.max(1, Math.round((lastIdx - minIdx) / 5)),
    }
  })
}

/** Cruce reciente entre SMAs (dorado/muerte) en los últimos `lookback` días. */
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

// ── Divergencia precio/RSI ────────────────────────────────────────────────────
// Alcista: el precio hace un mínimo MÁS BAJO pero el RSI uno MÁS ALTO (el
// impulso vendedor se debilita). Bajista: máximo más alto con RSI más bajo.
// Solo se reporta si el segundo pivote es reciente (últimos ~20 días).

function detectDivergence(
  closes: number[],
  rsi: (number | null)[],
  windowDays = 90,
): 'bullish' | 'bearish' | null {
  const start = Math.max(0, closes.length - windowDays)
  const seg   = closes.slice(start)
  const { lows, highs } = pivotIndices(seg, 4)
  const recentLimit = seg.length - 20

  const lowsAbs  = lows.map(i => i + start)
  const highsAbs = highs.map(i => i + start)

  if (lowsAbs.length >= 2) {
    const [i1, i2] = lowsAbs.slice(-2)
    const r1 = rsi[i1], r2 = rsi[i2]
    if (i2 - start >= recentLimit && r1 !== null && r2 !== null
      && closes[i2] < closes[i1] * 0.995 && r2 > r1 + 2) return 'bullish'
  }
  if (highsAbs.length >= 2) {
    const [i1, i2] = highsAbs.slice(-2)
    const r1 = rsi[i1], r2 = rsi[i2]
    if (i2 - start >= recentLimit && r1 !== null && r2 !== null
      && closes[i2] > closes[i1] * 1.005 && r2 < r1 - 2) return 'bearish'
  }
  return null
}

// ── Análisis completo ────────────────────────────────────────────────────────

export function analyze(candles: DailyCandles): TechnicalAnalysis {
  const { closes, dates } = candles
  const lastIdx = closes.length - 1
  const price = closes[lastIdx]
  const asOf  = dates[lastIdx]

  // 52 semanas ≈ 252 días hábiles
  const start252 = Math.max(0, closes.length - 252)
  const win252 = closes.slice(start252)
  const high52 = Math.max(...win252)
  const low52  = Math.min(...win252)
  const distHighPct = Math.round(((price - high52) / high52) * 1000) / 10
  const distLowPct  = Math.round(((price - low52) / low52) * 1000) / 10

  const sma20  = smaLast(closes, 20)
  const sma50  = smaLast(closes, 50)
  const sma200Full = smaSeries(closes, 200)
  const sma200 = sma200Full[lastIdx]
  const rsiAll = rsiSeries(closes, 14)
  const rsi14  = rsiAll[lastIdx]

  // ── Tendencia de fondo con persistencia ───────────────────────────────────
  let aboveSma200: boolean | null = null
  let weeksInState: number | null = null
  let sma200Rising: boolean | null = null
  let distPct: number | null = null
  if (sma200 !== null) {
    aboveSma200 = price >= sma200
    distPct = Math.round(((price - sma200) / sma200) * 1000) / 10
    // Días consecutivos en el estado actual
    let days = 0
    for (let i = lastIdx; i >= 0; i--) {
      const m = sma200Full[i]
      if (m === null) break
      if ((closes[i] >= m) !== aboveSma200) break
      days++
    }
    weeksInState = Math.max(1, Math.round(days / 5))
    // Pendiente de la media en ~3 meses (63 días hábiles)
    const before = sma200Full[lastIdx - 63]
    if (before !== null && before !== undefined) sma200Rising = sma200 > before
  }

  // ── Niveles con historia ──────────────────────────────────────────────────
  const { lows, highs } = pivotIndices(closes.slice(start252), 5)
  const lowLevels  = clusterLevels(lows.map(i => i + start252), closes, dates, lastIdx)
  const highLevels = clusterLevels(highs.map(i => i + start252), closes, dates, lastIdx)
  const supportLevels    = lowLevels.filter(l => l.price < price).sort((a, b) => b.price - a.price).slice(0, 2)
  const resistanceLevels = highLevels.filter(l => l.price > price).sort((a, b) => a.price - b.price).slice(0, 2)

  // ── Rendimiento en ventanas largas ────────────────────────────────────────
  const ret = (daysBack: number): number | null => {
    const i = lastIdx - daysBack
    if (i < 0) return null
    return Math.round(((price - closes[i]) / closes[i]) * 1000) / 10
  }
  const returns = { m1: ret(21), m6: ret(126), y1: ret(252) }

  // ── Divergencia ───────────────────────────────────────────────────────────
  const divergence = detectDivergence(closes, rsiAll)

  // ── Señales ───────────────────────────────────────────────────────────────
  const signals: TechnicalSignal[] = []
  const pctDiff = (a: number, b: number) => Math.abs((a - b) / b) * 100

  if (divergence === 'bullish') signals.push({
    kind: 'divergence_bullish', tone: 'mint', title: 'Divergencia alcista precio/RSI',
    detail: 'El precio marcó un mínimo más bajo pero el RSI uno más alto: el impulso vendedor se está debilitando. Es una de las señales de giro más seguidas — pero no garantiza rebote.',
  })
  if (divergence === 'bearish') signals.push({
    kind: 'divergence_bearish', tone: 'coral', title: 'Divergencia bajista precio/RSI',
    detail: 'El precio marcó un máximo más alto pero el RSI uno más bajo: la subida pierde fuerza por dentro. Suele anticipar pausas o retrocesos.',
  })

  if (rsi14 !== null) {
    if (rsi14 <= 30) signals.push({
      kind: 'rsi_oversold', tone: 'mint', title: `RSI ${Math.round(rsi14)} — zona de sobreventa`,
      detail: 'Bajo 30 suele leerse como caída sobre-extendida. Ojo: puede seguir bajando.',
    })
    else if (rsi14 >= 70) signals.push({
      kind: 'rsi_overbought', tone: 'gold', title: `RSI ${Math.round(rsi14)} — zona de sobrecompra`,
      detail: 'Sobre 70 suele leerse como subida sobre-extendida; aumenta la probabilidad de pausa o retroceso.',
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

  if (supportLevels.length > 0 && pctDiff(price, supportLevels[0].price) <= 3) {
    const l = supportLevels[0]
    signals.push({
      kind: 'near_support', tone: 'mint',
      title: `Probando soporte de ${l.weeksActive} semana${l.weeksActive !== 1 ? 's' : ''} en ${fmtLevel(l.price)}`,
      detail: `Nivel con ${l.touches} toque${l.touches !== 1 ? 's' : ''} desde ${fmtDateShort(l.firstDate)}. Si lo pierde con claridad, deja de ser soporte.`,
    })
  }
  if (resistanceLevels.length > 0 && pctDiff(price, resistanceLevels[0].price) <= 3) {
    const l = resistanceLevels[0]
    signals.push({
      kind: 'near_resistance', tone: 'gold',
      title: `Frente a resistencia de ${l.weeksActive} semana${l.weeksActive !== 1 ? 's' : ''} en ${fmtLevel(l.price)}`,
      detail: `Nivel con ${l.touches} toque${l.touches !== 1 ? 's' : ''} desde ${fmtDateShort(l.firstDate)}. Superarla con decisión suele leerse como fortaleza.`,
    })
  }

  if (distHighPct >= -2) signals.push({
    kind: 'near_52w_high', tone: 'gold', title: 'En zona de máximos de 52 semanas',
    detail: 'Está a menos de 2% de su máximo anual.',
  })
  if (distLowPct <= 5) signals.push({
    kind: 'near_52w_low', tone: 'coral', title: 'En zona de mínimos de 52 semanas',
    detail: 'Está a menos de 5% de su mínimo anual. Barato no siempre significa oportunidad.',
  })

  // ── Veredicto en 1-2 frases ───────────────────────────────────────────────
  let verdict: string
  if (aboveSma200 === null) {
    verdict = 'Historia insuficiente para evaluar la tendencia de fondo (se necesitan ~10 meses de datos).'
  } else if (aboveSma200 && sma200Rising !== false) {
    verdict = `Tendencia de fondo alcista: lleva ${weeksInState} semana${weeksInState !== 1 ? 's' : ''} sobre su media de 200 días${sma200Rising ? ', y la media viene subiendo' : ''}.`
  } else if (!aboveSma200 && sma200Rising === false) {
    verdict = `Tendencia de fondo bajista: lleva ${weeksInState} semana${weeksInState !== 1 ? 's' : ''} bajo su media de 200 días, y la media viene cayendo.`
  } else {
    verdict = `Tendencia en transición: ${aboveSma200 ? 'sobre' : 'bajo'} su media de 200 días hace ${weeksInState} semana${weeksInState !== 1 ? 's' : ''}, con la media ${sma200Rising ? 'subiendo' : 'aplanándose'}.`
  }
  if (divergence === 'bullish')      verdict += ' El RSI muestra divergencia alcista: la caída pierde fuerza.'
  else if (divergence === 'bearish') verdict += ' El RSI muestra divergencia bajista: la subida pierde fuerza.'
  else if (signals.some(s => s.kind === 'near_support'))    verdict += ' Está probando un soporte con historia.'
  else if (signals.some(s => s.kind === 'near_resistance')) verdict += ' Está frente a una resistencia con historia.'
  else verdict += ' Sin señales de giro relevantes esta semana.'

  // ── Gráfico 12 meses (downsampled a ~130 puntos) ─────────────────────────
  const chartStart = start252
  const chartLen   = closes.length - chartStart
  const step       = Math.max(1, Math.ceil(chartLen / 130))
  const chart: ChartPoint[] = []
  for (let i = chartStart; i < closes.length; i += step) {
    chart.push({ date: dates[i], close: closes[i], sma200: sma200Full[i] })
  }
  if (chart[chart.length - 1]?.date !== asOf) {
    chart.push({ date: asOf, close: price, sma200 })
  }

  return {
    price, asOf, verdict,
    trend: { aboveSma200, weeksInState, sma200Rising, sma200, distPct },
    rsi14, divergence,
    supportLevels, resistanceLevels,
    high52, low52, distHighPct, distLowPct, returns,
    chart, signals,
    sma20, sma50, sma200,
    supports:    supportLevels.map(l => l.price),
    resistances: resistanceLevels.map(l => l.price),
  }
}

function fmtLevel(v: number): string {
  return '$' + v.toLocaleString('es-CL', { maximumFractionDigits: v >= 100 ? 0 : 2 })
}

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
function fmtDateShort(dateStr: string): string {
  const [y, m] = dateStr.split('-').map(Number)
  return `${MONTHS_ES[m - 1]} ${String(y).slice(2)}`
}
