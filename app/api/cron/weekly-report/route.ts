import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { computeWeeklyItems } from '@/lib/weekly-report'
import { computeSpyBenchmark, type SpyBenchmarkResult } from '@/lib/benchmark'
import { fetchAllMacroSeries } from '@/lib/macro-fetch'
import { getNowChile } from '@/lib/utils'
import { readCandles } from '@/lib/price-providers'
import { analyze } from '@/lib/technical'
import { invokeEdgeFunction } from '@/lib/invoke-edge-function'

// ── Cron semanal: persiste el informe (S5) para TODOS los usuarios ───────────
// Programado en vercel.json, lunes por la mañana. Hasta ahora /inversiones?
// view=semanal solo se calculaba en vivo al abrir la página — este cron le da
// persistencia (historia navegable, futuro) y es la fuente que lee la Edge
// Function notify-weekly-report para mandar el correo (mismo patrón que
// sync-prices → daily_decisions → notify-watchlist-digest: el cálculo pesado
// vive en Node/Next vía lib/weekly-report.ts, la Edge Function de Supabase
// solo lee weekly_reports y arma el HTML, no recalcula nada).

export const maxDuration = 60

/** Lunes (YYYY-MM-DD) de la semana que contiene `dateStr`. */
function mondayOf(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDay()               // 0=Dom … 6=Sáb
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

interface DecisionRow {
  user_id:       string
  ticker:        string | null
  tier:          string | null
  score:         number
  suggested_usd: number | null
  verdict:       string
  reasons:       string[]
  decision_date: string
}

interface SignalRow {
  user_id:     string
  ticker:      string
  kind:        string
  message:     string
  price:       number
  signal_date: string
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  const auth   = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Supabase env faltante' }, { status: 503 })
  const supabase = createAdminClient(url, key)

  const { dateStr: todayCL } = getNowChile()
  const weekStart   = mondayOf(todayCL)
  const generatedAt = new Date().toISOString()

  // Contexto macro (S1): una sola vez, es el mismo para todos los usuarios —
  // null en cada serie si falta FRED_API_KEY, no rompe el resto del informe.
  const macro = await fetchAllMacroSeries(supabase)

  // Fuerza relativa vs SPY (ago 2026): mismo insumo que usa computeConviction()
  // en sync-prices — una sola vez para todos los usuarios, no por ticker.
  // Sin esto, el correo semanal no podía calcular convicción/zona de precio
  // por ticker (bug reportado por Cas: "Compra"/"Venta" sin el contexto que
  // sí tiene la app).
  let spyReturn6m: number | null = null
  try {
    const spyCandles = await readCandles(supabase, 'SPY')
    if (spyCandles.closes.length >= 30) spyReturn6m = analyze(spyCandles).returns.m6
  } catch { /* sin SPY, conviction pesa sin ese componente */ }

  const [{ data: wl }, { data: pos }] = await Promise.all([
    supabase.from('watchlist').select('user_id, ticker'),
    supabase.from('stock_positions').select('user_id, ticker'),
  ])
  const userIds = [...new Set([
    ...(wl ?? []).map(r => r.user_id as string),
    ...(pos ?? []).map(r => r.user_id as string),
  ])]
  if (userIds.length === 0) {
    return NextResponse.json({ users: 0, ok: 0, failed: 0, weekStart })
  }

  // "Hoy" para el bloque de decisión: la más reciente disponible por usuario,
  // no necesariamente la de la fecha exacta — si el cron corre antes de que
  // sync-prices actualice el día, es preferible mostrar la última conocida
  // que dejar el bloque vacío (a diferencia del panel en vivo de la app, que
  // sí exige coincidencia exacta con "hoy").
  const [{ data: decisionRows }, { data: signalRows }] = await Promise.all([
    supabase
      .from('daily_decisions')
      .select('user_id, ticker, tier, score, suggested_usd, verdict, reasons, decision_date')
      .in('user_id', userIds)
      .order('decision_date', { ascending: false }),
    supabase
      .from('daily_signals')
      .select('user_id, ticker, kind, message, price, signal_date')
      .in('user_id', userIds)
      .in('kind', ['sell', 'caution', 'target'])
      .order('signal_date', { ascending: false }),
  ])

  const latestDecisionByUser = new Map<string, DecisionRow>()
  for (const r of (decisionRows ?? []) as DecisionRow[]) {
    if (!latestDecisionByUser.has(r.user_id)) latestDecisionByUser.set(r.user_id, r)
  }
  const latestSignalDateByUser = new Map<string, string>()
  for (const r of (signalRows ?? []) as SignalRow[]) {
    if (!latestSignalDateByUser.has(r.user_id)) latestSignalDateByUser.set(r.user_id, r.signal_date)
  }
  const signalsByUser = new Map<string, SignalRow[]>()
  for (const r of (signalRows ?? []) as SignalRow[]) {
    if (latestSignalDateByUser.get(r.user_id) !== r.signal_date) continue
    const list = signalsByUser.get(r.user_id) ?? []
    list.push(r)
    signalsByUser.set(r.user_id, list)
  }

  let ok = 0, failed = 0
  for (const userId of userIds) {
    try {
      const [{ data: stocks }, { data: watchlistRows }, { data: sales }, { data: purchases }] = await Promise.all([
        supabase.from('stock_positions').select('ticker, shares').eq('user_id', userId),
        supabase.from('watchlist').select('ticker').eq('user_id', userId),
        supabase.from('stock_sales').select('sale_date, proceeds_usd').eq('user_id', userId),
        supabase.from('stock_purchases').select('purchase_date, total_paid_usd').eq('user_id', userId),
      ])

      const ownedTickers = new Set((stocks ?? []).map(s => s.ticker as string))
      const tickers = [...new Set([...ownedTickers, ...(watchlistRows ?? []).map(w => w.ticker as string)])]
      if (tickers.length === 0) continue   // sin watchlist ni posiciones: no hay informe que armar

      const { items, skipped } = await computeWeeklyItems(supabase, tickers, ownedTickers, spyReturn6m)

      // Benchmark vs SPY — mismo cálculo que app/(dashboard)/inversiones/page.tsx
      let spyBenchmark: SpyBenchmarkResult | null = null
      if ((purchases?.length ?? 0) > 0) {
        const positionTickers = [...new Set((stocks ?? []).map(s => s.ticker as string))]
        const [{ data: spyRows }, { data: latestRows }] = await Promise.all([
          supabase.from('price_history').select('date, close').eq('ticker', 'SPY').order('date', { ascending: true }),
          positionTickers.length > 0
            ? supabase.from('price_history').select('ticker, date, close').in('ticker', positionTickers).order('date', { ascending: false })
            : Promise.resolve({ data: [] as { ticker: string; date: string; close: number }[] }),
        ])
        const latestCloseByTicker = new Map<string, number>()
        for (const row of latestRows ?? []) {
          const t = row.ticker as string
          if (!latestCloseByTicker.has(t)) latestCloseByTicker.set(t, Number(row.close))
        }
        const cashFlows = [
          ...(purchases ?? []).map(p => ({ date: p.purchase_date as string, usd: Number(p.total_paid_usd) })),
          ...(sales ?? []).map(s => ({ date: s.sale_date as string, usd: -Number(s.proceeds_usd) })),
        ]
        spyBenchmark = computeSpyBenchmark(
          cashFlows,
          (spyRows ?? []).map(r => ({ date: r.date as string, close: Number(r.close) })),
          (stocks ?? []).map(s => ({ ticker: s.ticker as string, shares: Number(s.shares) })),
          latestCloseByTicker,
        )
      }

      const decision = latestDecisionByUser.get(userId) ?? null
      const payload = {
        items,
        skippedTickers: skipped,
        spyBenchmark,
        macro,
        todayDecision: decision ? {
          ticker: decision.ticker, tier: decision.tier, score: decision.score,
          suggested_usd: decision.suggested_usd, verdict: decision.verdict, reasons: decision.reasons,
        } : null,
        todaySignals: (signalsByUser.get(userId) ?? []).map(s => ({
          ticker: s.ticker, kind: s.kind, message: s.message, price: s.price,
        })),
        generatedAt,
      }

      const { error } = await supabase.from('weekly_reports').upsert(
        { user_id: userId, week_start: weekStart, payload, generated_at: generatedAt },
        { onConflict: 'user_id,week_start' },
      )
      if (error) {
        console.error(`[cron/weekly-report] upsert falló para ${userId}:`, error.message)
        failed++
      } else {
        ok++
      }
    } catch (err) {
      failed++
      console.error(`[cron/weekly-report] usuario ${userId} falló:`, err)
    }
  }

  // Recién con weekly_reports ya escrito para todos: la Edge Function solo LEE
  // esa tabla, así que llamarla antes mandaría el informe de la semana pasada.
  // Ver lib/invoke-edge-function.ts — esta llamada faltaba por completo y el
  // correo semanal nunca se envió, pese a que el informe se generaba bien.
  const reportEmail = ok > 0
    ? await invokeEdgeFunction(url, key, 'notify-weekly-report')
    : { ok: true, body: { skipped: 'ningún informe generado esta semana' } }

  return NextResponse.json({ users: userIds.length, ok, failed, weekStart, reportEmail })
}
