import { NextResponse } from 'next/server'
import { createClient as createAdminClient, type SupabaseClient } from '@supabase/supabase-js'
import { analyzeDrop, impactLines, type DropReport, type DropPositionInput } from '@/lib/market-drop'
import { cashFromTotals } from '@/lib/wallet-cash'
import { isNyseTradingDay, todayEt } from '@/lib/nyse-calendar'
import { invokeEdgeFunction } from '@/lib/invoke-edge-function'

// ── Cron: aviso de caída fuerte (nov 2026) ───────────────────────────────────
// Corre después de /api/cron/sync-prices (vercel.json: 23:15 UTC, lun–vie),
// con price_history ya al día. Por usuario con posiciones: ¿hoy fue una caída
// fuerte? (reglas en lib/market-drop.ts). Si sí, arma
//   1. POR QUÉ cayó: titulares del día (Finnhub, mercado + tus peores
//      posiciones) resumidos por la IA — solo resume, no inventa ni recomienda;
//   2. CÓMO TE AFECTA: números determinísticos (impactLines) — la IA no toca tu plata;
// y se lo pasa a la Edge Function notify-market-drop, que manda el correo
// (Resend vive allá) con idempotencia por notification_log.
//
// Ruta aparte del cron de precios a propósito: ese tiene 60 s justos y ya
// murió por timeout dos veces; la IA + noticias no pueden competir con él.
//
// Manual: GET ?date=YYYY-MM-DD (re-evaluar un día pasado) · &dry=1 (no envía,
// devuelve los reportes) — siempre con Authorization: Bearer CRON_SECRET.

export const maxDuration = 60
export const dynamic = 'force-dynamic'

interface Headline { title: string; source: string; url: string; ticker?: string }

function sanitize(str: string | null | undefined, maxLen = 160): string {
  if (!str) return ''
  // eslint-disable-next-line no-control-regex
  return str.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLen)
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// ── Noticias (Finnhub) ──────────────────────────────────────────────────────
async function fetchJson(url: string): Promise<unknown> {
  try {
    const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8_000) })
    return r.ok ? await r.json() : null
  } catch { return null }
}

type FhItem = { datetime?: number; headline?: string; source?: string; url?: string }

function pickHeadlines(raw: unknown, from: number, to: number, max: number, ticker?: string): Headline[] {
  const seen = new Set<string>()
  return (Array.isArray(raw) ? raw as FhItem[] : [])
    .filter(n => n.headline && n.url && typeof n.datetime === 'number' && n.datetime >= from && n.datetime <= to)
    .sort((a, b) => (b.datetime ?? 0) - (a.datetime ?? 0))
    .filter(n => { const k = sanitize(n.headline, 70).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true })
    .slice(0, max)
    .map(n => ({ title: sanitize(n.headline), source: sanitize(n.source, 30), url: String(n.url).slice(0, 500), ticker }))
    .filter(n => n.url.startsWith('http'))
}

async function marketHeadlines(date: string, tickers: string[]): Promise<Headline[]> {
  const key = process.env.FINNHUB_API_KEY
  if (!key) return []
  // Ventana: desde el cierre anterior hasta la mañana siguiente (UTC).
  const from = Math.floor(new Date(addDays(date, -1) + 'T20:00:00Z').getTime() / 1000)
  const to   = Math.floor(new Date(addDays(date, 1) + 'T12:00:00Z').getTime() / 1000)
  const [general, ...perTicker] = await Promise.all([
    fetchJson(`https://finnhub.io/api/v1/news?category=general&token=${key}`),
    ...tickers.map(t => fetchJson(`https://finnhub.io/api/v1/company-news?symbol=${t}&from=${addDays(date, -1)}&to=${addDays(date, 1)}&token=${key}`)),
  ])
  return [
    ...pickHeadlines(general, from, to, 8),
    ...perTicker.flatMap((raw, i) => pickHeadlines(raw, from, to, 4, tickers[i])),
  ]
}

