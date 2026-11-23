import { analyze, type DailyCandles, type TechnicalAnalysis } from './technical'
import { computeConviction, computeMarketRegime, isActionableBuyNow } from './conviction'

// ── Investigación de señales a nivel universo (nov 2026) ──────────────────────
// lib/signal-backtest.ts mide UN ticker en ~1 año: 3-8 eventos, hit rate
// "subió a 20 ruedas" sin comparar contra nada. Eso no distingue una señal
// buena de un mercado alcista. Este módulo responde otra pregunta:
//
//   "Cuando aparece la condición X (en cualquier acción del universo),
//    ¿cuánto rinde después, POR ENCIMA de SPY, y es estable en el tiempo?"
//
// Reglas de honestidad estadística (ver docs/PLAN_MOTOR_PREDICCION.md):
//  1. Retorno EXCEDENTE vs SPY, no retorno bruto: en un mercado que sube,
//     "subió" acierta ~60% aunque la señal sea al azar.
//  2. Sin mirar el futuro: analyze() recibe solo velas hasta ese día, con la
//     misma ventana que producción (430 ruedas).
//  3. Agrupado por FECHA antes de promediar: 10 acciones de semis con la misma
//     señal el mismo día son ~1 apuesta, no 10.
//  4. N efectivo corregido por solapamiento: con muestreo semanal y horizonte
//     de 20 ruedas, cada observación comparte 3/4 de su retorno con la vecina.
//  5. Estabilidad: el efecto se mide por separado en la primera y la segunda
//     mitad del período — un efecto que cambia de signo no es un efecto.
//
// Es investigación offline (scripts/signal-research.ts): NO corre en el cron
// ni en la app. Sus resultados informan cambios de reglas en lib/technical.ts
// y lib/conviction.ts — nunca los aplica solo.

/** Ventana de velas que ve analyze() en producción (LOOKBACK_D en price-providers). */
export const PROD_WINDOW = 430

export interface ResearchSample {
  ticker:   string
  date:     string
  flags:    Record<string, boolean>
  values:   Record<string, number | null>
  ex20:     number | null   // retorno 20 ruedas del ticker − de SPY, en %
  ex60:     number | null
}

/** Momentum 12-1: retorno de t−252 a t−21 (excluye el último mes, donde las
 *  acciones tienden a revertir). Factor con más respaldo académico que
 *  cualquier oscilador (Jegadeesh-Titman; Lim, Wang & Yao 2018). */
export function momentum12_1(closes: number[], i: number): number | null {
  if (i - 252 < 0) return null
  const a = closes[i - 252], b = closes[i - 21]
  if (!(a > 0) || !(b > 0)) return null
  return Math.round(((b - a) / a) * 1000) / 10
}

/** Condiciones booleanas medibles sobre un análisis — una por componente del
 *  rating y por estado relevante, con el mismo nombre que su `kind`/campo. */
export function extractFlags(a: TechnicalAnalysis): Record<string, boolean> {
  const has = (k: string) => a.signals.some(s => s.kind === k)
  const rsi = a.rsi14
  return {
    trend_up:          a.trend.aboveSma200 === true && a.trend.sma200Rising === true,
    trend_down:        a.trend.aboveSma200 === false && a.trend.sma200Rising === false,
    divergence_bull:   a.divergence === 'bullish',
    divergence_bear:   a.divergence === 'bearish',
    golden_cross:      has('golden_cross'),
    death_cross:       has('death_cross'),
    macd_bull:         a.macdCross === 'bullish',
    macd_bear:         a.macdCross === 'bearish',
    volume_up:         a.volumeSignal === 'up',
    volume_down:       a.volumeSignal === 'down',
    rsi_oversold:      rsi !== null && rsi <= 30,
    rsi_overbought:    rsi !== null && rsi >= 70,
    near_support:      has('near_support'),
    near_resistance:   has('near_resistance'),
    near_52w_high:     has('near_52w_high'),
    near_52w_low:      has('near_52w_low'),
    overextended:      has('overextended'),
    overextended_ext:  has('overextended_extreme'),
    zone_conveniente:  a.priceZone === 'conveniente',
    zone_justo:        a.priceZone === 'justo',
    zone_caro:         a.priceZone === 'caro',
    rating_buy:        a.rating.label === 'compra' || a.rating.label === 'compra_fuerte',
    rating_strong_buy: a.rating.label === 'compra_fuerte',
    rating_sell:       a.rating.label === 'venta' || a.rating.label === 'venta_fuerte',
    buy_now:           a.buy.some(t => t.now),
    hot_zone_sell_now: a.trend.aboveSma200 === true && a.sell.some(t => t.now),
  }
}

