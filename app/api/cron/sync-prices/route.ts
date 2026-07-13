import { NextResponse } from 'next/server'
import { createClient as createAdminClient, type SupabaseClient } from '@supabase/supabase-js'
import { syncTicker, readCandles } from '@/lib/price-providers'
import { analyze, type TechnicalAnalysis } from '@/lib/technical'

// ── Cron diario: sincroniza OHLCV + arma las señales del digest diario ───────
// Programado en vercel.json (22:30 UTC ≈ post-cierre NYSE). Protegido con
// CRON_SECRET (Vercel lo manda como Authorization: Bearer <secret>).
// Usa service role para escribir sin sesión de usuario.
//
// analyze() vive acá (Node/Next) y no en la Edge Function de Supabase (Deno) a
// propósito: es la única fuente de verdad del cálculo técnico — la Edge
// Function que envía el correo (notify-watchlist-digest) solo lee daily_signals
// y arma el HTML, no recalcula nada.

export const maxDuration = 60

function fmtUSD(n: number): string {
  return 'US$' + n.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Días hábiles NYSE ─────────────────────────────────────────────────────────
// Sin esto, un cron que corre todos los días (fines de semana incluidos)
// termina reescribiendo daily_signals con el precio de cierre del viernes bajo
// la fecha del sábado/domingo — y el digest manda un correo con "novedades"
// que en realidad son de dos días atrás. Se corta acá, antes de sincronizar
// nada: ni se gastan cupos de las APIs de precios ni se generan señales.
// Feriados NYSE por año (actualizar ANTES de cada año nuevo —
// https://www.nyse.com/markets/hours-calendars). Si el año no está cargado,
// se loguea un error visible en vez de fallar silencioso corriendo en feriados.
const NYSE_HOLIDAYS: Record<number, string[]> = {
  2026: [
    '2026-01-01', // Año Nuevo
    '2026-01-19', // Martin Luther King Jr. Day
    '2026-02-16', // Washington's Birthday
    '2026-04-03', // Good Friday
    '2026-05-25', // Memorial Day
    '2026-06-19', // Juneteenth
    '2026-07-03', // Independence Day (4 de julio cae sábado, se observa el viernes)
    '2026-09-07', // Labor Day
    '2026-11-26', // Thanksgiving
    '2026-12-25', // Navidad
  ],
  2027: [
    '2027-01-01', // Año Nuevo
    '2027-01-18', // Martin Luther King Jr. Day
    '2027-02-15', // Washington's Birthday
    '2027-03-26', // Good Friday
    '2027-05-31', // Memorial Day
    '2027-06-18', // Juneteenth (19 cae sábado, se observa el viernes)
    '2027-07-05', // Independence Day (4 de julio cae domingo, se observa el lunes)
    '2027-09-06', // Labor Day
    '2027-11-25', // Thanksgiving
    '2027-12-24', // Navidad (25 cae sábado, se observa el viernes)
  ],
}

function isTradingDay(): boolean {
  const et  = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const day = et.getDay()   // 0=Dom … 6=Sáb
  if (day === 0 || day === 6) return false
  const y = et.getFullYear(), m = String(et.getMonth() + 1).padStart(2, '0'), d = String(et.getDate()).padStart(2, '0')
  const holidays = NYSE_HOLIDAYS[y]
  if (!holidays) {
    console.error(`[cron/sync-prices] ⚠ Sin feriados NYSE cargados para ${y}: el cron correrá también en feriados y el digest puede reportar "novedades" viejas. Actualizar NYSE_HOLIDAYS.`)
    return true
  }
  return !holidays.includes(`${y}-${m}-${d}`)
}

interface WatchlistRow {
  id:               string
  user_id:          string
  ticker:           string
  target_price:     number | null
  target_direction: 'above' | 'below' | null
  target_notified:  boolean
}

interface SignalRow {
  user_id:    string
  ticker:     string
  kind:       'buy' | 'sell' | 'caution' | 'target' | 'hold'
  message:    string
  price:      number
  change_pct: number
  strong:     boolean
  watch:      boolean
}

/** Frase corta de estado para tickers en neutral — para "el resto de tu lista"
 *  del digest, que ahora muestra TODA la watchlist, no solo lo accionable. */
function holdLabel(analysis: TechnicalAnalysis): string {
  if (analysis.signals.some(s => s.kind === 'range_squeeze'))   return 'dentro de rango'
  if (analysis.signals.some(s => s.kind === 'near_support'))    return 'cerca de soporte'
  if (analysis.signals.some(s => s.kind === 'near_resistance')) return 'cerca de resistencia'
  if (analysis.trend.aboveSma200 === true)  return 'tendencia estable'
  if (analysis.trend.aboveSma200 === false) return 'consolidando'
  return 'lateral'
}

/** Descripción larga (título + detalle, ya en lenguaje cotidiano) del gatillo
 *  técnico más relevante para una señal fuerte — para la tarjeta destacada
 *  del digest. Cae a la etiqueta corta del rating si no hay un gatillo con el
 *  tono esperado. */
function strongDetail(analysis: TechnicalAnalysis, tone: 'mint' | 'coral'): string {
  const sig = analysis.signals.find(s => s.trigger && s.tone === tone) ?? analysis.signals.find(s => s.tone === tone)
  return sig ? `${sig.title}. ${sig.detail}` : analysis.rating.action
}

/** Señales de rating (compra/venta/toma de ganancias/mantener) + precio
 *  objetivo, para un ticker ya analizado, cruzado contra cada fila de
 *  watchlist que lo sigue. Genera SIEMPRE una fila "primaria" por ticker
 *  (buy/sell/caution/hold, mutuamente excluyentes) — el digest ahora muestra
 *  la watchlist completa, no solo lo accionable — más una fila 'target'
 *  aparte si corresponde (evento independiente, puede coexistir con la primaria). */
function buildSignals(
  analysis:  TechnicalAnalysis,
  wlRows:    WatchlistRow[],
  ownedByUser: Set<string>,   // `${user_id}:${ticker}`
  changePct: number,
): { signals: SignalRow[]; notifiedIds: string[] } {
  const signals: SignalRow[] = []
  const notifiedIds: string[] = []

  for (const row of wlRows) {
    const owned = ownedByUser.has(`${row.user_id}:${row.ticker}`)
    const base = { user_id: row.user_id, ticker: row.ticker, price: analysis.price, change_pct: changePct }

    // Rating: se reporta TODOS los días que siga vigente (recordatorio diario,
    // no evento único) — compra siempre relevante, venta/toma solo con posición.
    const l = analysis.rating.label
    if (l === 'compra' || l === 'compra_fuerte') {
      const strong = l === 'compra_fuerte'
      signals.push({ ...base, kind: 'buy', strong, watch: false, message: strong ? strongDetail(analysis, 'mint') : analysis.rating.action })
    } else if (owned && (l === 'venta' || l === 'venta_fuerte')) {
      const strong = l === 'venta_fuerte'
      signals.push({ ...base, kind: 'sell', strong, watch: false, message: strong ? strongDetail(analysis, 'coral') : analysis.rating.action })
    } else if (owned && analysis.rating.caution) {
      signals.push({ ...base, kind: 'caution', strong: false, watch: true, message: `Débil · ${holdLabel(analysis)}` })
    } else {
      signals.push({ ...base, kind: 'hold', strong: false, watch: analysis.watch.length > 0, message: holdLabel(analysis) })
    }

    // Precio objetivo: evento único — se avisa una vez y se marca target_notified.
    if (row.target_price !== null && !row.target_notified) {
      const dir     = row.target_direction ?? (owned ? 'above' : 'below')
      const reached = dir === 'above' ? analysis.price >= row.target_price : analysis.price <= row.target_price
      if (reached) {
        const verbo = dir === 'above' ? 'subió' : 'bajó'
        signals.push({
          ...base, kind: 'target', strong: true, watch: false,
          message: `Llegó a tu precio de ${owned ? 'salida' : 'entrada'}: ${verbo} a ${fmtUSD(row.target_price)}`,
        })
        notifiedIds.push(row.id)
      }
    }
  }

  return { signals, notifiedIds }
}

async function computeDailySignals(supabase: SupabaseClient) {
  const [{ data: wl }, { data: pos }] = await Promise.all([
    supabase.from('watchlist').select('id, user_id, ticker, target_price, target_direction, target_notified'),
    supabase.from('stock_positions').select('user_id, ticker'),
  ])
  const wlRows = (wl ?? []) as WatchlistRow[]
  const ownedByUser = new Set((pos ?? []).map(p => `${p.user_id}:${p.ticker}`))

  // Un ticker puede seguirlo más de un usuario — analyze() se corre 1 sola vez por ticker.
  const tickers = [...new Set(wlRows.map(r => r.ticker))]

  const allSignals: SignalRow[] = []
  const allNotifiedIds: string[] = []

  for (const ticker of tickers) {
    try {
      const candles = await readCandles(supabase, ticker)
      if (candles.closes.length < 30) continue   // sin historia suficiente, no se puede opinar
      const analysis = analyze(candles)
      const closes = candles.closes
      const changePct = closes.length >= 2
        ? Math.round(((closes[closes.length - 1] - closes[closes.length - 2]) / closes[closes.length - 2]) * 1000) / 10
        : 0
      const rowsForTicker = wlRows.filter(r => r.ticker === ticker)
      const { signals, notifiedIds } = buildSignals(analysis, rowsForTicker, ownedByUser, changePct)
      allSignals.push(...signals)
      allNotifiedIds.push(...notifiedIds)
    } catch (err) {
      console.error(`[sync-prices] analyze() falló para ${ticker}:`, err)
    }
  }

  if (allSignals.length > 0) {
    const { error } = await supabase.from('daily_signals').upsert(allSignals, {
      onConflict: 'user_id,ticker,kind,signal_date',
      ignoreDuplicates: true,   // ya se avisó hoy — no pisar/duplicar
    })
    if (error) console.error('[sync-prices] daily_signals upsert error:', error.message)
  }
  if (allNotifiedIds.length > 0) {
    const { error } = await supabase.from('watchlist').update({ target_notified: true }).in('id', allNotifiedIds)
    if (error) console.error('[sync-prices] target_notified update error:', error.message)
  }

  return { signals: allSignals.length, targetsReached: allNotifiedIds.length }
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  const auth   = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isTradingDay()) {
    return NextResponse.json({ skipped: 'non-trading day (fin de semana o feriado NYSE)' })
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

  // Señales del digest diario — solo tiene sentido si hay favoritos con historia
  const digest = wl && wl.length > 0 ? await computeDailySignals(supabase) : { signals: 0, targetsReached: 0 }

  return NextResponse.json({
    synced: ok,
    total:  tickers.length,
    failed: failed.map(f => ({ ticker: f.ticker, reasons: f.reasons })),
    digest,
  })
}
