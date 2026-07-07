// ── Análisis técnico de largo plazo: matemática determinista sobre velas diarias ──
// Pensado para un inversionista que decide ~1 vez por semana, no para trading:
// tendencia de fondo con persistencia, niveles con historia (toques y vigencia),
// divergencias precio/RSI, momentum vía MACD, confirmación por volumen y
// rendimiento en ventanas largas.
// Ninguna señal es recomendación de inversión: es una regla automática y explícita
// sobre indicadores públicos, no un consejo personalizado.

export interface DailyCandles {
  closes:  number[]   // cierres diarios, oldest → newest
  dates:   string[]   // 'YYYY-MM-DD' por cada punto
  highs:   number[]   // máximos diarios (soporta resistencias más precisas)
  lows:    number[]   // mínimos diarios (soporta soportes más precisos)
  volumes: number[]   // volumen diario (confirma rupturas/cruces)
}

export type SignalTone = 'mint' | 'gold' | 'coral' | 'neutral'

export interface TechnicalSignal {
  kind:    string
  tone:    SignalTone
  title:   string
  detail:  string
  trigger: boolean  // true = evento reciente (cruce, divergencia, volumen…); false = estado
}

/** Nivel de soporte/resistencia con su historia. */
export interface LevelInfo {
  price:          number
  touches:        number   // cuántos pivotes formaron el nivel
  firstDate:      string   // primer toque
  lastDate:       string   // último toque
  weeksActive:    number   // semanas desde el primer toque hasta hoy
  weeksSinceLast: number   // semanas desde el ÚLTIMO toque (frescura del nivel)
  distPct:        number   // % desde el precio actual hasta el nivel (con signo)
}

export interface ChartPoint {
  date:   string
  close:  number
  sma200: number | null
}

/** Lectura técnica agregada — regla automática y explícita, NO asesoría financiera. */
export type RatingLabel = 'compra_fuerte' | 'compra' | 'neutral' | 'venta' | 'venta_fuerte'

export interface TechnicalRating {
  label: RatingLabel
  action: string          // etiqueta legible: "Compra fuerte", "Venta", etc.
  score:  number          // trendScore + triggerScore (~ -11 a +10)
  trendScore:   number    // estado de fondo: SMA200 (±1/±2) y castigo por mínimos anuales (−1)
  triggerScore: number    // eventos recientes: cruces, divergencia, RSI extremo, volumen, niveles
  pros:   number          // componentes puntuados a favor (incluye tendencia)
  cons:   number          // componentes puntuados en contra
  caution: boolean        // tendencia aún alcista pero presión bajista acumulada (toma de ganancias)
}