export interface TickerSeries {
  ticker:  string
  candles: DailyCandles
}

const sliceCandles = (c: DailyCandles, from: number, to: number): DailyCandles => ({
  closes:  c.closes.slice(from, to),
  dates:   c.dates.slice(from, to),
  highs:   c.highs.slice(from, to),
  lows:    c.lows.slice(from, to),
  volumes: c.volumes.slice(from, to),
})

/**
 * Genera las muestras: cada `step` ruedas (5 = semanal, la cadencia real de
 * Cas), para cada ticker con al menos 260 ruedas de historia previa. SPY se
 * analiza en las mismas fechas para el régimen y la fuerza relativa — igual
 * que hace el cron.
 */
export function buildSamples(
  universe: TickerSeries[],
  spy: DailyCandles,
  opts: { step?: number; minHistory?: number } = {},
): ResearchSample[] {
  const step = opts.step ?? 5
  const minHistory = opts.minHistory ?? 260
  const spyIdx = new Map(spy.dates.map((d, i) => [d, i]))
  const spyCache = new Map<string, TechnicalAnalysis>()
  const spyAt = (date: string): TechnicalAnalysis | null => {
    const i = spyIdx.get(date)
    if (i === undefined || i < minHistory) return null
    let a = spyCache.get(date)
    if (!a) { a = analyze(sliceCandles(spy, Math.max(0, i + 1 - PROD_WINDOW), i + 1)); spyCache.set(date, a) }
    return a
  }
  const spyFwd = (date: string, h: number): number | null => {
    const i = spyIdx.get(date)
    if (i === undefined || i + h >= spy.closes.length) return null
    return (spy.closes[i + h] / spy.closes[i] - 1) * 100
  }

  const out: ResearchSample[] = []
  for (const { ticker, candles } of universe) {
    const n = candles.closes.length
    for (let i = minHistory; i < n; i += step) {
      const date = candles.dates[i]
      const spyA = spyAt(date)
      if (!spyA) continue
      const a = analyze(sliceCandles(candles, Math.max(0, i + 1 - PROD_WINDOW), i + 1))
      const conviction = computeConviction(a, null, spyA.returns.m6)
      const regime = computeMarketRegime(spyA.trend)
      const fwd = (h: number): number | null => {
        if (i + h >= n) return null
        const s = spyFwd(date, h)
        if (s === null) return null
        return Math.round(((candles.closes[i + h] / candles.closes[i] - 1) * 100 - s) * 100) / 100
      }
      const flags = extractFlags(a)
      flags.actionable_buy = isActionableBuyNow(a, conviction, regime)
      flags.regime_bear = regime === 'bajista'
      out.push({
        ticker, date, flags,
        values: {
          mom12_1:    momentum12_1(candles.closes, i),
          distHigh:   a.distHighPct,
          distSma200: a.trend.distPct,
          conviction: conviction.score,
          rsi:        a.rsi14,
          atrPct:     a.atrPct,
        },
        ex20: fwd(20),
        ex60: fwd(60),
      })
    }
  }
  return out
}

// ── Agregación ───────────────────────────────────────────────────────────────

export interface ConditionStat {
  name:        string
  n:           number        // muestras (ticker-semana)
  dates:       number        // fechas distintas con al menos una muestra
  mean:        number | null // media de las medias por fecha, % excedente vs SPY
  lift:        number | null // mean − media del universo completo (la "línea base")
  t:           number | null // t-stat con N efectivo corregido por solapamiento
  firstHalf:   number | null
  secondHalf:  number | null
  stable:      boolean       // mismo signo de lift en ambas mitades
}

type Horizon = 'ex20' | 'ex60'
const HORIZON_DAYS: Record<Horizon, number> = { ex20: 20, ex60: 60 }

