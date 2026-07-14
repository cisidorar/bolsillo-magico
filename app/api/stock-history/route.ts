import { NextResponse } from 'next/server'
import { getServerSession, createClient } from '@/lib/supabase/server'

// ── Config ─────────────────────────────────────────────────────────────────────
// Finnhub bloqueó el acceso gratuito a /stock/candle (histórico OHLCV) — ahora
// es solo para planes pagos. Este endpoint se reescribió para leer de
// price_history (nuestra propia tabla, poblada a diario por /api/cron/sync-prices
// vía Tiingo/AlphaVantage/Yahoo/Stooq) en vez de depender de Finnhub para esto.

const TICKER_RE = /^[A-Z0-9.\-]{1,12}$/

// ── Types ──────────────────────────────────────────────────────────────────────

export interface TickerHistory {
  closes: number[]   // cierre de cada mes (oldest → newest)
  dates:  string[]   // 'YYYY-MM' por cada punto
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
}

// ── Handler ────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const user = await getServerSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const raw    = searchParams.get('symbols') ?? ''
  const months = Math.min(Math.max(parseInt(searchParams.get('months') ?? '12'), 3), 24)

  const symbols = raw
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(s => TICKER_RE.test(s))
    .slice(0, 10)

  if (!symbols.length) return NextResponse.json({ error: 'No valid symbols' }, { status: 400 })

  try {
    const supabase = await createClient()
    const fromDate = isoDaysAgo((months + 2) * 31)   // un poco más para cubrir meses completos

    const { data, error } = await supabase
      .from('price_history')
      .select('ticker, date, close')
      .in('ticker', symbols)
      .gte('date', fromDate)
      .order('date', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const result: Record<string, TickerHistory> = {}

    for (const ticker of symbols) {
      // Agrupar por 'YYYY-MM', conservar el último cierre del mes (filas ya
      // vienen ordenadas ascendente, así que el último write de cada mes gana)
      const monthMap = new Map<string, number>()
      for (const row of data ?? []) {
        if (row.ticker !== ticker) continue
        monthMap.set((row.date as string).slice(0, 7), Number(row.close))
      }
      const sorted = Array.from(monthMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))
      const recent = sorted.slice(-months)
      if (recent.length < 2) continue
      result[ticker] = {
        closes: recent.map(([, v]) => v),
        dates:  recent.map(([k]) => k),
      }
    }

    if (Object.keys(result).length === 0) {
      return NextResponse.json({ error: 'No historical data available' }, { status: 502 })
    }

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, max-age=21600' },
    })
  } catch (err) {
    console.error('[stock-history] unhandled error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