export interface TechnicalAnalysis {
  price:        number
  asOf:         string
  verdict:      string                 // conclusión en 1-2 frases, generada por código
  rating:       TechnicalRating
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
  macdCross:    'bullish' | 'bearish' | null
  volumeSignal: 'up' | 'down' | null
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

/** EMA(n) — serie completa, semillada con la SMA de los primeros n valores. */
export function emaSeries(closes: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null)
  if (closes.length < period) return out
  const k = 2 / (period + 1)
  let seed = 0
  for (let i = 0; i < period; i++) seed += closes[i]
  seed /= period
  out[period - 1] = seed
  for (let i = period; i < closes.length; i++) {
    out[i] = closes[i] * k + (out[i - 1] as number) * (1 - k)
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

// ── MACD (12,26,9) — momentum de mediano plazo sobre velas diarias ──────────
// Un cruce reciente (histograma cambia de signo) es una de las señales de
// compra/venta más estandarizadas; en velas diarias reacciona en ~2-4 semanas,
// coherente con una decisión semanal (no es señal de day-trading).

export interface MacdResult {
  macdLine:   (number | null)[]
  signalLine: (number | null)[]
  histogram:  (number | null)[]
}

export function macd(closes: number[], fast = 12, slow = 26, signal = 9): MacdResult {
  const emaFast = emaSeries(closes, fast)
  const emaSlow = emaSeries(closes, slow)
  const macdLine: (number | null)[] = closes.map((_, i) => {
    const f = emaFast[i], s = emaSlow[i]
    return f !== null && s !== null ? f - s : null
  })

  const firstValid = macdLine.findIndex(v => v !== null)
  const signalLine: (number | null)[] = new Array(closes.length).fill(null)
  if (firstValid !== -1 && closes.length - firstValid >= signal) {
    const macdValid = macdLine.slice(firstValid) as number[]
    const emaOfMacd = emaSeries(macdValid, signal)
    emaOfMacd.forEach((v, i) => { signalLine[firstValid + i] = v })
  }

  const histogram = macdLine.map((m, i) => {
    const s = signalLine[i]
    return m !== null && s !== null ? m - s : null
  })

  return { macdLine, signalLine, histogram }
}

/** Cruce reciente de MACD (histograma cambia de signo) en los últimos `lookback` días. */
function recentMacdCross(histogram: (number | null)[], lookback = 10): 'bullish' | 'bearish' | null {
  const last = histogram.length - 1
  for (let i = last; i > last - lookback && i > 0; i--) {
    const cur = histogram[i], prev = histogram[i - 1]
    if (cur === null || prev === null) continue
    if (prev <= 0 && cur > 0) return 'bullish'
    if (prev >= 0 && cur < 0) return 'bearish'
  }
  return null
}

// ── Volumen ────────────────────────────────────────────────────────────────
// Un movimiento de precio con volumen muy superior a su promedio reciente
// tiene más probabilidad de sostenerse (más participantes detrás del giro).
// Se revisan los últimos `scanDays` días hábiles (no solo el último): quien
// entra 1 vez a la semana no debería perderse el spike del martes.

function volumeSignal(
  volumes: number[],
  closes: number[],
  avgWindow = 20,
  scanDays = 5,
): 'up' | 'down' | null {
  const last = volumes.length - 1
  if (volumes.length < avgWindow + scanDays + 1 || closes.length !== volumes.length) return null
  // Del más reciente hacia atrás: reportar el spike más nuevo
  for (let i = last; i > last - scanDays; i--) {
    const window = volumes.slice(i - avgWindow, i)
    const avgVol = window.reduce((a, b) => a + b, 0) / avgWindow
    if (!avgVol || avgVol <= 0) continue
    const chgPct = ((closes[i] - closes[i - 1]) / closes[i - 1]) * 100
    if (volumes[i] >= avgVol * 1.8 && chgPct >= 2)  return 'up'
    if (volumes[i] >= avgVol * 1.8 && chgPct <= -2) return 'down'
  }
  return null
}

// ── Pivotes con índices (para niveles con historia y divergencias) ───────────
// Se aplica sobre la serie que corresponda: máximos diarios para resistencias,
// mínimos diarios para soportes, cierres para divergencias de RSI.

function pivotIndices(series: number[], w = 5): { lows: number[]; highs: number[] } {
  const lows: number[] = []
  const highs: number[] = []
  for (let i = w; i < series.length - w; i++) {
    let isLow = true, isHigh = true
    for (let j = i - w; j <= i + w; j++) {
      if (series[j] < series[i]) isLow = false
      if (series[j] > series[i]) isHigh = false
    }
    if (isLow) lows.push(i)
    if (isHigh) highs.push(i)
  }
  return { lows, highs }
}

/** Agrupa pivotes en niveles (<clusterPct% del promedio del grupo) conservando su historia.
 *  Comparar contra el promedio evita el "encadenado": pivotes separados 1.4% c/u
 *  que terminaban formando un nivel de 5%+ de ancho. */
function clusterLevels(
  idxs: number[],
  values: number[],
  dates: string[],
  lastIdx: number,
  currentPrice: number,
  clusterPct = 1.5,
): LevelInfo[] {
  const sorted = [...idxs].sort((a, b) => values[a] - values[b])
  const groups: { idxs: number[]; sum: number }[] = []
  for (const i of sorted) {
    const g = groups[groups.length - 1]
    const mean = g ? g.sum / g.idxs.length : null
    if (g && mean !== null && ((values[i] - mean) / mean) * 100 <= clusterPct) {
      g.idxs.push(i); g.sum += values[i]
    } else {
      groups.push({ idxs: [i], sum: values[i] })
    }
  }
  return groups.map(g => {
    const price   = g.sum / g.idxs.length
    const minIdx  = Math.min(...g.idxs)
    const maxIdx  = Math.max(...g.idxs)
    return {
      price,
      touches:        g.idxs.length,
      firstDate:      dates[minIdx],
      lastDate:       dates[maxIdx],
      weeksActive:    Math.max(1, Math.round((lastIdx - minIdx) / 5)),
      weeksSinceLast: Math.max(0, Math.round((lastIdx - maxIdx) / 5)),
      distPct:        Math.round(((price - currentPrice) / currentPrice) * 1000) / 10,
    }
  })
}

/** Cruce reciente entre SMAs (dorado/muerte) en los últimos `lookback` días.
 *  Recorre día a día (como recentMacdCross): comparar solo los extremos de la
 *  ventana perdía cruces de ida y vuelta o los reportaba al revés. */
function recentCross(closes: number[], fast: number, slow: number, lookback = 10): 'golden' | 'death' | null {
  if (closes.length < slow + lookback + 1) return null
  const smaAt = (endIdx: number, n: number): number => {
    let s = 0
    for (let i = endIdx - n + 1; i <= endIdx; i++) s += closes[i]
    return s / n
  }
  const last = closes.length - 1
  let result: 'golden' | 'death' | null = null
  let prevDiff = smaAt(last - lookback, fast) - smaAt(last - lookback, slow)
  for (let i = last - lookback + 1; i <= last; i++) {
    const diff = smaAt(i, fast) - smaAt(i, slow)
    if (prevDiff <= 0 && diff > 0) result = 'golden'   // se queda con el más reciente
    if (prevDiff >= 0 && diff < 0) result = 'death'
    prevDiff = diff
  }
  return result
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
  const { closes, dates, highs, lows, volumes } = candles
  const lastIdx = closes.length - 1
  const price = closes[lastIdx]
  const asOf  = dates[lastIdx]

  // 52 semanas ≈ 252 días hábiles — rango desde máximos/mínimos diarios reales,
  // no solo cierres (el low intradía de pánico también cuenta como piso anual)
  const start252 = Math.max(0, closes.length - 252)
  const high52 = Math.max(...highs.slice(start252))
  const low52  = Math.min(...lows.slice(start252))
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

  // ── Niveles con historia (soporte desde mínimos diarios, resistencia desde
  // máximos diarios — más preciso que usar solo el cierre) ──────────────────
  const lowSeries252  = lows.slice(start252)
  const highSeries252 = highs.slice(start252)
  const { lows: lowPivots }   = pivotIndices(lowSeries252, 5)
  const { highs: highPivots } = pivotIndices(highSeries252, 5)
  const lowLevels  = clusterLevels(lowPivots.map(i => i + start252),  lows,  dates, lastIdx, price)
  const highLevels = clusterLevels(highPivots.map(i => i + start252), highs, dates, lastIdx, price)
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

  // ── Momentum: MACD y volumen ───────────────────────────────────────────────
  const { histogram } = macd(closes)
  const macdCross    = recentMacdCross(histogram)
  const volSignal    = volumeSignal(volumes, closes)

  // ── Señales ───────────────────────────────────────────────────────────────
  const signals: TechnicalSignal[] = []
  const pctDiff = (a: number, b: number) => Math.abs((a - b) / b) * 100

  if (divergence === 'bullish') signals.push({
    kind: 'divergence_bullish', tone: 'mint', trigger: true, title: 'Divergencia alcista precio/RSI',
    detail: 'El precio marcó un mínimo más bajo pero el RSI uno más alto: el impulso vendedor se está debilitando. Es una de las señales de giro más seguidas — pero no garantiza rebote.',
  })
  if (divergence === 'bearish') signals.push({
    kind: 'divergence_bearish', tone: 'coral', trigger: true, title: 'Divergencia bajista precio/RSI',
    detail: 'El precio marcó un máximo más alto pero el RSI uno más bajo: la subida pierde fuerza por dentro. Suele anticipar pausas o retrocesos.',
  })

  if (rsi14 !== null) {
    if (rsi14 <= 30) signals.push({
      kind: 'rsi_oversold', tone: 'mint', trigger: true, title: `RSI ${Math.round(rsi14)} — zona de sobreventa`,
      detail: 'Bajo 30 suele leerse como caída sobre-extendida. Ojo: puede seguir bajando.',
    })
    else if (rsi14 >= 70) signals.push({
      kind: 'rsi_overbought', tone: 'gold', trigger: true, title: `RSI ${Math.round(rsi14)} — zona de sobrecompra`,
      detail: 'Sobre 70 suele leerse como subida sobre-extendida; aumenta la probabilidad de pausa o retroceso.',
    })
  }

  const cross = recentCross(closes, 50, 200)
  if (cross === 'golden') signals.push({
    kind: 'golden_cross', tone: 'mint', trigger: true, title: 'Cruce dorado reciente (SMA50 sobre SMA200)',
    detail: 'La media de 50 días superó a la de 200 hace poco — señal clásica de cambio de tendencia al alza.',
  })
  if (cross === 'death') signals.push({
    kind: 'death_cross', tone: 'coral', trigger: true, title: 'Cruce de la muerte reciente (SMA50 bajo SMA200)',
    detail: 'La media de 50 días cayó bajo la de 200 hace poco — señal clásica de cambio de tendencia a la baja.',
  })

  if (macdCross === 'bullish') signals.push({
    kind: 'macd_bullish', tone: 'mint', trigger: true, title: 'Cruce alcista de MACD',
    detail: 'La línea MACD cruzó sobre su señal en las últimas ~2 semanas: el momentum de mediano plazo gira al alza.',
  })
  if (macdCross === 'bearish') signals.push({
    kind: 'macd_bearish', tone: 'coral', trigger: true, title: 'Cruce bajista de MACD',
    detail: 'La línea MACD cruzó bajo su señal en las últimas ~2 semanas: el momentum de mediano plazo se debilita.',
  })

  if (volSignal === 'up') signals.push({
    kind: 'volume_up', tone: 'mint', trigger: true, title: 'Volumen inusual en una subida',
    detail: 'En los últimos días hábiles el volumen superó ampliamente su promedio de 20 días junto a una subida notable — más convicción detrás del movimiento.',
  })
  if (volSignal === 'down') signals.push({
    kind: 'volume_down', tone: 'coral', trigger: true, title: 'Volumen inusual en una caída',
    detail: 'En los últimos días hábiles el volumen superó ampliamente su promedio de 20 días junto a una caída notable — más convicción detrás del movimiento.',
  })

  if (supportLevels.length > 0 && pctDiff(price, supportLevels[0].price) <= 3) {
    const l = supportLevels[0]
    signals.push({
      kind: 'near_support', tone: 'mint', trigger: true,
      title: `Probando soporte de ${l.weeksActive} semana${l.weeksActive !== 1 ? 's' : ''} en ${fmtLevel(l.price)}`,
      detail: `Nivel con ${l.touches} toque${l.touches !== 1 ? 's' : ''} desde ${fmtDateShort(l.firstDate)}. Si lo pierde con claridad, deja de ser soporte.`,
    })
  }
  if (resistanceLevels.length > 0 && pctDiff(price, resistanceLevels[0].price) <= 3) {
    const l = resistanceLevels[0]
    signals.push({
      kind: 'near_resistance', tone: 'gold', trigger: true,
      title: `Frente a resistencia de ${l.weeksActive} semana${l.weeksActive !== 1 ? 's' : ''} en ${fmtLevel(l.price)}`,
      detail: `Nivel con ${l.touches} toque${l.touches !== 1 ? 's' : ''} desde ${fmtDateShort(l.firstDate)}. Superarla con decisión suele leerse como fortaleza.`,
    })
  }

  if (distHighPct >= -2) signals.push({
    kind: 'near_52w_high', tone: 'gold', trigger: false, title: 'En zona de máximos de 52 semanas',
    detail: 'Está a menos de 2% de su máximo anual.',
  })
  if (distLowPct <= 5) signals.push({
    kind: 'near_52w_low', tone: 'coral', trigger: false, title: 'En zona de mínimos de 52 semanas',
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
  else if (macdCross === 'bullish')  verdict += ' El MACD cruzó al alza: mejora el momentum de mediano plazo.'
  else if (macdCross === 'bearish')  verdict += ' El MACD cruzó a la baja: se debilita el momentum de mediano plazo.'
  else if (signals.some(s => s.kind === 'near_support'))    verdict += ' Está probando un soporte con historia.'
  else if (signals.some(s => s.kind === 'near_resistance')) verdict += ' Está frente a una resistencia con historia.'
  else verdict += ' Sin señales de giro relevantes esta semana.'

  // ── Lectura técnica agregada (regla automática y explícita, no asesoría) ──
  // Dos sumas separadas:
  //   trendScore   = ESTADO de fondo (SMA200, mínimos anuales) — contexto persistente
  //   triggerScore = EVENTOS recientes (cruces, divergencia, RSI, volumen, niveles)
  // Compra/venta exigen al menos un gatillo alineado: estar en tendencia alcista
  // por sí solo ya NO produce "Compra" permanente semana tras semana.
  const components: number[] = []
  const addComp = (pts: number) => { components.push(pts); return pts }

  let trendScore = 0
  if (aboveSma200 === true)  trendScore += addComp(sma200Rising === true  ? 2 : 1)
  if (aboveSma200 === false) trendScore += addComp(sma200Rising === false ? -2 : -1)
  if (distLowPct <= 5)       trendScore += addComp(-1)   // "cuchillo cayendo": mínimos anuales restan

  let triggerScore = 0
  if (divergence === 'bullish') triggerScore += addComp(2)
  if (divergence === 'bearish') triggerScore += addComp(-2)
  if (cross === 'golden') triggerScore += addComp(2)
  if (cross === 'death')  triggerScore += addComp(-2)
  if (macdCross === 'bullish') triggerScore += addComp(1)
  if (macdCross === 'bearish') triggerScore += addComp(-1)
  if (volSignal === 'up')   triggerScore += addComp(1)
  if (volSignal === 'down') triggerScore += addComp(-1)
  if (rsi14 !== null && rsi14 <= 30) triggerScore += addComp(1)
  if (rsi14 !== null && rsi14 >= 70) triggerScore += addComp(-1)
  if (signals.some(s => s.kind === 'near_support'))    triggerScore += addComp(1)
  if (signals.some(s => s.kind === 'near_resistance')) triggerScore += addComp(-1)

  const score = trendScore + triggerScore
  // pros/cons cuentan los MISMOS componentes que forman el score (incluida la
  // tendencia): antes el banner podía decir "Compra · 0 a favor · 0 en contra".
  const pros = components.filter(p => p > 0).length
  const cons = components.filter(p => p < 0).length

  let label: RatingLabel
  if (score >= 5 && triggerScore >= 2)        label = 'compra_fuerte'
  else if (score >= 2 && triggerScore >= 1)   label = 'compra'
  else if (score <= -5 && triggerScore <= -2) label = 'venta_fuerte'
  else if (score <= -2 && triggerScore <= -1) label = 'venta'
  else                                        label = 'neutral'

  // Presión bajista con tendencia aún alcista: no alcanza para "Venta" (el
  // estado la compensa), pero para quien TIENE la acción es el aviso útil de
  // considerar toma de ganancias — llega antes de perder la SMA200.
  const caution = aboveSma200 === true && triggerScore <= -3

  const actionText: Record<RatingLabel, string> = {
    compra_fuerte: 'Compra fuerte',
    compra:        'Compra',
    neutral:       'Neutral — esperar',
    venta:         'Venta',
    venta_fuerte:  'Venta fuerte',
  }

  const rating: TechnicalRating = { score, trendScore, triggerScore, pros, cons, caution, label, action: actionText[label] }

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
    price, asOf, verdict, rating,
    trend: { aboveSma200, weeksInState, sma200Rising, sma200, distPct },
    rsi14, divergence, macdCross, volumeSignal: volSignal,
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
