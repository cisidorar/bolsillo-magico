import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/supabase/server'

const TICKER_RE = /^[A-Z0-9.\-=]{1,12}$/

export interface StockQuote {
  price:         number
  changePercent: number
  name:          string
  currency:      string
  history7d?:    number[] // closing prices last 7 trading days (oldest → newest)
}

export async function GET(request: Request) {
  const user = await getServerSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const raw          = searchParams.get('symbols') ?? ''
  const fetchHistory = searchParams.get('history') === 'true'

  const symbols = raw
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(s => TICKER_RE.test(s))
    .slice(0, 25)

  if (!symbols.length) return NextResponse.json({ error: 'No valid symbols' }, { status: 400 })

  const allSymbols = [...new Set([...symbols, 'USDCLP=X'])]

  const YF_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
  }

  try {
    // ── 1. Fetch current quotes for all symbols ───────────────────────────
    const quotesUrl =
      `https://query1.finance.yahoo.com/v7/finance/quote` +
      `?symbols=${allSymbols.join(',')}` +
      `&fields=regularMarketPrice,regularMarketChangePercent,shortName,currency` +
      `&lang=en-US&region=US`

    const quotesRes = await fetch(quotesUrl, {
      headers: YF_HEADERS,
      next: { revalidate: 300 }, // 5 min cache
    })

    if (!quotesRes.ok) {
      console.error('[stock-price] quotes error:', quotesRes.status)
      return NextResponse.json({ error: 'Failed to fetch prices' }, { status: 502 })
    }

    const quotesData = await quotesRes.json()
    const rawQuotes: Record<string, unknown>[] = quotesData?.quoteResponse?.result ?? []

    const result: Record<string, StockQuote> = {}
    for (const q of rawQuotes) {
      const sym = q.symbol as string
      result[sym] = {
        price:         (q.regularMarketPrice         as number) ?? 0,
        changePercent: (q.regularMarketChangePercent as number) ?? 0,
        name:          (q.shortName                  as string) ?? sym,
        currency:      (q.currency                   as string) ?? 'USD',
      }
    }

    // ── 2. Fetch 7-day history per user symbol (parallel) ─────────────────
    if (fetchHistory && symbols.length > 0) {
      await Promise.all(
        symbols.map(async (sym) => {
          try {
            const chartUrl =
              `https://query1.finance.yahoo.com/v8/finance/chart/${sym}` +
              `?range=8d&interval=1d&includePrePost=false`

            const chartRes = await fetch(chartUrl, {
              headers: YF_HEADERS,
              next: { revalidate: 3600 }, // 1h cache for daily history
            })

            if (!chartRes.ok) return

            const chartData = await chartRes.json()
            const closes: (number | null)[] =
              chartData?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []

            const valid = closes.filter((v): v is number => v !== null && v !== undefined)
            if (result[sym]) result[sym].history7d = valid.slice(-7)
          } catch {
            // silently skip history for this ticker
          }
        })
      )
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('[stock-price] error:', err)
    return NextResponse.json({ error: 'Failed to fetch prices' }, { status: 502 })
  }
}
