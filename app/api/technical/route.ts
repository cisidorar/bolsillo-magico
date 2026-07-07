import { NextResponse } from 'next/server'
import { getServerSession, createClient } from '@/lib/supabase/server'
import { analyze, type TechnicalAnalysis } from '@/lib/technical'
import { syncTicker, readCandles } from '@/lib/price-providers'

// ── Análisis técnico desde price_history (BD-first) ──────────────────────────
// Los precios viven en Supabase (pipeline OHLCV): aquí solo se leen y, si el
// ticker no tiene historia o está desactualizado, se dispara un lazy-sync.

const TICKER_RE = /^[A-Z0-9.\-]{1,12}$/

// ── Equilibrio de frescura vs cuota (30 favoritos, decisión jul 2026) ────────
// Los cierres diarios cambian UNA vez al día: se sincroniza solo cuando falta
// el último día hábil completo. Efecto: la primera visita después de un cierre
// dispara ≤1 sync por ticker (secuencial desde el cliente); el resto del día
// y el fin de semana, cero requests externos — pero nunca se trabaja con velas
// de hace 4 días como antes (STALE_D=4).
/** Último día hábil COMPLETO esperado: ayer, saltando fin de semana (feriados
 *  US no se modelan — esos días el sync extra devuelve 0 filas y no inserta). */
function lastExpectedClose(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 1)   // el cierre de hoy aún no existe
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

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

    // 2. ¿Falta historia o falta el último cierre hábil? → lazy-sync
    const lastDate = candles.dates[candles.dates.length - 1] ?? null
    let needsSync = force || candles.closes.length < 30 || (lastDate !== null && lastDate < lastExpectedClose())

    // Throttle de reintentos: si un sync reciente no consiguió el cierre
    // esperado (feriado US, proveedor caído), no volver a golpear la cadena
    // en cada visita — como mucho cada SYNC_RETRY_H horas por ticker.
    const SYNC_RETRY_H = 6
    if (needsSync && !force) {
      const { data: marker } = await supabase
        .from('price_cache')
        .select('fetched_at')
        .eq('ticker', `${symbol}_SYNCTRY`)
        .maybeSingle()
      if (marker && Date.now() - new Date(marker.fetched_at).getTime() < SYNC_RETRY_H * 3_600_000) {
        needsSync = false
      }
    }

    let syncReasons: string[] = []
    if (needsSync) {
      const res = await syncTicker(supabase, symbol)
      syncReasons = res.reasons
      if (res.inserted > 0) candles = await readCandles(supabase, symbol)
      // Marcar el intento (haya traído filas o no) para el throttle de arriba
      await supabase.from('price_cache').upsert({
        ticker: `${symbol}_SYNCTRY`, price: 0, fetched_at: new Date().toISOString(),
      })
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
