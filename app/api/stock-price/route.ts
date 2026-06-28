import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/supabase/server'

// Only allow valid US stock ticker chars: A-Z, 0-9, dot, dash, equals (for forex like USDCLP=X)
const TICKER_RE = /^[A-Z0-9.\-=]{1,12}$/

export interface StockQuote {
  price:         number
  changePercent: number
  name:          string
  currency:      string
}

export async function GET(request: Request) {
  // Auth required — no public stock price endpoint
  const user = await getServerSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const raw = searchParams.get('symbols') ?? ''

  const symbols = raw
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(s => TICKER_RE.test(s))
    .slice(0, 25) // cap at 25 tickers per request

  if (!symbols.length) {
    return NextResponse.json({ error: 'No valid symbols' }, { status: 400 })
  }

  // Always include USD/CLP exchange rate
  const allSymbols = [...new Set([...symbols, 'USDCLP=X'])]

  try {
    // Yahoo Finance v7 quote API — no API key required for basic quotes
    const yahooUrl =
      `https://query1.finance.yahoo.com/v7/finance/quote` +
      `?symbols=${allSymbols.join(',')}` +
      `&fields=regularMarketPrice,regularMarketChangePercent,shortName,currency` +
      `&lang=en-US&region=US`

    const res = await fetch(yahooUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
      // Cache server-side for 5 minutes; fresh enough for a personal portfolio tracker
      next: { revalidate: 300 },
    })

    if (!res.ok) {
      console.error('[stock-price] Yahoo Finance error:', res.status, await res.text().catch(() => ''))
      return NextResponse.json({ error: 'Failed to fetch prices' }, { status: 502 })
    }

    const data = await res.json()
    const quotes: Record<string, unknown>[] = data?.quoteResponse?.result ?? []

    const result: Record<string, StockQuote> = {}

    for (const q of quotes) {
      const sym = q.symbol as string
      result[sym] = {
        price:         (q.regularMarketPrice         as number) ?? 0,
        changePercent: (q.regularMarketChangePercent as number) ?? 0,
        name:          (q.shortName                  as string) ?? sym,
        currency:      (q.currency                   as string) ?? 'USD',
      }
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('[stock-price] fetch error:', err)
    return NextResponse.json({ error: 'Failed to fetch prices' }, { status: 502 })
  }
}
