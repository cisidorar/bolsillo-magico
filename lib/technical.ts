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

// Copy en lenguaje cotidiano (title/detail) generado por código — decisión jul 2026:
// el conjunto de señales es finito, así que NO se usa IA para redactar; plantillas
// deterministas cubren el 100% de los casos sin costo, latencia ni alucinaciones.
// El término técnico va en `tech` como etiqueta secundaria (se aprende de paso).
export interface TechnicalSignal {
  kind:    string
  tone:    SignalTone
  title:   string   // lenguaje simple, sin jerga
  detail:  string   // qué significa + su limitación, en cotidiano
  tech:    string   // nombre técnico del indicador (etiqueta chica en la UI)
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
  // Radar: cosas CERCA de pasar — aviso anticipado para tener al ojo, aún no señal.
  // No puntúan en el rating; son la antesala de las señales de arriba.
  watch:        TechnicalSignal[]
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
 *  que terminaban formando un nivel de 5%+ de ancho.
 *
 *  `touches` son ACERCAMIENTOS REALES: días en que el precio quedó a ±1% del
 *  nivel, agrupando visitas contiguas (gap ≤5 días) como un solo toque. Contar
 *  solo los pivotes del cluster subestimaba (todo salía "1 toque"): el precio
 *  puede rozar un nivel varias veces sin dejar pivote nuevo. */
function clusterLevels(
  idxs: number[],
  values: number[],
  dates: string[],
  lastIdx: number,
  currentPrice: number,
  scanFrom: number,
  clusterPct = 1.5,
  touchPct = 1.0,
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
    const price = g.sum / g.idxs.length
    // Toques reales en toda la ventana
    let touches = 0
    let firstHit = -1, lastHit = -1
    let prevHit = -Infinity
    for (let i = Math.max(0, scanFrom); i <= lastIdx; i++) {
      if (Math.abs(values[i] - price) / price * 100 <= touchPct) {
        if (i - prevHit > 5) touches++
        prevHit = i
        if (firstHit === -1) firstHit = i
        lastHit = i
      }
    }
    if (touches === 0) {  // fallback teórico: al menos los pivotes del cluster
      touches  = g.idxs.length
      firstHit = Math.min(...g.idxs)
      lastHit  = Math.max(...g.idxs)
    }
    return {
      price,
      touches,
      firstDate:      dates[firstHit],
      lastDate:       dates[lastHit],
      weeksActive:    Math.max(1, Math.round((lastIdx - firstHit) / 5)),
      weeksSinceLast: Math.max(0, Math.round((lastIdx - lastHit) / 5)),
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
  const lowLevels  = clusterLevels(lowPivots.map(i => i + start252),  lows,  dates, lastIdx, price, start252)
  const highLevels = clusterLevels(highPivots.map(i => i + start252), highs, dates, lastIdx, price, start252)
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
    kind: 'divergence_bullish', tone: 'mint', trigger: true,
    title: 'La caída está perdiendo fuerza',
    detail: 'El precio marcó un nuevo mínimo, pero con menos impulso vendedor que la vez anterior — como una pelota que rebota cada vez con menos ganas de caer. Muchas veces anticipa un rebote, aunque no lo garantiza.',
    tech: 'Divergencia alcista precio/RSI',
  })
  if (divergence === 'bearish') signals.push({
    kind: 'divergence_bearish', tone: 'coral', trigger: true,
    title: 'La subida está perdiendo fuerza',
    detail: 'El precio marcó un nuevo máximo, pero con menos impulso comprador que la vez anterior: la subida se está quedando sin combustible. Suele anticipar una pausa o un retroceso.',
    tech: 'Divergencia bajista precio/RSI',
  })

  if (rsi14 !== null) {
    if (rsi14 <= 30) signals.push({
      kind: 'rsi_oversold', tone: 'mint', trigger: true,
      title: 'Cayó muy rápido en poco tiempo',
      detail: 'El termómetro de impulso está muy abajo: la caída se ve sobre-exagerada y a veces rebota desde aquí. Ojo: también puede seguir cayendo.',
      tech: `RSI ${Math.round(rsi14)} (sobreventa, bajo 30)`,
    })
    else if (rsi14 >= 70) signals.push({
      kind: 'rsi_overbought', tone: 'gold', trigger: true,
      title: 'Subió muy rápido en poco tiempo',
      detail: 'El termómetro de impulso está muy arriba: la subida se ve sobre-exagerada y aumenta la probabilidad de una pausa o un retroceso.',
      tech: `RSI ${Math.round(rsi14)} (sobrecompra, sobre 70)`,
    })
  }

