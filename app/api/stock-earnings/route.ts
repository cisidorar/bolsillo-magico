import { NextResponse } from 'next/server'
import { createClient, getServerSession } from '@/lib/supabase/server'
import type { EarningsInfo } from '@/lib/earnings'

// ── Próxima fecha de resultados por ticker (D3, roadmap de calidad de decisión) ──
// El motor técnico es 100% ciego a eventos: podía sugerir "compra $450 de
// INTC ahora" la víspera de resultados trimestrales — el momento donde el
// gráfico menos predice y un gap de apertura puede saltarse la alarma de
// salida entera. Finnhub (misma API key que /api/stock-news) expone el
// calendario de resultados por símbolo, disponible en el plan free. Cache
// 24 h por ticker en price_cache (mismo patrón que /api/stock-news: clave
// sintética, el payload viaja en history7d).

export const maxDuration = 15

const TICKER_RE  = /^[A-Z0-9.\-]{1,12}$/
const EARNINGS_TTL_H = 24
const LOOKAHEAD_D = 120   // suficiente para siempre encontrar el próximo trimestre

export async function GET(request: Request) {
  const user = await getServerSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const symbol = (searchParams.get('symbol') ?? '').trim().toUpperCase()
  if (!TICKER_RE.test(symbol)) return NextResponse.json({ error: 'Símbolo inválido' }, { status: 400 })

  try {
    const supabase = await createClient()
    const cacheKey = `${symbol}_EARNINGS`

    const { data: cached } = await supabase
      .from('price_cache')
      .select('history7d, fetched_at')
      .eq('ticker', cacheKey)
      .maybeSingle()
    if (cached?.history7d && Date.now() - new Date(cached.fetched_at).getTime() < EARNINGS_TTL_H * 3_600_000) {
      return NextResponse.json(cached.history7d as unknown as EarningsInfo)
    }

    const fhKey = process.env.FINNHUB_API_KEY
    if (!fhKey) return NextResponse.json({ error: 'Servicio de resultados no configurado' }, { status: 503 })

    const from = new Date().toISOString().slice(0, 10)
    const to   = new Date(Date.now() + LOOKAHEAD_D * 86_400_000).toISOString().slice(0, 10)
    const fhRes = await fetch(
      `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&symbol=${symbol}&token=${fhKey}`,
      { cache: 'no-store' },
    )
    // Symbol calendar es un endpoint del plan free — si igual devuelve 403
    // (cuenta sin acceso), se cachea "sin dato" para no reintentar cada visita.
    if (!fhRes.ok) {
      const empty: EarningsInfo = { symbol, nextDate: null, asOf: new Date().toISOString() }
      await supabase.from('price_cache').upsert({
        ticker: cacheKey, price: 0, history7d: empty as unknown as object, fetched_at: empty.asOf,
      })
      return NextResponse.json(empty)
    }

    const raw = await fhRes.json() as { earningsCalendar?: { date?: string; symbol?: string }[] }
    const dates = (raw.earningsCalendar ?? [])
      .filter(e => e.date && e.symbol === symbol)
      .map(e => e.date as string)
      .sort()

    const result: EarningsInfo = {
      symbol,
      nextDate: dates[0] ?? null,
      asOf: new Date().toISOString(),
    }
    await supabase.from('price_cache').upsert({
      ticker: cacheKey, price: 0, history7d: result as unknown as object, fetched_at: result.asOf,
    })
    return NextResponse.json(result)
  } catch (err) {
    console.error('[stock-earnings] unhandled:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
