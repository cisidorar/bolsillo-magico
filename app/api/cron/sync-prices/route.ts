import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { syncTicker } from '@/lib/price-providers'

// ── Cron diario: sincroniza OHLCV de todos los tickers en uso ────────────────
// Programado en vercel.json (22:30 UTC ≈ post-cierre NYSE). Protegido con
// CRON_SECRET (Vercel lo manda como Authorization: Bearer <secret>).
// Usa service role para escribir price_history sin sesión de usuario.

export const maxDuration = 60

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  const auth   = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Supabase env faltante' }, { status: 503 })
  const supabase = createAdminClient(url, key)

  // Tickers en uso: watchlist ∪ posiciones (todos los usuarios)
  const [{ data: wl }, { data: pos }] = await Promise.all([
    supabase.from('watchlist').select('ticker'),
    supabase.from('stock_positions').select('ticker'),
  ])
  const tickers = [...new Set([
    ...(wl ?? []).map(r => r.ticker as string),
    ...(pos ?? []).map(r => r.ticker as string),
  ])]

  const results = []
  for (const t of tickers) {
    results.push(await syncTicker(supabase, t))
    // Pausa corta: Tiingo permite 50/hora — con <50 tickers no hay riesgo,
    // pero seamos amables con los fallbacks
    await new Promise(res => setTimeout(res, 300))
  }

  const ok     = results.filter(r => r.source !== null).length
  const failed = results.filter(r => r.source === null)
  console.log(`[sync-prices] ${ok}/${tickers.length} ok`, failed.map(f => `${f.ticker}: ${f.reasons.join('·')}`))

  return NextResponse.json({
    synced: ok,
    total:  tickers.length,
    failed: failed.map(f => ({ ticker: f.ticker, reasons: f.reasons })),
  })
}