const SYSTEM_PROMPT = `Explicas caídas de la bolsa a una persona SIN experiencia en inversiones, en una app personal chilena.
Recibirás: la fecha, cuánto bajó el mercado (S&P 500), las acciones de la persona que más cayeron, y titulares del día (en inglés).

Reglas estrictas:
- Escribe 3 a 5 frases en español simple: qué pasó en el mercado hoy y por qué cayeron SUS acciones.
- Usa SOLO lo que dicen los titulares. No inventes cifras, causas ni contexto. Si los titulares no explican la caída de alguna acción, dilo.
- NO des recomendación de compra o venta ni digas si es buen momento para invertir.
- Tono calmado y directo, sin jerga (si usas un término como "guidance" o "corrección", explícalo en pocas palabras).

Responde SIEMPRE con JSON válido: {"summary": "texto"}`

async function explainWithAI(date: string, report: DropReport, headlines: Headline[]): Promise<string | null> {
  const apiKey  = process.env.AI_API_KEY ?? process.env.OPENAI_API_KEY
  if (!apiKey || headlines.length === 0) return null
  const apiUrl  = process.env.AI_API_URL ?? 'https://api.openai.com/v1'
  const aiModel = process.env.AI_MODEL   ?? 'gpt-4.1-mini'
  try {
    const r = await fetch(`${apiUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        model: aiModel,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify({
            fecha: date,
            sp500_pct: report.spyPct,
            tus_peores: report.losers.map(l => ({ ticker: l.ticker, pct: l.pct, etf_apalancado: l.leverage ?? undefined })),
            titulares: headlines.map(h => ({ t: h.title, fuente: h.source, sobre: h.ticker ?? 'mercado' })),
          }) },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 450,
      }),
    })
    if (!r.ok) { console.error('[market-drop] AI error:', r.status); return null }
    const j = await r.json()
    const parsed = JSON.parse(j.choices?.[0]?.message?.content ?? '{}') as { summary?: unknown }
    return typeof parsed.summary === 'string' && parsed.summary.trim() ? parsed.summary.trim().slice(0, 1200) : null
  } catch (err) {
    console.error('[market-drop] AI parse error:', err)
    return null
  }
}

// ── Datos por usuario ───────────────────────────────────────────────────────
async function closesFor(supabase: SupabaseClient, tickers: string[], date: string) {
  const { data } = await supabase
    .from('price_history')
    .select('ticker, date, close')
    .in('ticker', tickers)
    .lte('date', date)
    .gte('date', addDays(date, -10))
    .order('date', { ascending: false })
  const byTicker = new Map<string, { date: string; close: number }[]>()
  for (const r of (data ?? []) as { ticker: string; date: string; close: number }[]) {
    const arr = byTicker.get(r.ticker) ?? []
    arr.push({ date: r.date, close: Number(r.close) })
    byTicker.set(r.ticker, arr)
  }
  // close = cierre EXACTO del día pedido (si falta, null: no se inventa movimiento)
  const out = new Map<string, { close: number | null; prevClose: number | null }>()
  for (const t of tickers) {
    const rows = byTicker.get(t) ?? []
    const today = rows.find(r => r.date === date)
    const prev  = rows.find(r => r.date < date)
    out.set(t, { close: today?.close ?? null, prevClose: prev?.close ?? null })
  }
  return out
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Supabase env faltante' }, { status: 503 })
  const supabase = createAdminClient(url, key)

  const params = new URL(request.url).searchParams
  const date   = /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') ?? '') ? params.get('date')! : todayEt()
  const dry    = params.get('dry') === '1'
  if (!isNyseTradingDay(date)) return NextResponse.json({ skipped: 'día sin rueda', date })

  try {
    const [{ data: posRows }, { data: usdRows }, { data: buyRows }, { data: fx }] = await Promise.all([
      supabase.from('stock_positions').select('user_id, ticker, shares, avg_cost_usd'),
      supabase.from('usd_purchases').select('user_id, usd_amount'),
      supabase.from('stock_purchases').select('user_id, total_paid_usd'),
      supabase.from('price_cache').select('price').eq('ticker', 'USDCLP').maybeSingle(),
    ])
    const positions = (posRows ?? []) as { user_id: string; ticker: string; shares: number; avg_cost_usd: number }[]
    if (positions.length === 0) return NextResponse.json({ date, users: 0, reports: 0 })

    const tickers = [...new Set(['SPY', ...positions.map(p => p.ticker)])]
    const closes  = await closesFor(supabase, tickers, date)
    const spy     = closes.get('SPY')
    const spyPct  = spy?.close != null && spy.prevClose ? (spy.close / spy.prevClose - 1) * 100 : null
    const usdClp  = fx?.price ? Number(fx.price) : null

    const sumBy = (rows: { user_id: string }[] | null, field: string) => {
      const m = new Map<string, number>()
      for (const r of (rows ?? []) as unknown as Record<string, unknown>[]) {
        const u = r.user_id as string
        m.set(u, (m.get(u) ?? 0) + Number(r[field] ?? 0))
      }
      return m
    }
    const walletIn  = sumBy(usdRows, 'usd_amount')
    const walletOut = sumBy(buyRows, 'total_paid_usd')

    const userIds = [...new Set(positions.map(p => p.user_id))]
    const candidates: { userId: string; report: DropReport }[] = []

    for (const userId of userIds) {
      const mine = positions.filter(p => p.user_id === userId && Number(p.shares) > 0)
      const input: DropPositionInput[] = mine.map(p => ({
        ticker: p.ticker, shares: Number(p.shares), avgCostUsd: Number(p.avg_cost_usd),
        close: closes.get(p.ticker)?.close ?? null, prevClose: closes.get(p.ticker)?.prevClose ?? null,
      }))
      // Contexto CLP solo si el día ya califica sin él (las reglas no lo usan):
      // evita 2 queries por usuario en días normales.
      const quick = analyzeDrop(input, {
        walletUsd: cashFromTotals(walletIn.get(userId) ?? 0, walletOut.get(userId) ?? 0) ?? 0,
        spyPct, usdClp, netWorthClp: null, safeClp: null, monthlySpendClp: null,
      })
      if (!quick) continue

      const since = addDays(date, -90)
      const [{ data: nw }, { data: exp }] = await Promise.all([
        supabase.from('net_worth_snapshots').select('net_clp, total_clp, savings_clp, deposits_clp')
          .eq('user_id', userId).order('year', { ascending: false }).order('month', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('expenses').select('amount, excluded_from_analysis')
          .eq('user_id', userId).gte('date', since).lte('date', date),
      ])
      const spent = ((exp ?? []) as { amount: number; excluded_from_analysis: boolean | null }[])
        .filter(e => !e.excluded_from_analysis).reduce((s, e) => s + Number(e.amount), 0)

      const report = analyzeDrop(input, {
        walletUsd: cashFromTotals(walletIn.get(userId) ?? 0, walletOut.get(userId) ?? 0) ?? 0,
        spyPct, usdClp,
        netWorthClp:     nw ? Number(nw.net_clp ?? nw.total_clp) : null,
        safeClp:         nw ? Number(nw.savings_clp ?? 0) + Number(nw.deposits_clp ?? 0) : null,
        monthlySpendClp: spent > 0 ? spent / 3 : null,
      })
      if (report) candidates.push({ userId, report })
    }

    if (candidates.length === 0) return NextResponse.json({ date, users: userIds.length, reports: 0, spyPct })

    // Noticias una sola vez: mercado + las peores posiciones de todos (máx 6 tickers).
    const worstTickers = [...new Set(candidates.flatMap(c => c.report.losers.slice(0, 3).map(l => l.ticker)))].slice(0, 6)
    const headlines = await marketHeadlines(date, worstTickers)

    const reports = await Promise.all(candidates.map(async ({ userId, report }) => {
      const mineTickers = new Set(report.losers.map(l => l.ticker))
      const relevant = headlines.filter(h => !h.ticker || mineTickers.has(h.ticker))
      const explanation = await explainWithAI(date, report, relevant)
      // Links en el correo: primero los de tus acciones, después mercado.
      const links = [...relevant.filter(h => h.ticker), ...relevant.filter(h => !h.ticker)].slice(0, 4)
      return { userId, date, report, impact: impactLines(report), explanation, headlines: links }
    }))

    if (dry) return NextResponse.json({ date, dry: true, reports })

    const email = await invokeEdgeFunction(url, key, 'notify-market-drop', { body: { reports }, timeoutMs: 25_000 })
    return NextResponse.json({ date, reports: reports.length, email })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[market-drop] falló:', message)
    return NextResponse.json({ error: 'market-drop falló', detail: message }, { status: 500 })
  }
}
