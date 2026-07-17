import { NextResponse } from 'next/server'
import { getServerSession, createClient } from '@/lib/supabase/server'
import { readCandles } from '@/lib/price-providers'
import { backtestSignals, type SignalBacktestResult } from '@/lib/signal-backtest'

// ── Evaluación de señales a posteriori (Fase 2.3 del roadmap) ────────────────
// No dispara sync: usa lo que ya haya en price_history (el ticker debe haberse
// visto antes en /api/technical o el cron). No tiene sentido evaluar señales
// sobre una historia que ni siquiera se sincronizó.

const TICKER_RE = /^[A-Z0-9.\-]{1,12}$/

export const maxDuration = 30

export interface SignalBacktestResponse {
  ticker: string
  result: SignalBacktestResult
}

export async function GET(request: Request) {
  const user = await getServerSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const symbol = (searchParams.get('symbol') ?? '').trim().toUpperCase()
  if (!TICKER_RE.test(symbol)) return NextResponse.json({ error: 'Símbolo inválido' }, { status: 400 })

  try {
    const supabase = await createClient()
    const candles = await readCandles(supabase, symbol)
    if (candles.closes.length < 260) {
      return NextResponse.json(
        { error: 'Sin historia suficiente todavía (se necesita ~1 año de datos para evaluar señales)' },
        { status: 502 },
      )
    }
    const result = backtestSignals(candles)
    return NextResponse.json({ ticker: symbol, result } satisfies SignalBacktestResponse, {
      // El resultado solo cambia con el cierre del día — igual que /api/technical
      headers: { 'Cache-Control': 'private, max-age=3600' },
    })
  } catch (err) {
    console.error('[signal-backtest] unhandled error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
