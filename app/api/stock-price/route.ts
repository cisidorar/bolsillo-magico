import { NextResponse } from 'next/server'
import { getServerSession, createClient } from '@/lib/supabase/server'

// ── Config ────────────────────────────────────────────────────────────────────

const TICKER_RE  = /^[A-Z0-9.\-]{1,12}$/
const STOCKS_TTL = 5  * 60   // 5 min  — cotizaciones de acciones
const FX_TTL     = 30 * 60   // 30 min — tipo de cambio USD/CLP

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StockQuote {
  price:         number
  changePercent: number
  name:          string
  currency:      string
  history7d?:    number[]   // precios cierre últimos 7 días hábiles (oldest → newest)
  domain?:       string     // dominio web de la empresa (para logos)
}

interface PriceCacheRow {
  ticker:     string
  price:      number
  change_pct: number
  name:       string | null
  domain:     string | null
  history7d:  unknown
  fetched_at: string
}

// ── Finnhub fetchers ──────────────────────────────────────────────────────────

const FH_TIMEOUT = 7_000   // 7 s — Vercel corta la función a los 10 s

async function fhFetch(url: string): Promise<unknown | null> {
  try {
    const r = await fetch(url, {
      cache:  'no-store',
      signal: AbortSignal.timeout(FH_TIMEOUT),
    })
    if (!r.ok) {
      console.error('[fhFetch] status', r.status, url)
      return null
    }
    return await r.json()
  } catch (err) {
    console.error('[fhFetch] error', err, url)
    return null
  }
}

async function fhQuote(
  ticker: string,
  key: string,
): Promise<{ price: number; changePercent: number } | null> {
  const d = await fhFetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${key}`) as Record<string, number> | null
  if (!d || !d.c || d.c === 0) return null
  return { price: d.c, changePercent: d.dp ?? 0 }
}

async function fhProfile(ticker: string, key: string): Promise<{ name: string | null; domain: string | null }> {
  const d = await fhFetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=${key}`) as Record<string, unknown> | null
  const name = (d?.name as string) || null
  const weburl = (d?.weburl as string) || null
  let domain: string | null = null
  if (weburl) {
    try {
      domain = new URL(weburl).hostname.replace(/^www\./, '')
    } catch { /* ignorar URL inválida */ }
  }
  return { name, domain }
}

async function fhCandles(ticker: string, key: string): Promise<number[] | null> {
  const to   = Math.floor(Date.now() / 1000)
  const from = to - 20 * 86_400   // 20 días calendario → ~14 días hábiles
  const d = await fhFetch(
    `https://finnhub.io/api/v1/stock/candle?symbol=${ticker}&resolution=D&from=${from}&to=${to}&token=${key}`,
  ) as Record<string, unknown> | null
  if (!d) { console.warn('[fhCandles] null response for', ticker); return null }
  if (d.s !== 'ok') { console.warn('[fhCandles] s =', d.s, 'for', ticker); return null }
  if (!Array.isArray(d.c) || (d.c as number[]).length === 0) { console.warn('[fhCandles] empty closes for', ticker); return null }
  const closes = (d.c as number[]).filter((v): v is number => typeof v === 'number' && !isNaN(v))
  return closes.length >= 2 ? closes.slice(-7) : null
}

// ── Frankfurter (tipo de cambio, sin API key) ─────────────────────────────────

async function fxUsdClp(): Promise<number | null> {
  try {
    const r = await fetch(
      'https://api.frankfurter.app/latest?from=USD&to=CLP',
      { cache: 'no-store' },
    )
    if (!r.ok) return null
    const d = await r.json()
    return (d.rates?.CLP as number) ?? null
  } catch {
    return null
  }
}

// ── Yahoo Finance (fallback si no hay FINNHUB_API_KEY) ────────────────────────

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept':     'application/json',
}

