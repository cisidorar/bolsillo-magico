import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/supabase/server'

// ── Búsqueda de acciones/ETFs por nombre o ticker ────────────────────────────
// Finnhub /search (free tier) primero; Yahoo Finance como fallback,
// mismo patrón de headers/reintento que stock-price.

const FH_TIMEOUT = 6_000
const MAX_RESULTS = 8

export interface SearchResult {
  symbol: string
  name:   string
  type:   'stock' | 'etf' | 'other'
}

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept':     'application/json',
}

// Símbolos "limpios": sin sufijos de bolsas extranjeras (AAPL sí, 7203.T no)
const CLEAN_SYMBOL = /^[A-Z0-9\-]{1,8}$/

async function finnhubSearch(q: string, key: string): Promise<SearchResult[]> {
  try {
    const r = await fetch(
      `https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${key}`,
      { cache: 'no-store', signal: AbortSignal.timeout(FH_TIMEOUT) },
    )
    if (!r.ok) return []
    const d = await r.json() as { result?: { symbol: string; description: string; type: string }[] }
    return (d.result ?? [])
      .filter(x => CLEAN_SYMBOL.test(x.symbol))
      .filter(x => ['Common Stock', 'ETP', 'ETF', 'ADR'].includes(x.type))
      .slice(0, MAX_RESULTS)
      .map(x => ({
        symbol: x.symbol,
        name:   x.description,
        type:   x.type === 'Common Stock' || x.type === 'ADR' ? 'stock' as const : 'etf' as const,
      }))
  } catch { return [] }
}

async function yahooSearch(q: string): Promise<SearchResult[]> {
  const path = `/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=${MAX_RESULTS}&newsCount=0&listsCount=0`
  try {
    let r = await fetch(`https://query1.finance.yahoo.com${path}`, {
      headers: YF_HEADERS, cache: 'no-store', signal: AbortSignal.timeout(FH_TIMEOUT),
    })
    if (!r.ok) r = await fetch(`https://query2.finance.yahoo.com${path}`, {
      headers: YF_HEADERS, cache: 'no-store', signal: AbortSignal.timeout(FH_TIMEOUT),
    })
    if (!r.ok) return []
    const d = await r.json() as { quotes?: { symbol?: string; shortname?: string; longname?: string; quoteType?: string }[] }
    return (d.quotes ?? [])
      .filter(x => x.symbol && CLEAN_SYMBOL.test(x.symbol))
      .filter(x => x.quoteType === 'EQUITY' || x.quoteType === 'ETF')
      .slice(0, MAX_RESULTS)
      .map(x => ({
        symbol: x.symbol!,
        name:   x.shortname ?? x.longname ?? x.symbol!,
        type:   x.quoteType === 'ETF' ? 'etf' as const : 'stock' as const,
      }))
  } catch { return [] }
}

export async function GET(request: Request) {
  const user = await getServerSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') ?? '').trim().slice(0, 40)
  if (q.length < 2) return NextResponse.json({ results: [] })

  const apiKey = process.env.FINNHUB_API_KEY
  let results: SearchResult[] = apiKey ? await finnhubSearch(q, apiKey) : []
  if (results.length === 0) results = await yahooSearch(q)

  // Dedupe por símbolo conservando el orden
  const seen = new Set<string>()
  results = results.filter(r => !seen.has(r.symbol) && seen.add(r.symbol))

  return NextResponse.json({ results }, {
    headers: { 'Cache-Control': 'private, max-age=300' },
  })
}
