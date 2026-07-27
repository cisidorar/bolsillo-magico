import Link from 'next/link'
import { TrendingUp, TrendingDown, Minus, Newspaper, Calendar, Activity, Globe } from 'lucide-react'
import InversionesToggle from './InversionesToggle'
import ServiceLogo from './ServiceLogo'
import TodayQueue, { type TodayDecision, type TodaySignal } from './TodayQueue'
import type { SpyBenchmarkResult } from '@/lib/benchmark'
import type { TechnicalSignal, RatingLabel } from '@/lib/technical'
import type { FibRetracement } from '@/lib/fibonacci'
import type { VolumeProfile } from '@/lib/volume-profile'
import type { LabelStat } from '@/lib/signal-backtest'
import { businessDaysUntil } from '@/lib/earnings'
import type { MacroSeriesData, MacroSeriesId } from '@/lib/macro-fetch'
import { computeYieldCurve } from '@/lib/yield-curve'
import { computeYoyChange, type Observation } from '@/lib/yoy-change'

// ── Informe semanal (S5 v0 del plan docs/PLAN_INFORME_SEMANAL.md) ────────────
// Junta en un solo lugar lo que el motor técnico YA calcula por ticker
// (señales activas, niveles, backtest) más dos indicadores nuevos
// (Fibonacci, volumen por precio) y el calendario de resultados — el mismo
// formato de un análisis semanal de mercado, pero 100% determinista: la IA
// no participa acá, cada número sale de una función pura y testeada.
// v0: se calcula en vivo al abrir la vista (no hay cron ni snapshot semanal
// persistido todavía) — mismo patrón que el resto de /inversiones.

export interface WeeklyTickerData {
  ticker:               string
  owned:                boolean
  price:                number
  asOf:                 string
  ratingLabel:          RatingLabel
  ratingAction:         string
  verdict:              string
  weekSignals:          TechnicalSignal[]   // señales con trigger:true (eventos recientes)
  fib:                  FibRetracement | null
  volProfile:           VolumeProfile | null
  nextEarningsDate:     string | null
  backtestStats:        LabelStat[] | null
}

function fmtUSD(n: number): string {
  return 'US$' + n.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}

const RATING_COLOR: Record<RatingLabel, string> = {
  compra_fuerte: 'var(--mint)',
  compra:        'var(--mint)',
  neutral:       'var(--ink-3)',
  venta:         'var(--coral)',
  venta_fuerte:  'var(--coral)',
}

function latestObs(series: MacroSeriesData | null | undefined): Observation | null {
  if (!series || series.observations.length === 0) return null
  return series.observations[series.observations.length - 1]
}

/** Delta contra la observación de ~7 días antes de la más reciente. Es un
 *  detalle visual (variación semanal del petróleo), no una decisión financiera
 *  — por eso vive acá y no en lib/ con test propio, a diferencia de
 *  computeYieldCurve/computeYoyChange que sí son la lógica central. */
function weekAgoDelta(series: MacroSeriesData | null | undefined): number | null {
  const latest = latestObs(series)
  if (!latest || !series) return null
  const d = new Date(latest.date + 'T12:00:00')
  d.setDate(d.getDate() - 7)
  const target = d.toISOString().slice(0, 10)
  let prev: Observation | null = null
  for (const o of series.observations) {
    if (o.date > target) break
    prev = o
  }
  if (!prev || prev.date === latest.date) return null
  return latest.value - prev.value
}