async function yahooFallback(
  symbols:      string[],
  fetchHistory: boolean,
): Promise<Record<string, StockQuote>> {
  const allSymbols = [...symbols, 'USDCLP=X']
  const path =
    `/v7/finance/quote?symbols=${allSymbols.join(',')}&fields=regularMarketPrice,regularMarketChangePercent,shortName,currency&lang=en-US&region=US`

  let res = await fetch(`https://query1.finance.yahoo.com${path}`, { headers: YF_HEADERS, cache: 'no-store' })
  if (!res.ok) res = await fetch(`https://query2.finance.yahoo.com${path}`, { headers: YF_HEADERS, cache: 'no-store' })
  if (!res.ok) return {}

  const data = await res.json()
  const raw: Record<string, unknown>[] = data?.quoteResponse?.result ?? []
  const result: Record<string, StockQuote> = {}

  for (const q of raw) {
    const sym = q.symbol as string
    result[sym] = {
      price:         (q.regularMarketPrice         as number) ?? 0,
      changePercent: (q.regularMarketChangePercent as number) ?? 0,
      name:          (q.shortName                  as string) ?? sym,
      currency:      (q.currency                   as string) ?? 'USD',
    }
  }

  if (fetchHistory) {
    await Promise.all(symbols.map(async (sym) => {
      try {
        const chartPath = `/v8/finance/chart/${sym}?range=8d&interval=1d&includePrePost=false`
        let cr = await fetch(`https://query1.finance.yahoo.com${chartPath}`, { headers: YF_HEADERS, cache: 'no-store' })
        if (!cr.ok) cr = await fetch(`https://query2.finance.yahoo.com${chartPath}`, { headers: YF_HEADERS, cache: 'no-store' })
        if (!cr.ok) return
        const cd = await cr.json()
        const closes: (number | null)[] = cd?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []
        const valid = closes.filter((v): v is number => v !== null)
        if (result[sym]) result[sym].history7d = valid.slice(-7)
      } catch { /* omitir */ }
    }))
  }

  return result
}

