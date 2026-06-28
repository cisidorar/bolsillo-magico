import { NextResponse } from 'next/server'
import { getServerSession, createClient } from '@/lib/supabase/server'

// ── Config ─────────────────────────────────────────────────────────────────────

const TICKER_RE   = /^[A-Z0-9.\-]{1,12}$/
const HISTORY_TTL = 6 * 60 * 60   // 6 h — datos históricos no cambian a cada rato
const FH_TIMEOUT  = 8_000

// ── Types ──────────────────────────────────────────────────────────────────────

export interface TickerHistory {
  closes: number[]   // cierre de cada mes (oldest → newest)
  dates:  string[]   // 'YYYY-MM' por cada punto
}

interface StoredHistory {
  closes: number[]
  dates:  string[]
}

// ── Fetch helper ───────────────────────────────────────────────────────────────

async function fhFetch(url: string): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(url, {
      cache:  'no-store',
      signal: AbortSignal.timeout(FH_TIMEOUT),
    })
    if (!r.ok) { console.error('[stock-history] fhFetch status', r.status, url); return null }
    return await r.json() as Record<string, unknown>
  } catch (err) {
    console.error('[stock-history] fhFetch error', err)
    return null
  }
}

// ── Finnhub monthly candles ────────────────────────────────────────────────────

async function fhMonthlyCandles(
  ticker: string,
  key:    string,
  months: number,
): Promise<StoredHistory | null> {
  const to   = Math.floor(Date.now() / 1000)
  const from = to - (months + 2) * 31 * 86_400   // un poco más para cubrir meses completos

  // 1. Intentar resolución mensual
  let d = await fhFetch(
    `https://finnhub.io/api/v1/stock/candle?symbol=${ticker}&resolution=M&from=${from}&to=${to}&token=${key}`,
  )

  const isOk = (r: Record<string, unknown> | null): boolean =>
    r !== null && r.s === 'ok' && Array.isArray(r.c) && (r.c as number[]).length > 0

  // 2. Fallback: semanal (sampleamos al último cierre de cada mes)
  if (!isOk(d)) {
    console.warn(`[stock-history] ${ticker} mensual no disponible (s=${d?.s}), probando semanal`)
    d = await fhFetch(
      `https://finnhub.io/api/v1/stock/candle?symbol=${ticker}&resolution=W&from=${from}&to=${to}&token=${key}`,
    )
  }

  if (!isOk(d)) {
    console.warn(`[stock-history] ${ticker} sin datos (s=${d?.s})`)
    return null
  }

  const timestamps = d!.t as number[]
  const closes     = d!.c as number[]

  // Agrupar por 'YYYY-MM', conservar el último cierre del mes
  const monthMap = new Map<string, number>()
  for (let i = 0; i < timestamps.length; i++) {
    const dt  = new Date(timestamps[i] * 1000)
    const key = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`
    monthMap.set(key, closes[i])   // sobreescribir → last-in-month gana
  }

  // Ordenar y tomar los últimos N meses
  const sorted = Array.from(monthMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  const recent = sorted.slice(-months)

  if (recent.length < 2) return null

  return {
    closes: recent.map(([, v]) => v),
    dates:  recent.map(([k])  => k),
  }
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

  const apiKey = process.env.FINNHUB_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'FINNHUB_API_KEY no configurada' }, { status: 503 })

  try {
    const supabase = await createClient()
    const now      = Date.now()

    // ── Cache lookup ────────────────────────────────────────────────────────
    const cacheKeys = symbols.map(s => `${s}_HIST_${months}`)
    const { data: cached } = await supabase
      .from('price_cache')
      .select('ticker, history7d, fetched_at')
      .in('ticker', cacheKeys)

    const cacheMap: Record<string, { history7d: unknown; fetched_at: string }> = Object.fromEntries(
      (cached ?? []).map(r => [r.ticker as string, r]),
    )

    const result: Record<string, TickerHistory> = {}
    const stale:  string[] = []

    for (const ticker of symbols) {
      const ckey = `${ticker}_HIST_${months}`
      const c    = cacheMap[ckey]
      const age  = c ? (now - new Date(c.fetched_at).getTime()) / 1000 : Infinity

      if (c && age < HISTORY_TTL) {
        const stored = c.history7d as StoredHistory | null
        if (stored?.closes && stored?.dates && stored.closes.length >= 2) {
          result[ticker] = stored
          continue
        }
      }
      stale.push(ticker)
    }

    // ── Fetch stale tickers secuencialmente para no saturar la API ──────────
    // (60 req/min en free tier — con pocos tickers esto es seguro)
    for (const ticker of stale) {
      const data = await fhMonthlyCandles(ticker, apiKey, months)
      if (!data) continue

      result[ticker] = data

      // Fire-and-forget cache write
      supabase.from('price_cache').upsert(
        {
          ticker:     `${ticker}_HIST_${months}`,
          price:      data.closes[data.closes.length - 1] ?? 0,
          change_pct: 0,
          name:       `${ticker} historical ${months}m`,
          history7d:  data as unknown as number[],
          fetched_at: new Date(now).toISOString(),
        },
        { onConflict: 'ticker' },
      ).then(({ error }) => {
        if (error) console.error('[stock-history] cache write error:', ticker, error.message)
      })
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