export default function WeeklyReport({
  items,
  spyBenchmark,
  todayDecision,
  todaySignals,
  generatedAt,
  skippedTickers,
  macro,
}: {
  items:          WeeklyTickerData[]
  spyBenchmark:   SpyBenchmarkResult | null
  todayDecision:  TodayDecision | null
  todaySignals:   TodaySignal[]
  generatedAt:    string
  /** Tickers en watchlist/posiciones sin historia suficiente todavía (recién agregados) */
  skippedTickers: string[]
  /** Contexto macro (FRED) — null o series en null si no hay FRED_API_KEY configurada;
   *  la sección simplemente no se muestra en ese caso. */
  macro: Partial<Record<MacroSeriesId, MacroSeriesData | null>> | null
}) {
  const genLabel = new Date(generatedAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

  const dffLatest   = latestObs(macro?.DFF)
  const dgs10Latest = latestObs(macro?.DGS10)
  const dgs2Latest  = latestObs(macro?.DGS2)
  const oilLatest   = latestObs(macro?.DCOILWTICO)
  const oilDelta    = weekAgoDelta(macro?.DCOILWTICO)
  const cpiSeries   = macro?.CPIAUCSL ?? null
  const cpiYoy      = cpiSeries ? computeYoyChange(cpiSeries.observations, cpiSeries.observations[cpiSeries.observations.length - 1]?.date ?? '') : null
  const yieldCurve  = (dgs10Latest && dgs2Latest) ? computeYieldCurve(dgs10Latest.value, dgs2Latest.value) : null
  const hasMacro    = !!(dffLatest || yieldCurve || oilLatest || cpiYoy)

  return (
    <div>
      <div className="mb-4">
        <InversionesToggle active="semanal" />
      </div>

      <div className="flex items-center gap-2 mb-4">
        <Newspaper className="w-4 h-4" style={{ color: 'var(--primary)' }} />
        <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Informe semanal</p>
        <span className="text-[11px]" style={{ color: 'var(--ink-3)' }}>generado {genLabel}</span>
      </div>

      {/* ── Tu semana: benchmark vs SPY ────────────────────────────────────── */}
      {spyBenchmark && (
        <div className="card p-4 lg:p-5 mb-4">
          <p className="text-xs font-bold mb-2" style={{ color: 'var(--ink-3)' }}>Tu semana vs. el mercado</p>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: spyBenchmark.diffUsd >= 0 ? 'rgba(31,190,141,0.15)' : 'rgba(255,111,97,0.15)' }}>
              {spyBenchmark.diffUsd >= 0
                ? <TrendingUp className="w-5 h-5" style={{ color: 'var(--mint)' }} />
                : <TrendingDown className="w-5 h-5" style={{ color: 'var(--coral)' }} />}
            </div>
            <div className="min-w-0">
              <p className="text-base font-extrabold tabular-nums" style={{ color: spyBenchmark.diffUsd >= 0 ? 'var(--mint)' : 'var(--coral)' }}>
                {spyBenchmark.diffUsd >= 0 ? '+' : ''}{fmtUSD(spyBenchmark.diffUsd)}
                {spyBenchmark.diffPct !== null && <span className="text-xs font-semibold ml-1">({spyBenchmark.diffPct >= 0 ? '+' : ''}{spyBenchmark.diffPct.toFixed(1)}%)</span>}
              </p>
              <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
                vs. haber puesto la misma plata, en las mismas fechas, en SPY — al cierre del {fmtDate(spyBenchmark.asOfDate)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Contexto de mercado: tasas, curva, petróleo, inflación (FRED) ───── */}
      {hasMacro && (
        <div className="card p-4 lg:p-5 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Globe className="w-3.5 h-3.5" style={{ color: 'var(--ink-3)' }} />
            <p className="text-xs font-bold" style={{ color: 'var(--ink-3)' }}>Contexto de mercado</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {dffLatest && (
              <div>
                <p className="text-[10px] font-semibold" style={{ color: 'var(--ink-3)' }}>Tasa Fed</p>
                <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{dffLatest.value.toFixed(2)}%</p>
              </div>
            )}
            {yieldCurve && (
              <div>
                <p className="text-[10px] font-semibold" style={{ color: 'var(--ink-3)' }}>Curva 10Y–2Y</p>
                <p className="text-sm font-bold tabular-nums" style={{ color: yieldCurve.inverted ? 'var(--coral)' : 'var(--ink)' }}>
                  {yieldCurve.spread >= 0 ? '+' : ''}{yieldCurve.spread.toFixed(2)}pp
                  {yieldCurve.inverted && <span className="block text-[9px] font-semibold">invertida</span>}
                </p>
              </div>
            )}
            {oilLatest && (
              <div>
                <p className="text-[10px] font-semibold" style={{ color: 'var(--ink-3)' }}>Petróleo WTI</p>
                <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                  US${oilLatest.value.toFixed(2)}
                  {oilDelta !== null && (
                    <span className="block text-[9px] font-semibold" style={{ color: oilDelta >= 0 ? 'var(--mint)' : 'var(--coral)' }}>
                      {oilDelta >= 0 ? '+' : ''}{oilDelta.toFixed(2)}/sem
                    </span>
                  )}
                </p>
              </div>
            )}
            {cpiYoy && (
              <div>
                <p className="text-[10px] font-semibold" style={{ color: 'var(--ink-3)' }}>Inflación EEUU (YoY)</p>
                <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{cpiYoy.pctChange >= 0 ? '+' : ''}{cpiYoy.pctChange.toFixed(1)}%</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Decisión de hoy (reusa el mismo panel de Acciones) ──────────────── */}
      <TodayQueue decision={todayDecision} signals={todaySignals} />

      {/* ── Por ticker: señales de la semana, niveles, calendario ──────────── */}
      {items.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-sm font-medium" style={{ color: 'var(--ink-3)' }}>
            Todavía no hay suficiente historia de precios para armar el informe. Vuelve a entrar a Acciones para sincronizar tus tickers.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => {
            const daysToEarnings = businessDaysUntil(item.nextEarningsDate)
            const bestStat = item.backtestStats?.reduce((best, s) =>
              (s.count > (best?.count ?? 0) && s.hitRate20 !== null) ? s : best, null as LabelStat | null) ?? null

            return (
              <div key={item.ticker} className="card p-4 lg:p-5">
                <div className="flex items-start gap-3 mb-3">
                  <ServiceLogo domain={null} name={item.ticker} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{item.ticker}</p>
                      {item.owned && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>EN CARTERA</span>
                      )}
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: RATING_COLOR[item.ratingLabel], background: 'var(--surface-2)' }}>
                        {item.ratingAction}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed mt-1" style={{ color: 'var(--ink-2)' }}>{item.verdict}</p>
                  </div>
                  <p className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--ink)' }}>{fmtUSD(item.price)}</p>
                </div>

                {/* Señales activas esta semana */}
                {item.weekSignals.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {item.weekSignals.map((s, i) => (
                      <span key={i} className="text-[10px] font-semibold px-2 py-1 rounded-lg flex items-center gap-1"
                        style={{
                          color:      s.tone === 'mint' ? 'var(--mint)' : s.tone === 'coral' ? 'var(--coral)' : s.tone === 'gold' ? 'var(--gold)' : 'var(--ink-3)',
                          background: s.tone === 'mint' ? 'rgba(31,190,141,0.12)' : s.tone === 'coral' ? 'rgba(255,111,97,0.12)' : s.tone === 'gold' ? 'rgba(255,194,60,0.12)' : 'var(--surface-2)',
                        }}>
                        <Activity className="w-2.5 h-2.5" /> {s.title}
                      </span>
                    ))}
                  </div>
                )}

                {/* Niveles: Fibonacci + POC de volumen — escenarios, no predicciones */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                  {item.fib && (
                    <div className="rounded-xl p-2.5" style={{ background: 'var(--surface-2)' }}>
                      <p className="text-[10px] font-bold mb-1" style={{ color: 'var(--ink-3)' }}>
                        {item.fib.direction === 'retracement_down' ? 'Si corrige, próxima zona' : 'Si rebota, próxima zona'}
                      </p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                        {item.fib.levels.filter(l => l.ratio === 0.382 || l.ratio === 0.5 || l.ratio === 0.618).map(l => (
                          <span key={l.ratio} className="text-xs tabular-nums" style={{ color: 'var(--ink-2)' }}>
                            {(l.ratio * 100).toFixed(1)}% <span className="font-bold">{fmtUSD(l.price)}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {item.volProfile && (
                    <div className="rounded-xl p-2.5" style={{ background: 'var(--surface-2)' }}>
                      <p className="text-[10px] font-bold mb-1" style={{ color: 'var(--ink-3)' }}>Zona de mayor volumen (POC)</p>
                      <p className="text-xs tabular-nums" style={{ color: 'var(--ink-2)' }}>
                        <span className="font-bold">{fmtUSD(item.volProfile.poc)}</span>
                        {' · '}rango {fmtUSD(item.volProfile.rangeLow)}–{fmtUSD(item.volProfile.rangeHigh)}
                      </p>
                    </div>
                  )}
                </div>

                {/* Calendario + fiabilidad histórica */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]" style={{ color: 'var(--ink-3)' }}>
                  {item.nextEarningsDate && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Resultados {fmtDate(item.nextEarningsDate)}
                      {daysToEarnings !== null && daysToEarnings <= 5 && (
                        <span className="font-bold" style={{ color: 'var(--gold)' }}> · en {daysToEarnings}d hábiles</span>
                      )}
                    </span>
                  )}
                  {bestStat && bestStat.hitRate20 !== null && (
                    <span>
                      Esta señal acertó {Math.round(bestStat.hitRate20 * 100)}% de las veces a 20 ruedas ({bestStat.count} casos históricos)
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {skippedTickers.length > 0 && (
        <p className="text-[11px] mt-3 flex items-center gap-1" style={{ color: 'var(--ink-3)' }}>
          <Minus className="w-3 h-3" /> Sin historia suficiente todavía: {skippedTickers.join(', ')}
        </p>
      )}

      <p className="text-[11px] mt-4" style={{ color: 'var(--ink-3)' }}>
        Análisis técnico automático, no es asesoría de inversión. Los niveles de Fibonacci y volumen son escenarios calculados, no predicciones. <Link href="/inversiones" className="font-semibold" style={{ color: 'var(--primary)' }}>Ver detalle de cada ticker →</Link>
      </p>
    </div>
  )
}