// ── Handler principal ─────────────────────────────────────────────────────────

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

  const apiKey = process.env.FINNHUB_API_KEY

  // ── Sin API key: fallback a Yahoo Finance ─────────────────────────────────
  if (!apiKey) {
    console.warn('[stock-price] FINNHUB_API_KEY no configurada — usando Yahoo Finance')
    const result = await yahooFallback(symbols, fetchHistory)
    // Si Yahoo Finance no devolvió ningún ticker (bloqueado desde Vercel), devolver 502
    const hasData = Object.keys(result).some(k => k !== 'USDCLP=X')
    if (!hasData) {
      console.error('[stock-price] Yahoo Finance no devolvió datos — configurar FINNHUB_API_KEY')
      return NextResponse.json({ error: 'Failed to fetch prices' }, { status: 502 })
    }
    return NextResponse.json(result)
  }

  // ── Con API key: Finnhub + caché Supabase ─────────────────────────────────
  try {
  const supabase = await createClient()
  const now      = Date.now()

  // 1. Cargar caché para todos los tickers + USDCLP
  const { data: cached } = await supabase
    .from('price_cache')
    .select('ticker, price, change_pct, name, domain, history7d, fetched_at')
    .in('ticker', [...symbols, 'USDCLP'])

  const cacheMap: Record<string, PriceCacheRow> = Object.fromEntries(
    (cached ?? []).map(r => [r.ticker as string, r as PriceCacheRow]),
  )

  const result: Record<string, StockQuote> = {}
  const stale: string[] = []

  // 2. Separar frescos de vencidos
  for (const ticker of symbols) {
    const c   = cacheMap[ticker]
    const age = c ? (now - new Date(c.fetched_at).getTime()) / 1000 : Infinity

    if (c && age < STOCKS_TTL) {
      result[ticker] = {
        price:         c.price,
        changePercent: c.change_pct,
        name:          c.name ?? ticker,
        currency:      'USD',
        history7d:     Array.isArray(c.history7d) ? (c.history7d as number[]) : undefined,
        domain:        c.domain ?? undefined,
      }
    } else {
      stale.push(ticker)
    }
  }

  // 3. USD/CLP — verificar caché
  const fxRow = cacheMap['USDCLP']
  const fxAge = fxRow ? (now - new Date(fxRow.fetched_at).getTime()) / 1000 : Infinity
  let usdClp: number | null = fxAge < FX_TTL ? fxRow.price : null

  // 4. Fetch paralelo de tickers vencidos desde Finnhub
  if (stale.length > 0) {
    await Promise.all(stale.map(async (ticker) => {
      const needsProfile = !cacheMap[ticker]?.name || !cacheMap[ticker]?.domain

      const [quote, history, profile] = await Promise.all([
        fhQuote(ticker, apiKey),
        fetchHistory
          ? fhCandles(ticker, apiKey)
          : Promise.resolve(null),
        needsProfile
          ? fhProfile(ticker, apiKey)
          : Promise.resolve({ name: cacheMap[ticker]?.name ?? null, domain: cacheMap[ticker]?.domain ?? null }),
      ])

      if (!quote) {
        // Ticker no encontrado en Finnhub — intentar mantener caché anterior
        if (cacheMap[ticker]) {
          result[ticker] = {
            price:         cacheMap[ticker].price,
            changePercent: cacheMap[ticker].change_pct,
            name:          cacheMap[ticker].name ?? ticker,
            currency:      'USD',
            history7d:     Array.isArray(cacheMap[ticker].history7d)
              ? (cacheMap[ticker].history7d as number[])
              : undefined,
            domain:        cacheMap[ticker].domain ?? undefined,
          }
        }
        return
      }

      const resolvedName    = profile.name ?? cacheMap[ticker]?.name ?? ticker
      const resolvedDomain  = profile.domain ?? cacheMap[ticker]?.domain ?? null
      const cachedHistory   = Array.isArray(cacheMap[ticker]?.history7d)
        ? (cacheMap[ticker].history7d as number[])
        : null
      const resolvedHistory = history ?? cachedHistory

      result[ticker] = {
        price:         quote.price,
        changePercent: quote.changePercent,
        name:          resolvedName,
        currency:      'USD',
        history7d:     resolvedHistory ?? undefined,
        domain:        resolvedDomain ?? undefined,
      }

      // Guardar en caché (fire-and-forget, no bloquea la respuesta)
      supabase.from('price_cache').upsert(
        {
          ticker,
          price:      quote.price,
          change_pct: quote.changePercent,
          name:       resolvedName,
          domain:     resolvedDomain,
          history7d:  resolvedHistory ?? null,
          fetched_at: new Date(now).toISOString(),
        },
        { onConflict: 'ticker' },
      ).then(({ error }) => {
        if (error) console.error('[stock-price] cache write error:', ticker, error.message)
      })
    }))
  }

  // 5. Si prices frescos pero no hay history, refetch solo las sparklines vencidas
  if (fetchHistory && stale.length === 0) {
    await Promise.all(symbols.map(async (ticker) => {
      const cached7d = Array.isArray(cacheMap[ticker]?.history7d)
        ? (cacheMap[ticker].history7d as number[])
        : null
      if (!cached7d || cached7d.length < 2) {
        const history = await fhCandles(ticker, apiKey)
        if (history && result[ticker]) {
          result[ticker].history7d = history
          supabase.from('price_cache')
            .update({ history7d: history })
            .eq('ticker', ticker)
            .then(({ error }) => {
              if (error) console.error('[stock-price] history update error:', ticker, error.message)
            })
        }
      }
    }))
  }

  // 6. USD/CLP — fetch si venció
  if (!usdClp) {
    usdClp = await fxUsdClp()
    if (usdClp) {
      supabase.from('price_cache').upsert(
        {
          ticker:     'USDCLP',
          price:      usdClp,
          change_pct: 0,
          name:       'USD/CLP',
          history7d:  null,
          fetched_at: new Date(now).toISOString(),
        },
        { onConflict: 'ticker' },
      ).then(({ error }) => {
        if (error) console.error('[stock-price] usdclp cache error:', error.message)
      })
    }
  }

  // Emitir USDCLP=X para mantener compatibilidad con el cliente
  if (usdClp) {
    result['USDCLP=X'] = {
      price:         usdClp,
      changePercent: 0,
      name:          'USD/CLP',
      currency:      'CLP',
    }
  }

  // Si Finnhub no devolvió ningún ticker, devolver 502 con detalle
  const hasData = Object.keys(result).some(k => k !== 'USDCLP=X')
  if (!hasData) {
    console.error('[stock-price] Finnhub no devolvió datos para:', symbols)
    return NextResponse.json({ error: 'Failed to fetch prices from Finnhub' }, { status: 502 })
  }

  return NextResponse.json(result)

  } catch (err) {
    console.error('[stock-price] unhandled error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
