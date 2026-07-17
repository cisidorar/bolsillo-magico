import { NextResponse } from 'next/server'
import { createClient as createAdminClient, type SupabaseClient } from '@supabase/supabase-js'
import { syncTicker, readCandles } from '@/lib/price-providers'
import { analyze, type TechnicalAnalysis } from '@/lib/technical'
import { computeAndSnapshotNetWorth, reconcileClosedMonthDebt } from '@/lib/net-worth'
import { getNowChile } from '@/lib/utils'

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

// ── FX USD/CLP para el snapshot de patrimonio ────────────────────────────────
// Antes, USDCLP en price_cache solo se refrescaba cuando un usuario abría
// /inversiones (vía /api/stock-price) — si el snapshot corre desde el cron
// sin que nadie haya abierto la app ese día, usaba un FX potencialmente viejo
// o inexistente y las acciones quedaban sin valorizar (stocksPriced=false).
// Frankfurter no requiere API key (mismo proveedor que usa el fallback de
// /api/stock-price), así que se puede refrescar acá de forma autocontenida.
async function refreshUsdClp(supabase: SupabaseClient): Promise<void> {
  try {
    const r = await fetch('https://api.frankfurter.app/latest?from=USD&to=CLP', { cache: 'no-store' })
    if (!r.ok) return
    const d = await r.json()
    const price = d?.rates?.CLP as number | undefined
    if (!price) return
    const { error } = await supabase.from('price_cache').upsert(
      { ticker: 'USDCLP', price, change_pct: 0, name: 'USD/CLP', history7d: null, fetched_at: new Date().toISOString() },
      { onConflict: 'ticker' },
    )
    if (error) console.error('[sync-prices] usdclp cache error:', error.message)
  } catch (err) {
    console.error('[sync-prices] refreshUsdClp falló:', err)
  }
}

// ── P1/F4 fix: snapshot de patrimonio neto desde el cron (no depende de que
// el usuario abra /analisis). Corre TODOS los días (a diferencia del sync de
// precios, que se salta fines de semana/feriados NYSE) porque el usuario
// puede agregar ahorros, depósitos o pagar cuotas cualquier día — y cada día
// sin snapshot es historia perdida para siempre (los meses pasados quedan
// congelados). computeAndSnapshotNetWorth ya protege el caso sin precio/FX
// en caché (no persiste un mes subvalorado).
async function snapshotAllNetWorths(supabase: SupabaseClient): Promise<{ ok: number; failed: number }> {
  const [{ data: stockUsers }, { data: savingsUsers }, { data: depositUsers }, { data: usdUsers }] = await Promise.all([
    supabase.from('stock_positions').select('user_id'),
    supabase.from('savings_accounts').select('user_id'),
    supabase.from('term_deposits').select('user_id'),
    supabase.from('usd_purchases').select('user_id'),
  ])
  const userIds = new Set<string>([
    ...(stockUsers ?? []).map(r => r.user_id as string),
    ...(savingsUsers ?? []).map(r => r.user_id as string),
    ...(depositUsers ?? []).map(r => r.user_id as string),
    ...(usdUsers ?? []).map(r => r.user_id as string),
  ])

  const { now } = getNowChile()
  let ok = 0, failed = 0
  for (const userId of userIds) {
    try {
      await computeAndSnapshotNetWorth(supabase, userId, now)
      // Ventana de gracia: el usuario carga gastos ~1 vez por semana, fechados
      // al día real — la última semana de un mes puede no estar cargada al
      // cierre. Corrige debt_clp/net_clp del mes recién cerrado durante los
      // primeros días del mes siguiente, sin tocar los activos ya congelados.
      await reconcileClosedMonthDebt(supabase, userId, now)
      ok++
    } catch (err) {
      failed++
      console.error(`[sync-prices] snapshot patrimonio falló para user ${userId}:`, err)
    }
  }
  return { ok, failed }
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

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Supabase env faltante' }, { status: 503 })
  const supabase = createAdminClient(url, key)

  // P1/F4: snapshot de patrimonio SIEMPRE corre, incluso fines de semana o
  // feriados NYSE (a diferencia del sync de precios) — el usuario puede
  // ahorrar, pagar cuotas o depositar cualquier día, y un mes sin snapshot
  // es historia perdida para siempre (los meses pasados quedan congelados).
  await refreshUsdClp(supabase)
  const netWorthSnapshots = await snapshotAllNetWorths(supabase)

  if (!isTradingDay()) {
    return NextResponse.json({ skipped: 'non-trading day (fin de semana o feriado NYSE)', netWorthSnapshots })
  }

  // Tickers en uso: watchlist ∪ posiciones (todos los usuarios)
  const [{ data: wl }, { data: pos }] = await Promise.all([
    supabase.from('watchlist').select('ticker'),
    supabase.from('stock_positions').select('ticker'),
  ])
  const tickers = [...new Set([
    ...(wl ?? []).map(r => r.ticker as string),
    ...(pos ?? []).map(r => r.ticker as string),
  ])]

  // Sincronizar TODOS los tickers en paralelo, no uno por uno: en serie, si
  // varios caen a la cadena de fallbacks (hasta ~7s por proveedor × 4
  // proveedores), la función entera puede superar el límite de 60s de Vercel
  // — y como las señales del digest se calculan DESPUÉS de sincronizar todo,
  // un corte a mitad de camino deja daily_signals vacía esa noche aunque
  // price_history ya tenga lo que alcanzó a guardar antes del corte. En
  // paralelo, el tiempo total lo marca el ticker más lento, no la suma de
  // todos — y Tiingo permite 50 req/hora, muy por encima de este volumen.
  const results = await Promise.all(tickers.map(t => syncTicker(supabase, t)))

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
    netWorthSnapshots,
  })
}