/** Promedio por fecha (clustering) → serie temporal de medias. */
function dateMeans(samples: ResearchSample[], h: Horizon): { date: string; mean: number }[] {
  const byDate = new Map<string, number[]>()
  for (const s of samples) {
    const v = s[h]
    if (v === null) continue
    const arr = byDate.get(s.date) ?? []
    arr.push(v)
    byDate.set(s.date, arr)
  }
  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, vs]) => ({ date, mean: vs.reduce((x, y) => x + y, 0) / vs.length }))
}

const avg = (xs: number[]): number | null => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
const r2 = (v: number | null): number | null => v === null ? null : Math.round(v * 100) / 100

export function conditionStat(
  name: string,
  all: ResearchSample[],
  pred: (s: ResearchSample) => boolean,
  h: Horizon = 'ex20',
  step = 5,
  splitDate?: string,
): ConditionStat {
  const base = avg(dateMeans(all, h).map(d => d.mean))
  const sel = all.filter(s => pred(s) && s[h] !== null)
  const dm = dateMeans(sel, h)
  const mean = avg(dm.map(d => d.mean))
  // N efectivo: fechas × (step / horizonte), con piso 1. Conservador a propósito.
  const nEff = Math.max(1, dm.length * Math.min(1, step / HORIZON_DAYS[h]))
  let t: number | null = null
  if (mean !== null && dm.length >= 3 && base !== null) {
    const sd = Math.sqrt(dm.reduce((s, d) => s + (d.mean - mean) ** 2, 0) / (dm.length - 1))
    t = sd > 0 ? (mean - base) / (sd / Math.sqrt(nEff)) : null
  }
  const split = splitDate ?? (dateMeans(all, h)[Math.floor(dateMeans(all, h).length / 2)]?.date ?? '')
  const half = (first: boolean) => {
    const allHalf = dateMeans(all.filter(s => first ? s.date < split : s.date >= split), h)
    const selHalf = dm.filter(d => first ? d.date < split : d.date >= split)
    const b = avg(allHalf.map(d => d.mean)), m = avg(selHalf.map(d => d.mean))
    return m !== null && b !== null ? m - b : null
  }
  const fh = half(true), sh = half(false)
  return {
    name, n: sel.length, dates: dm.length,
    mean: r2(mean), lift: r2(mean !== null && base !== null ? mean - base : null),
    t: t === null ? null : Math.round(t * 100) / 100,
    firstHalf: r2(fh), secondHalf: r2(sh),
    stable: fh !== null && sh !== null && Math.sign(fh) === Math.sign(sh) && fh !== 0,
  }
}

export interface QuintileRow { q: number; n: number; mean: number | null }

/** Quintiles transversales por fecha de una variable continua: en cada fecha
 *  se ordenan las acciones por `key` y se reparten en 5 grupos. Q5 − Q1 es la
 *  forma estándar de medir un factor (no depende del nivel del mercado). */
export function quintiles(samples: ResearchSample[], key: string, h: Horizon = 'ex20'): { rows: QuintileRow[]; spread: number | null } {
  const byDate = new Map<string, ResearchSample[]>()
  for (const s of samples) {
    if (s.values[key] === null || s.values[key] === undefined || s[h] === null) continue
    const arr = byDate.get(s.date) ?? []
    arr.push(s)
    byDate.set(s.date, arr)
  }
  const buckets: number[][] = [[], [], [], [], []]
  for (const arr of byDate.values()) {
    if (arr.length < 5) continue
    const sorted = [...arr].sort((a, b) => (a.values[key] as number) - (b.values[key] as number))
    const qMeans: number[][] = [[], [], [], [], []]
    sorted.forEach((s, i) => qMeans[Math.min(4, Math.floor((i / sorted.length) * 5))].push(s[h] as number))
    qMeans.forEach((vs, q) => { const m = avg(vs); if (m !== null) buckets[q].push(m) })
  }
  const rows = buckets.map((b, q) => ({ q: q + 1, n: b.length, mean: r2(avg(b)) }))
  const spread = rows[4].mean !== null && rows[0].mean !== null ? r2(rows[4].mean - rows[0].mean) : null
  return { rows, spread }
}
