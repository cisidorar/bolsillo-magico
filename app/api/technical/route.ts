import { NextResponse } from 'next/server'
import { getServerSession, createClient } from '@/lib/supabase/server'
import { analyze, type DailyCandles, type TechnicalAnalysis } from '@/lib/technical'

// ── Config ─────────────────────────────────────────────────────────────────────

const TICKER_RE  = /^[A-Z0-9.\-]{1,12}$/
const DAILY_TTL  = 12 * 60 * 60   // 12 h — con velas diarias basta refrescar 2 veces al día
const FH_TIMEOUT = 8_000
const LOOKBACK_D = 430            // ~14 meses de calendario → ≥252 días hábiles + SMA200

export interface TechnicalResponse {
  ticker:   string
  analysis: TechnicalAnalysis
}

// ── Finnhub daily candles ──────────────────────────────────────────────────────

async function fhDailyCandles(ticker: string, key: string): Promise<DailyCandles | null> {
  const to   = Math.floor(Date.now() / 1000)
  const from = to - LOOKBACK_D * 86_400
  try {
    const r = await fetch(
      `https://finnhub.io/api/v1/stock/candle?symbol=${ticker}&resolution=D&from=${from}&to=${to}&token=${key}`,
      { cache: 'no-store', signal: AbortSignal.timeout(FH_TIMEOUT) },
    )
    if (!r.ok) { console.warn('[technical] Finnhub status', r.status, ticker, '— probando Yahoo'); return null }
    const d = await r.json() as { s?: string; c?: number[]; t?: number[] }
    if (d.s !== 'ok' || !Array.isArray(d.c) || d.c.length < 30 || !Array.isArray(d.t)) return null
    return {
      closes: d.c,
      dates:  d.t.map(ts => new Date(ts * 1000).toISOString().slice(0, 10)),
    }
  } catch (err) {
    console.warn('[technical] Finnhub error', ticker, err)
    return null
  }
}

// ── Yahoo Finance daily candles (fallback — mismo patrón que stock-price) ────

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept':     'application/json',
}

async function yahooDailyCandles(ticker: string): Promise<DailyCandles | null> {
  const path = `/v8/finance/chart/${ticker}?range=2y&interval=1d&includePrePost=false`
  try {
    let r = await fetch(`https://query1.finance.yahoo.com${path}`, {
      headers: YF_HEADERS, cache: 'no-store', signal: AbortSignal.timeout(FH_TIMEOUT),
    })
    if (!r.ok) r = await fetch(`https://query2.finance.yahoo.com${path}`, {
      headers: YF_HEADERS, cache: 'no-store', signal: AbortSignal.timeout(FH_TIMEOUT),
    })
    if (!r.ok) { console.error('[technical] Yahoo status', r.status, ticker); return null }
    const cd  = await r.json()
    const res = cd?.chart?.result?.[0]
    const ts: number[]              = res?.timestamp ?? []
    const rawCloses: (number|null)[] = res?.indicators?.quote?.[0]?.close ?? []
    const closes: number[] = []
    const dates:  string[] = []
    for (let i = 0; i < ts.length; i++) {
      const c = rawCloses[i]
      if (c === null || c === undefined) continue
      closes.push(c)
      dates.push(new Date(ts[i] * 1000).toISOString().slice(0, 10))
    }
    if (closes.length < 30) return null
    // Últimos ~14 meses (misma ventana que Finnhub)
    return { closes: closes.slice(-430), dates: dates.slice(-430) }
  } catch (err) {
    console.error('[technical] Yahoo error', ticker, err)
    return null
  }
}

// ── Handler ────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const user = await getServerSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const symbol = (searchParams.get('symbol') ?? '').trim().toUpperCase()
  if (!TICKER_RE.test(symbol)) return NextResponse.json({ error: 'Símbolo inválido' }, { status: 400 })

  const apiKey = process.env.FINNHUB_API_KEY

  try {
    const supabase = await createClient()
    const cacheKey = `${symbol}_D1Y`
    const now      = Date.now()

    // ── Cache (mismo patrón de claves sintéticas que stock-history) ─────────
    let candles: DailyCandles | null = null
    const { data: cached } = await supabase
      .from('price_cache')
      .select('history7d, fetched_at')
      .eq('ticker', cacheKey)
      .maybeSingle()

    if (cached) {
      const age = (now - new Date(cached.fetched_at).getTime()) / 1000
      const stored = cached.history7d as DailyCandles | null
      if (age < DAILY_TTL && stored?.closes && stored.closes.length >= 30) candles = stored
    }

    if (!candles) {
      // Finnhub primero (si hay key y el plan lo permite), Yahoo como fallback
      if (apiKey) candles = await fhDailyCandles(symbol, apiKey)
      if (!candles) candles = await yahooDailyCandles(symbol)
      if (candles) {
        supabase.from('price_cache').upsert(
          {
            ticker:     cacheKey,
            price:      candles.closes[candles.closes.length - 1] ?? 0,
            change_pct: 0,
            name:       `${symbol} daily 1y`,
            history7d:  candles as unknown as number[],
            fetched_at: new Date(now).toISOString(),
          },
          { onConflict: 'ticker' },
        ).then(({ error }) => {
          if (error) console.error('[technical] cache write error:', symbol, error.message)
        })
      }
    }

    if (!candles) {
      return NextResponse.json(
        { error: 'Sin velas diarias para este símbolo — verifica el ticker' },
        { status: 502 },
      )
    }

    const analysis = analyze(candles)
    return NextResponse.json({ ticker: symbol, analysis } satisfies TechnicalResponse, {
      headers: { 'Cache-Control': 'private, max-age=21600' },
    })
  } catch (err) {
    console.error('[technical] unhandled error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