  const cross = recentCross(closes, 50, 200)
  if (cross === 'golden') signals.push({
    kind: 'golden_cross', tone: 'mint', trigger: true,
    title: 'La tendencia está girando al alza',
    detail: 'El promedio de precio de los últimos meses acaba de superar al promedio de largo plazo — una de las señales clásicas de que el viento cambió a favor.',
    tech: 'Cruce dorado (SMA50 sobre SMA200)',
  })
  if (cross === 'death') signals.push({
    kind: 'death_cross', tone: 'coral', trigger: true,
    title: 'La tendencia está girando a la baja',
    detail: 'El promedio de precio de los últimos meses acaba de caer bajo el promedio de largo plazo — una de las señales clásicas de que el viento cambió en contra.',
    tech: 'Cruce de la muerte (SMA50 bajo SMA200)',
  })

  if (macdCross === 'bullish') signals.push({
    kind: 'macd_bullish', tone: 'mint', trigger: true,
    title: 'El impulso de mediano plazo mejora',
    detail: 'En las últimas ~2 semanas el movimiento del precio giró al alza según un indicador que compara sus promedios recientes. No es tendencia confirmada todavía, pero es el primer paso.',
    tech: 'Cruce alcista de MACD',
  })
  if (macdCross === 'bearish') signals.push({
    kind: 'macd_bearish', tone: 'coral', trigger: true,
    title: 'El impulso de mediano plazo se debilita',
    detail: 'En las últimas ~2 semanas el movimiento del precio giró a la baja según un indicador que compara sus promedios recientes. Puede ser solo una pausa — o el inicio de un retroceso.',
    tech: 'Cruce bajista de MACD',
  })

  if (volSignal === 'up') signals.push({
    kind: 'volume_up', tone: 'mint', trigger: true,
    title: 'Subida con muchos más compradores de lo normal',
    detail: 'En los últimos días se movió bastante más dinero que de costumbre junto a una subida fuerte. Cuando hay tanta gente detrás, el movimiento tiende a sostenerse más.',
    tech: 'Volumen ≥1.8× su promedio de 20 días',
  })
  if (volSignal === 'down') signals.push({
    kind: 'volume_down', tone: 'coral', trigger: true,
    title: 'Caída con muchos más vendedores de lo normal',
    detail: 'En los últimos días se movió bastante más dinero que de costumbre junto a una caída fuerte. Cuando hay tanta gente detrás, el movimiento tiende a sostenerse más.',
    tech: 'Volumen ≥1.8× su promedio de 20 días',
  })

  // Señales de nivel solo con ≥2 toques: un nivel de 1 toque es demasiado débil
  // para anunciar "está tocando un piso que la frenó antes" (frenó UNA vez).
  if (supportLevels.length > 0 && supportLevels[0].touches >= 2 && pctDiff(price, supportLevels[0].price) <= 3) {
    const l = supportLevels[0]
    signals.push({
      kind: 'near_support', tone: 'mint', trigger: true,
      title: `Está tocando un piso que ya la frenó ${l.touches} ${l.touches !== 1 ? 'veces' : 'vez'}`,
      detail: `Cerca de ${fmtLevel(l.price)} el precio dejó de caer ${l.touches} ${l.touches !== 1 ? 'veces' : 'vez'} desde ${fmtDateShort(l.firstDate)}: muchos suelen comprar ahí. Pero si esta vez lo atraviesa hacia abajo, ese piso deja de servir.`,
      tech: `Soporte en ${fmtLevel(l.price)}`,
    })
  }
  if (resistanceLevels.length > 0 && resistanceLevels[0].touches >= 2 && pctDiff(price, resistanceLevels[0].price) <= 3) {
    const l = resistanceLevels[0]
    signals.push({
      kind: 'near_resistance', tone: 'gold', trigger: true,
      title: `Está frente a un techo que ya la frenó ${l.touches} ${l.touches !== 1 ? 'veces' : 'vez'}`,
      detail: `Cerca de ${fmtLevel(l.price)} el precio dejó de subir ${l.touches} ${l.touches !== 1 ? 'veces' : 'vez'} desde ${fmtDateShort(l.firstDate)}: muchos suelen vender ahí. Si lo supera con decisión, suele leerse como señal de fuerza.`,
      tech: `Resistencia en ${fmtLevel(l.price)}`,
    })
  }

