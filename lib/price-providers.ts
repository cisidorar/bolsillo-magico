import type { SupabaseClient } from '@supabase/supabase-js'

// ── Proveedores de OHLCV diario + sync a price_history ───────────────────────
// Cadena: Tiingo (primaria — free tier 1000 req/día, 50/hora, 500 símbolos/mes)
//         → Alpha Vantage → Yahoo → Stooq. Todo se persiste en price_history;
// el análisis técnico lee SIEMPRE de la BD.

export interface OhlcvRow {
  ticker: string
  date:   string        // YYYY-MM-DD
  open:   number | null
  high:   number | null
  low:    number | null
  close:  number
  volume: number | null
}

const TIMEOUT   = 10_000
const LOOKBACK_D = 430   // ~14 meses → ≥252 hábiles + SMA200

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept':     'application/json',
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
}

// ── Tiingo (primaria) ─────────────────────────────────────────────────────────

async function tiingoDaily(ticker: string, from: string, key: string, reasons: string[]): Promise<OhlcvRow[] | null> {
  const url = `https://api.tiingo.com/tiingo/daily/${encodeURIComponent(ticker.toLowerCase())}/prices?startDate=${from}&token=${key}`
  try {
    const r = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT),
    })
    if (!r.ok) { reasons.push(`Tiingo ${r.status}`); return null }
    const d = await r.json() as { date: string; open?: number; high?: number; low?: number; close?: number; adjClose?: number; adjOpen?: number; adjHigh?: number; adjLow?: number; volume?: number }[]
    if (!Array.isArray(d) || d.length === 0) { reasons.push('Tiingo sin datos'); return null }
    return d.map(row => ({
      ticker,
      date:   row.date.slice(0, 10),
      open:   row.adjOpen  ?? row.open  ?? null,
      high:   row.adjHigh  ?? row.high  ?? null,
      low:    row.adjLow   ?? row.low   ?? null,
      close:  row.adjClose ?? row.close ?? 0,
      volume: row.volume   ?? null,
    })).filter(r2 => r2.close > 0)
  } catch (err) {
    reasons.push(`Tiingo error: ${err instanceof Error ? err.message : 'desconocido'}`)
    return null
  }
}

// ── Alpha Vantage ─────────────────────────────────────────────────────────────

async function alphaVantageDaily(ticker: string, from: string, key: string, reasons: string[]): Promise<OhlcvRow[] | null> {
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${ticker}&outputsize=full&apikey=${key}`
  try {
    const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT) })
    if (!r.ok) { reasons.push(`AlphaVantage ${r.status}`); return null }
    const d = await r.json() as Record<string, unknown>
    if (typeof d['Note'] === 'string' || typeof d['Information'] === 'string') {
      reasons.push('AlphaVantage: límite diario alcanzado')
      return null
    }
    const series = d['Time Series (Daily)'] as Record<string, Record<string, string>> | undefined
    if (!series) { reasons.push('AlphaVantage sin serie'); return null }
    const rows: OhlcvRow[] = []
    for (const [date, v] of Object.entries(series)) {
      if (date < from) continue
      const close = parseFloat(v['4. close'])
      if (isNaN(close)) continue
      rows.push({
        ticker, date,
        open:   parseFloat(v['1. open'])  || null,
        high:   parseFloat(v['2. high'])  || null,
        low:    parseFloat(v['3. low'])   || null,
        close,
        volume: parseInt(v['5. volume'])  || null,
      })
    }
    rows.sort((a, b) => a.date.localeCompare(b.date))
    return rows.length > 0 ? rows : (reasons.push('AlphaVantage vacío en el rango'), null)
  } catch (err) {
    reasons.push(`AlphaVantage error: ${err instanceof Error ? err.message : 'desconocido'}`)
    return null
  }
}

// ── Yahoo Finance ─────────────────────────────────────────────────────────────

async function yahooDaily(ticker: string, from: string, reasons: string[]): Promise<OhlcvRow[] | null> {
  const p1 = Math.floor(new Date(from + 'T00:00:00Z').getTime() / 1000)
  const p2 = Math.floor(Date.now() / 1000)
  const path = `/v8/finance/chart/${ticker}?period1=${p1}&period2=${p2}&interval=1d&includePrePost=false`
  try {
    let r = await fetch(`https://query1.finance.yahoo.com${path}`, {
      headers: YF_HEADERS, cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT),
    })
    if (!r.ok) r = await fetch(`https://query2.finance.yahoo.com${path}`, {
      headers: YF_HEADERS, cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT),
    })
    if (!r.ok) { reasons.push(`Yahoo ${r.status}`); return null }
    const cd  = await r.json()
    const res = cd?.chart?.result?.[0]
    const ts: number[] = res?.timestamp ?? []
    const q = res?.indicators?.quote?.[0] ?? {}
    const rows: OhlcvRow[] = []
    for (let i = 0; i < ts.length; i++) {
      const close = q.close?.[i]
      if (close === null || close === undefined) continue
      rows.push({
        ticker,
        date:   new Date(ts[i] * 1000).toISOString().slice(0, 10),
        open:   q.open?.[i]   ?? null,
        high:   q.high?.[i]   ?? null,
        low:    q.low?.[i]    ?? null,
        close,
        volume: q.volume?.[i] ?? null,
      })
    }
    return rows.length > 0 ? rows : (reasons.push('Yahoo sin filas'), null)
  } catch (err) {
    reasons.push(`Yahoo error: ${err instanceof Error ? err.message : 'desconocido'}`)
    return null
  }
}

