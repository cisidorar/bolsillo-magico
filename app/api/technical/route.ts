import { NextResponse } from 'next/server'
import { getServerSession, createClient } from '@/lib/supabase/server'
import { analyze, type TechnicalAnalysis } from '@/lib/technical'
import { syncTicker, readCandles } from '@/lib/price-providers'

// ── Análisis técnico desde price_history (BD-first) ──────────────────────────
// Los precios viven en Supabase (pipeline OHLCV): aquí solo se leen y, si el
// ticker no tiene historia o está desactualizado, se dispara un lazy-sync.

const TICKER_RE = /^[A-Z0-9.\-]{1,12}$/
const STALE_D   = 4   // si el último cierre tiene >4 días, sincronizar (cubre findes largos)

// Sin maxDuration, Vercel corta la función con su default de plataforma antes
// de que la cadena de proveedores (hasta 4, ~10s c/u) alcance a responder con
// el 502 informativo — el usuario ve un error genérico sin motivo.
export const maxDuration = 30

export interface TechnicalResponse {
  ticker:   string
  analysis: TechnicalAnalysis
}

export async function GET(request: Request) {
  const user = await getServerSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const symbol = (searchParams.get('symbol') ?? '').trim().toUpperCase()
  const force  = searchParams.get('force') === '1'
  if (!TICKER_RE.test(symbol)) return NextResponse.json({ error: 'Símbolo inválido' }, { status: 400 })

  try {
    const supabase = await createClient()

    // 1. Leer de la BD
    let candles = await readCandles(supabase, symbol)

    // 2. ¿Falta historia o está vieja? → lazy-sync con la cadena de proveedores
    const lastDate = candles.dates[candles.dates.length - 1] ?? null
    const staleCut = new Date(Date.now() - STALE_D * 86_400_000).toISOString().slice(0, 10)
    const needsSync = force || candles.closes.length < 30 || (lastDate !== null && lastDate < staleCut)

    let syncReasons: string[] = []
    if (needsSync) {
      const res = await syncTicker(supabase, symbol)
      syncReasons = res.reasons
      if (res.inserted > 0) candles = await readCandles(supabase, symbol)
    }

    if (candles.closes.length < 30) {
      return NextResponse.json(
        {
          error: 'Sin historia suficiente para este símbolo',
          detail: syncReasons.length > 0 ? syncReasons.join(' · ') : 'verifica el ticker',
        },
        { status: 502 },
      )
    }

    const analysis = analyze(candles)
    return NextResponse.json({ ticker: symbol, analysis } satisfies TechnicalResponse, {
      headers: { 'Cache-Control': 'private, max-age=3600' },
    })
  } catch (err) {
    console.error('[technical] unhandled error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