  if (distHighPct >= -2) signals.push({
    kind: 'near_52w_high', tone: 'gold', trigger: false,
    title: 'Está en su punto más alto del año',
    detail: 'A menos de 2% de su precio máximo de los últimos 12 meses. No es malo en sí — pero conviene saber que compras cerca del techo reciente.',
    tech: 'Máximo de 52 semanas',
  })
  // Sobre-extensión: el espejo del "cuchillo cayendo". Muy por encima de su
  // promedio largo, comprar es pagar el estirón; lo común es que descanse o
  // vuelva hacia el promedio antes de seguir.
  if (distPct !== null && distPct >= 15) signals.push({
    kind: 'overextended', tone: 'gold', trigger: false,
    title: 'Está muy estirada por encima de su promedio',
    detail: `Va ${distPct}% por encima de su promedio de largo plazo. Después de estirones así es común que el precio descanse o retroceda hacia el promedio — para comprar, muchos prefieren esperar ese retroceso.`,
    tech: `Precio +${distPct}% sobre la SMA200`,
  })
  if (distLowPct <= 5) signals.push({
    kind: 'near_52w_low', tone: 'coral', trigger: false,
    title: 'Está en su punto más bajo del año',
    detail: 'A menos de 5% de su precio mínimo de los últimos 12 meses. Que esté "barata" no siempre significa oportunidad: a veces sigue cayendo.',
    tech: 'Mínimo de 52 semanas',
  })

  // ── Radar: cerca de pasar (aviso anticipado, pensado para quien compra) ────
  // La antesala de las señales: nada de esto puntúa en el rating, pero le dice
  // al usuario semanal qué acciones conviene tener al ojo los próximos días.
  const watch: TechnicalSignal[] = []

  // Acercándose a un piso confiable (3-8% por encima; ≤3% ya es señal)
  const supStrong = supportLevels.find(l => l.touches >= 2)
  if (supStrong && !signals.some(s => s.kind === 'near_support')) {
    const d = Math.abs(supStrong.distPct)
    if (d > 3 && d <= 8) watch.push({
      kind: 'watch_support', tone: 'mint', trigger: false,
      title: `Se acerca a un piso que la frenó ${supStrong.touches} veces (${fmtLevel(supStrong.price)})`,
      detail: `Está a ${d}% de ese piso. Si sigue bajando hasta ahí, es la zona donde otros suelen comprar — y quienes compran por partes la usan como referencia para escalonar la entrada.`,
      tech: `Soporte en ${fmtLevel(supStrong.price)}, a ${supStrong.distPct}%`,
    })
  }

  // Cerca de intentar romper un techo, con tendencia a favor (3-6% por debajo)
  const resStrong = resistanceLevels.find(l => l.touches >= 2)
  if (resStrong && aboveSma200 === true && !signals.some(s => s.kind === 'near_resistance')) {
    const d = resStrong.distPct
    if (d > 3 && d <= 6) watch.push({
      kind: 'watch_breakout', tone: 'mint', trigger: false,
      title: `Cerca de intentar romper un techo (${fmtLevel(resStrong.price)})`,
      detail: `Está a +${d}% de un techo que la frenó ${resStrong.touches} veces, con la tendencia larga a favor. Si lo supera con decisión, muchos lo leen como confirmación para comprar.`,
      tech: `Resistencia en ${fmtLevel(resStrong.price)}, a +${d}%`,
    })
  }

  // Impulso enfriándose hacia la zona de rebote (RSI 30-40, aún sin señal)
  if (rsi14 !== null && rsi14 > 30 && rsi14 <= 40) watch.push({
    kind: 'watch_rsi_low', tone: 'mint', trigger: false,
    title: 'Se está enfriando — cerca de la zona de rebote',
    detail: 'El termómetro de impulso viene bajando y se acerca al nivel donde las caídas suelen verse exageradas. Todavía no llega: si sigue cayendo unos días más, vale la pena mirarla de cerca.',
    tech: `RSI ${Math.round(rsi14)} (zona de rebote: bajo 30)`,
  })
  // Impulso calentándose hacia sobrecompra (RSI 62-70) — útil para quien tiene la acción
  if (rsi14 !== null && rsi14 >= 62 && rsi14 < 70) watch.push({
    kind: 'watch_rsi_high', tone: 'gold', trigger: false,
    title: 'Se está calentando — cerca de la zona de pausa',
    detail: 'El termómetro de impulso viene subiendo y se acerca al nivel donde las subidas suelen tomarse un respiro. No es señal todavía, pero conviene no perseguir el precio aquí.',
    tech: `RSI ${Math.round(rsi14)} (sobrecompra: sobre 70)`,
  })