// ── Stooq ─────────────────────────────────────────────────────────────────────

async function stooqDaily(ticker: string, from: string, reasons: string[]): Promise<OhlcvRow[] | null> {
  const fmt = (d: string) => d.replace(/-/g, '')
  const to  = new Date().toISOString().slice(0, 10)
  const url = `https://stooq.com/q/d/l/?s=${ticker.toLowerCase()}.us&d1=${fmt(from)}&d2=${fmt(to)}&i=d`
  try {
    const r = await fetch(url, { headers: YF_HEADERS, cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT) })
    if (!r.ok) { reasons.push(`Stooq ${r.status}`); return null }
    const text  = await r.text()
    const lines = text.trim().split('\n')
    if (lines.length < 2 || !lines[0].toLowerCase().startsWith('date')) {
      reasons.push(`Stooq respondió: "${text.trim().slice(0, 50)}"`)
      return null
    }
    const rows: OhlcvRow[] = []
    for (let i = 1; i < lines.length; i++) {
      const c = lines[i].split(',')
      const close = parseFloat(c[4])
      if (!c[0] || isNaN(close)) continue
      rows.push({
        ticker, date: c[0],
        open:  parseFloat(c[1]) || null,
        high:  parseFloat(c[2]) || null,
        low:   parseFloat(c[3]) || null,
        close,
        volume: parseInt(c[5]) || null,
      })
    }
    return rows.length > 0 ? rows : (reasons.push('Stooq vacío'), null)
  } catch (err) {
    reasons.push(`Stooq error: ${err instanceof Error ? err.message : 'desconocido'}`)
    return null
  }
}

// ── Sync a price_history ──────────────────────────────────────────────────────

export interface SyncResult {
  ticker:   string
  inserted: number
  source:   string | null
  reasons:  string[]
}

/**
 * Trae las velas faltantes de un ticker y las persiste en price_history.
 * Incremental: parte desde el último date guardado (o 430 días si está vacío).
 */
export async function syncTicker(supabase: SupabaseClient, ticker: string): Promise<SyncResult> {
  const reasons: string[] = []

  // ¿Desde cuándo sincronizar?
  const { data: last } = await supabase
    .from('price_history')
    .select('date')
    .eq('ticker', ticker)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()

  const today = new Date().toISOString().slice(0, 10)
  const from  = last?.date
    ? new Date(new Date(last.date + 'T12:00:00').getTime() + 86_400_000).toISOString().slice(0, 10)
    : isoDaysAgo(LOOKBACK_D)

  if (from > today) return { ticker, inserted: 0, source: 'al día', reasons }

  // Cadena de proveedores
  const tiingoKey = process.env.TIINGO_API_KEY
  const avKey     = process.env.ALPHAVANTAGE_API_KEY
  let rows: OhlcvRow[] | null = null
  let source: string | null = null

  if (tiingoKey) { rows = await tiingoDaily(ticker, from, tiingoKey, reasons); if (rows) source = 'tiingo' }
  if (!rows && avKey) { rows = await alphaVantageDaily(ticker, from, avKey, reasons); if (rows) source = 'alphavantage' }
  if (!rows) { rows = await yahooDaily(ticker, from, reasons); if (rows) source = 'yahoo' }
  if (!rows) { rows = await stooqDaily(ticker, from, reasons); if (rows) source = 'stooq' }
  if (!tiingoKey) reasons.push('Tiingo sin configurar (TIINGO_API_KEY)')

  if (!rows) return { ticker, inserted: 0, source: null, reasons }

  // Upsert por lotes (PK ticker+date hace la dedupe)
  const { error } = await supabase.from('price_history').upsert(rows, { onConflict: 'ticker,date' })
  if (error) {
    reasons.push(`upsert: ${error.message}`)
    return { ticker, inserted: 0, source, reasons }
  }
  return { ticker, inserted: rows.length, source, reasons }
}

/** Lee las velas de la BD (viejo → nuevo), incluyendo high/low/volume para
 *  niveles de soporte/resistencia más precisos y confirmación por volumen. */
export async function readCandles(
  supabase: SupabaseClient,
  ticker: string,
  maxDays = LOOKBACK_D,
): Promise<{ closes: number[]; dates: string[]; highs: number[]; lows: number[]; volumes: number[] }> {
  const { data } = await supabase
    .from('price_history')
    .select('date, close, high, low, volume')
    .eq('ticker', ticker)
    .order('date', { ascending: false })
    .limit(maxDays)
  const rows = (data ?? []).reverse()
  return {
    closes: rows.map(r => Number(r.close)),
    dates:  rows.map(r => r.date as string),
    // Fallback al cierre si high/low viene null (algunas fuentes no siempre lo entregan)
    highs:   rows.map(r => (r.high   !== null && r.high   !== undefined ? Number(r.high)   : Number(r.close))),
    lows:    rows.map(r => (r.low    !== null && r.low    !== undefined ? Number(r.low)    : Number(r.close))),
    volumes: rows.map(r => (r.volume !== null && r.volume !== undefined ? Number(r.volume) : 0)),
  }
}
