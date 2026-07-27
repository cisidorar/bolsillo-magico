import { NextResponse } from 'next/server'
import { createClient, getServerSession } from '@/lib/supabase/server'
import { fetchEarnings } from '@/lib/earnings-fetch'

// ── Próxima fecha de resultados por ticker (D3, roadmap de calidad de decisión) ──
// El motor técnico es 100% ciego a eventos: podía sugerir "compra $450 de
// INTC ahora" la víspera de resultados trimestrales — el momento donde el
// gráfico menos predice y un gap de apertura puede saltarse la alarma de
// salida entera. Finnhub (misma API key que /api/stock-news) expone el
// calendario de resultados por símbolo, disponible en el plan free. Cache
// 24 h por ticker en price_cache (mismo patrón que /api/stock-news: clave
// sintética, el payload viaja en history7d).

export const maxDuration = 15

const TICKER_RE = /^[A-Z0-9.\-]{1,12}$/

export async function GET(request: Request) {
  const user = await getServerSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const symbol = (searchParams.get('symbol') ?? '').trim().toUpperCase()
  if (!TICKER_RE.test(symbol)) return NextResponse.json({ error: 'Símbolo inválido' }, { status: 400 })

  try {
    const supabase = await createClient()
    // Fetch + cache 24h en price_cache — lógica compartida con el informe
    // semanal (S2), que necesita pedir earnings de varios tickers server-side
    // sin pasar por esta misma ruta HTTP. Ver lib/earnings-fetch.ts.
    const result = await fetchEarnings(supabase, symbol)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[stock-earnings] unhandled:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