  // MACD por cruzar: histograma acercándose a cero con racha de 3+ días
  if (macdCross === null && histogram.length >= 4) {
    const [h4, h3, h2, h1] = histogram.slice(-4)
    if (h1 !== null && h2 !== null && h3 !== null && h4 !== null) {
      if (h1 < 0 && h1 > h2 && h2 > h3 && h3 > h4) watch.push({
        kind: 'watch_macd_up', tone: 'mint', trigger: false,
        title: 'El impulso se está dando vuelta al alza',
        detail: 'Lleva varios días seguidos recuperando fuerza, aunque todavía no confirma el giro. Si la mejora continúa, en los próximos días podría aparecer la señal de cruce.',
        tech: 'Histograma MACD subiendo hacia cero',
      })
      if (h1 > 0 && h1 < h2 && h2 < h3 && h3 < h4) watch.push({
        kind: 'watch_macd_down', tone: 'gold', trigger: false,
        title: 'El impulso se está desinflando',
        detail: 'Lleva varios días seguidos perdiendo fuerza, aunque todavía no confirma el giro a la baja. Atenta si tienes la acción: puede ser la antesala de un retroceso.',
        tech: 'Histograma MACD cayendo hacia cero',
      })
    }
  }

  // Cruce dorado por formarse: SMA50 bajo la SMA200 pero subiendo y a <1.5%
  if (cross === null && sma50 !== null && sma200 !== null && sma50 < sma200) {
    const gapPct = ((sma200 - sma50) / sma200) * 100
    const sma50Prev = smaLast(closes.slice(0, closes.length - 10), 50)
    if (gapPct <= 1.5 && sma50Prev !== null && sma50 > sma50Prev) watch.push({
      kind: 'watch_golden', tone: 'mint', trigger: false,
      title: 'A punto de confirmar un giro de tendencia al alza',
      detail: 'Su promedio de los últimos meses viene subiendo y está a punto de superar al de largo plazo — la señal clásica de cambio de tendencia podría confirmarse en las próximas semanas.',
      tech: `SMA50 a ${Math.round(gapPct * 10) / 10}% de cruzar la SMA200`,
    })
  }

  // ── Veredicto en 1-2 frases, en lenguaje cotidiano ────────────────────────
  const wks = `${weeksInState} semana${weeksInState !== 1 ? 's' : ''}`
  let verdict: string
  if (aboveSma200 === null) {
    verdict = 'Todavía no hay historia suficiente para evaluar hacia dónde va en el largo plazo (se necesitan ~10 meses de datos).'
  } else if (aboveSma200 && sma200Rising !== false) {
    verdict = `Viene subiendo de forma sostenida: lleva ${wks} por encima de su promedio de largo plazo${sma200Rising ? ', y ese promedio también apunta hacia arriba' : ''}.`
  } else if (!aboveSma200 && sma200Rising === false) {
    verdict = `Viene cayendo de forma sostenida: lleva ${wks} por debajo de su promedio de largo plazo, que también apunta hacia abajo.`
  } else {
    verdict = `Está en zona de cambio: hace ${wks} que va ${aboveSma200 ? 'por encima' : 'por debajo'} de su promedio de largo plazo, y ese promedio ${sma200Rising ? 'empieza a subir' : 'se está aplanando'}.`
  }
  if (divergence === 'bullish')      verdict += ' Además, la caída muestra señales de agotamiento — a veces anticipa un rebote.'
  else if (divergence === 'bearish') verdict += ' Además, la subida muestra señales de agotamiento — puede venir una pausa.'
  else if (macdCross === 'bullish')  verdict += ' El impulso de las últimas semanas giró al alza.'
  else if (macdCross === 'bearish')  verdict += ' El impulso de las últimas semanas se está debilitando.'
  else if (signals.some(s => s.kind === 'near_support'))    verdict += ' Ahora mismo está tocando un piso que antes la frenó.'
  else if (signals.some(s => s.kind === 'near_resistance')) verdict += ' Ahora mismo está frente a un techo que antes la frenó.'
  else verdict += ' Esta semana no pasó nada fuera de lo normal.'

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
  if (distPct !== null && distPct >= 15) trendScore += addComp(-1)   // sobre-extendida: comprar el estirón resta

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
    chart, signals, watch,
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
