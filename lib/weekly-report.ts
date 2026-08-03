import type { SupabaseClient } from '@supabase/supabase-js'
import { readCandles } from '@/lib/price-providers'
import { analyze, type RatingLabel, type TechnicalSignal, type PriceZone } from '@/lib/technical'
import { computeFibonacci, type FibRetracement } from '@/lib/fibonacci'
import { computeVolumeProfile, type VolumeProfile } from '@/lib/volume-profile'
import { fetchEarnings } from '@/lib/earnings-fetch'
import { computeConviction, type ConvictionTier } from '@/lib/conviction'
import type { LabelStat } from '@/lib/signal-backtest'

// ── Cálculo por ticker del informe semanal (S5) ──────────────────────────────
// Extraído de app/(dashboard)/inversiones/page.tsx para poder reusarse tanto
// desde la vista en vivo (un usuario, on-demand) como desde el cron semanal
// (todos los usuarios, S5 persistencia — app/api/cron/weekly-report) sin
// duplicar la lógica. analyze()/Fibonacci/volumen viven en Node/Next (no en
// la Edge Function que manda el correo) por el mismo motivo que sync-prices:
// UNA sola fuente de verdad del cálculo técnico.

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
  // ago 2026 (bug reportado por Cas): el correo mostraba "Compra"/"Venta" con
  // el mismo peso para cualquier ticker con gatillo técnico, sin el número de
  // convicción ni la zona de precio que ya ve en la app — mismo problema que
  // se arregló en notify-watchlist-digest (daily_signals.conviction_score),
  // ahora también acá.
  convictionScore:      number
  convictionTier:       ConvictionTier
  priceZone:            PriceZone | null
}

/** Candles + analyze + Fibonacci + volumen por precio + earnings + backtest,
 *  para cada ticker en `tickers`. Tickers sin ≥30 velas se omiten (se
 *  devuelven en `skipped`) — recién agregados, sin historia suficiente
 *  todavía para opinar. */
export async function computeWeeklyItems(
  supabase: SupabaseClient,
  tickers: string[],
  ownedTickers: Set<string>,
  /** Retorno 6m de SPY — mismo insumo que usa computeConviction() en el resto
   *  de la app (cron diario, panel "¿Qué comprar hoy?"). Se calcula UNA vez
   *  por corrida del cron semanal (no por ticker) y se pasa acá. */
  spyReturn6m: number | null = null,
): Promise<{ items: WeeklyTickerData[]; skipped: string[] }> {
  const results = await Promise.all(tickers.map(async (ticker): Promise<WeeklyTickerData | null> => {
    const candles = await readCandles(supabase, ticker)
    if (candles.closes.length < 30) return null

    const analysis  = analyze(candles)
    const fib        = computeFibonacci(candles.highs, candles.lows, candles.dates)
    const volProfile = computeVolumeProfile(candles.closes, candles.volumes)
    const earnings   = await fetchEarnings(supabase, ticker)

    const { data: statsRows } = await supabase
      .from('signal_stats')
      .select('label, count, hit_rate_20, avg_return_20, avg_return_60')
      .eq('ticker', ticker)
    const backtestStats: LabelStat[] | null = statsRows && statsRows.length > 0
      ? statsRows.map(r => ({
          label:       r.label as LabelStat['label'],
          count:       r.count as number,
          hitRate20:   r.hit_rate_20   !== null ? Number(r.hit_rate_20)   : null,
          avgReturn20: r.avg_return_20 !== null ? Number(r.avg_return_20) : null,
          avgReturn60: r.avg_return_60 !== null ? Number(r.avg_return_60) : null,
        }))
      : null

    const conviction = computeConviction(analysis, backtestStats, spyReturn6m)

    return {
      ticker,
      owned:            ownedTickers.has(ticker),
      price:            analysis.price,
      asOf:             analysis.asOf,
      ratingLabel:      analysis.rating.label,
      ratingAction:     analysis.rating.action,
      verdict:          analysis.verdict,
      weekSignals:      analysis.signals.filter(s => s.trigger),
      fib,
      volProfile,
      nextEarningsDate: earnings.nextDate,
      backtestStats,
      convictionScore:  conviction.score,
      convictionTier:   conviction.tier,
      priceZone:        analysis.priceZone,
    }
  }))

  const items   = results.filter((r): r is WeeklyTickerData => r !== null)
  const skipped = tickers.filter(t => !items.some(w => w.ticker === t))
  return { items, skipped }
}
