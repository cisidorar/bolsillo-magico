import { NextResponse } from 'next/server'
import { createClient as createAdminClient, type SupabaseClient } from '@supabase/supabase-js'
import { syncTicker, readCandles } from '@/lib/price-providers'
import { analyze, positionSizeUsd, type TechnicalAnalysis, type PriceZone } from '@/lib/technical'
import { computeAndSnapshotNetWorth, reconcileClosedMonthDebt } from '@/lib/net-worth'
import { computeConviction, isActionableBuyNow, computeMarketRegime, riskRewardRatio, type ConvictionTier, type MarketRegime } from '@/lib/conviction'
import { backtestSignals, type LabelStat } from '@/lib/signal-backtest'
import { getNowChile } from '@/lib/utils'
import { nextFomcMeeting, fedRateSentence } from '@/lib/market-week'
import { computeRatePath } from '@/lib/rate-path'
import { fetchAllMacroSeries } from '@/lib/macro-fetch'
import { invokeEdgeFunction } from '@/lib/invoke-edge-function'

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
// Gotcha documentado por Vercel para crons que "no aparecen" en los logs:
// sin esto Next puede servir una respuesta cacheada de una invocación
// anterior en vez de correr el handler de nuevo cada vez.
// https://vercel.com/kb/guide/troubleshooting-vercel-cron-jobs
export const dynamic = 'force-dynamic'

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
  // Convicción/zona de precio (jul 2026): mismo número y misma etiqueta que
  // ConvictionChip/PriceZoneChip en la app — antes el digest solo mandaba el
  // gatillo técnico puro (kind='buy') sin este contexto, y un ticker con
  // gatillo pero convicción baja ("Caro") se veía en el correo con el mismo
  // peso que la mejor compra del día real. Se llenan después de armar la fila
  // (computeDailySignals), quedan null si por lo que sea no se pudo calcular.
  conviction_score?: number | null
  conviction_tier?:  ConvictionTier | null
  price_zone?:       PriceZone | null
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
 *  técnico más relevante detrás de una señal de compra/venta — para que el
 *  digest y "Para revisar hoy" digan POR QUÉ, no solo repitan la palabra
 *  "Compra"/"Venta" que ya está en el badge. Antes esto solo se llamaba para
 *  señales "fuertes"; una señal normal (compra/venta sin "fuerte") mostraba
 *  literalmente `analysis.rating.action` — el mismo texto del badge de
 *  arriba, cero información nueva (detectado por Cas con un correo real:
 *  "SEÑAL DE VENTA" seguido de "Venta" abajo). Cae a la etiqueta corta del
 *  rating solo si de verdad no hay ningún gatillo con el tono esperado. */
function signalDetail(analysis: TechnicalAnalysis, tone: 'mint' | 'coral'): string {
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
  // ago 2026 (bug reportado por Cas con capturas: INTC/SOXL con "SEÑAL DE
  // COMPRA" en el correo mientras la app mostraba el chip "Toma de
  // ganancias" para el MISMO ticker el MISMO día — "en una parte dice
  // vende y en el correo compra"). La causa: este correo decidía 'buy'
  // mirando solo analysis.rating.label (gatillo técnico puro), mientras
  // Radar.tsx (actionFlag) decide 'buy' con isActionableBuyNow(conviction,
  // regime) y 'caution' con analysis.sell.some(t => t.now) — el hotZone
  // completo (RSI sobrecomprado, distancia a la media, divergencia bajista,
  // no solo `caution`). Dos criterios distintos para la misma pregunta. Se
  // alinea acá al criterio de la app — mismo ticker, mismo día, misma
  // respuesta en los dos canales.
  conviction: ReturnType<typeof computeConviction> | null,
  marketRegime: MarketRegime | null,
): { signals: SignalRow[]; notifiedIds: string[] } {
  const signals: SignalRow[] = []
  const notifiedIds: string[] = []

  const l = analysis.rating.label
  const isBuy   = conviction !== null && isActionableBuyNow(analysis, conviction, marketRegime)
  const isSell  = l === 'venta' || l === 'venta_fuerte'
  const sellNow = analysis.sell.some(t => t.now)

  for (const row of wlRows) {
    const owned = ownedByUser.has(`${row.user_id}:${row.ticker}`)
    const base = { user_id: row.user_id, ticker: row.ticker, price: analysis.price, change_pct: changePct }

    // Mismo orden de prioridad que actionFlag() en Radar.tsx: buy > sell > caution > hold.
    if (isBuy) {
      const strong = conviction!.tier === 'compra_fuerte'
      signals.push({ ...base, kind: 'buy', strong, watch: false, message: signalDetail(analysis, 'mint') })
    } else if (owned && isSell) {
      const strong = l === 'venta_fuerte'
      signals.push({ ...base, kind: 'sell', strong, watch: false, message: signalDetail(analysis, 'coral') })
    } else if (owned && sellNow) {
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
//
// ago 2026 (Cas, "Acciones no sumadas" permanente en Patrimonio pese a
// clickear "Actualizar precios ahora" una y otra vez): la causa real es que
// Frankfurter usa las tasas de referencia del BCE, que NO publican CLP —
// `d.rates?.CLP` siempre venía undefined, esta función (y su gemela en
// /api/stock-price) llevaban desde que existen fallando en silencio y
// price_cache nunca tuvo una fila 'USDCLP'. Se cambia a mindicador.cl/api/dolar
// (dólar observado, Banco Central de Chile) — mismo proveedor sin API key que
// ya usa lib/cl-indicators.ts para UF/IPC, y de paso es la tasa "oficial"
// chilena en vez de una cruzada vía EUR.
async function refreshUsdClp(supabase: SupabaseClient): Promise<void> {
  try {
    const r = await fetch('https://mindicador.cl/api/dolar', { cache: 'no-store' })
    if (!r.ok) return
    const d = await r.json()
    const price = d?.serie?.[0]?.valor as number | undefined
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

// ── Aviso "la Fed decide tasas en 7 días" (a pedido de Cas, jul 2026) ────────
// Corre TODOS los días, no solo días hábiles NYSE (a diferencia del resto de
// este cron) — el calendario de la Fed no respeta el mercado de acciones, y
// el aviso tiene que existir 7 días antes sin importar si eso cae un fin de
// semana. Barato: nextFomcMeeting() es aritmética de fechas, y
// fetchAllMacroSeries() ya cachea 24h en price_cache.
//
// Se persiste (no se manda el correo desde acá): notify-fomc-reminder (Edge
// Function, Deno) lee esta fila y arma el HTML — mismo split que
// weekly_reports/daily_decisions, porque Deno no puede importar
// lib/market-week.ts ni lib/rate-path.ts.
async function updateFomcAlert(supabase: SupabaseClient): Promise<{ meetingDate: string } | null> {
  try {
    const { dateStr: todayCL } = getNowChile()
    const meetingDate = nextFomcMeeting(todayCL, 7)
    if (!meetingDate) return null

    const macro   = await fetchAllMacroSeries(supabase)
    const dffObs  = macro.DFF?.observations ?? []
    const dgs2Obs = macro.DGS2?.observations ?? []
    if (dffObs.length === 0) return null   // sin FRED_API_KEY o sin datos: no hay frase que mandar

    const ratePath = dgs2Obs.length > 0
      ? computeRatePath(dgs2Obs[dgs2Obs.length - 1].value, dffObs[dffObs.length - 1].value)
      : null
    const sentence = fedRateSentence(dffObs, ratePath)
    if (!sentence) return null

    const { error } = await supabase.from('fomc_alerts').upsert({
      meeting_date:  meetingDate,
      sentence,
      direction:     ratePath?.direction ?? 'estable',
      implied_moves: ratePath?.impliedMoves ?? 0,
      computed_at:   new Date().toISOString(),
    }, { onConflict: 'meeting_date' })
    if (error) { console.error('[sync-prices] fomc_alerts upsert error:', error.message); return null }

    return { meetingDate }
  } catch (err) {
    console.error('[sync-prices] updateFomcAlert falló:', err)
    return null
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

// ── Curva diaria del valor de la cartera (pedido de Cas, ago 2026) ──────────
// A diferencia de computePortfolioHistory (lib/portfolio-history.ts), que
// RECONSTRUYE el pasado con las posiciones de HOY hacia atrás, esto guarda el
// valor REAL del día: posiciones al cierre de HOY + saldo de billetera
// disponible HOY. Mismo cálculo que "Valor del portafolio"/"Billetera" en
// Radar.tsx (portfolioValueUsd = totalValueUsd + max(0, walletAvailable)) —
// portado acá porque ese cálculo vive en un client component con `quotes` en
// vivo, y el cron necesita la versión server-side con el cierre del día.
// Corre solo en días hábiles NYSE (después del sync de precios de este mismo
// run, así `price_history` ya tiene el cierre de hoy) — no tiene sentido
// duplicar el mismo punto en fines de semana/feriados, cuando nada cambió.
async function snapshotAllPortfolioValues(supabase: SupabaseClient, syncedTickers: string[]): Promise<{ ok: number; failed: number }> {
  const [{ data: posRows }, { data: usdRows }] = await Promise.all([
    supabase.from('stock_positions').select('user_id, ticker, shares, avg_cost_usd, wallet_cost_usd'),
    supabase.from('usd_purchases').select('user_id, usd_amount'),
  ])
  const positions = (posRows ?? []) as { user_id: string; ticker: string; shares: number; avg_cost_usd: number; wallet_cost_usd: number | null }[]
  if (positions.length === 0) return { ok: 0, failed: 0 }

  const userIds = [...new Set(positions.map(p => p.user_id))]

  // Cierre más reciente por ticker — ya sincronizado arriba en este mismo run,
  // se lee de price_history en vez de price_cache porque este último solo se
  // actualiza para tickers en watchlist (computeDailySignals), no para todas
  // las posiciones de todos los usuarios.
  const { data: priceRows } = await supabase
    .from('price_history')
    .select('ticker, date, close')
    .in('ticker', syncedTickers)
    .order('date', { ascending: false })
  const priceByTicker = new Map<string, number>()
  for (const r of (priceRows ?? []) as { ticker: string; close: number }[]) {
    if (!priceByTicker.has(r.ticker)) priceByTicker.set(r.ticker, Number(r.close))
  }

  const walletByUser = new Map<string, number>()
  for (const r of (usdRows ?? []) as { user_id: string; usd_amount: number }[]) {
    walletByUser.set(r.user_id, (walletByUser.get(r.user_id) ?? 0) + Number(r.usd_amount))
  }

  const { dateStr: today } = getNowChile()
  const rows: { user_id: string; snapshot_date: string; stocks_value_usd: number; wallet_usd: number; total_usd: number }[] = []
  let failed = 0

  for (const userId of userIds) {
    try {
      const userPositions = positions.filter(p => p.user_id === userId)
      const stocksValueUsd = userPositions.reduce((s, p) => s + Number(p.shares) * (priceByTicker.get(p.ticker) ?? Number(p.avg_cost_usd)), 0)
      const fundedCostUsd  = userPositions.reduce((s, p) => s + Number(p.wallet_cost_usd ?? 0), 0)
      const walletUsdBase  = walletByUser.get(userId) ?? 0
      const walletAvailable = walletUsdBase > 0 ? walletUsdBase - fundedCostUsd : null
      const walletUsd = Math.max(0, walletAvailable ?? 0)
      rows.push({
        user_id: userId,
        snapshot_date: today,
        stocks_value_usd: Math.round(stocksValueUsd * 100) / 100,
        wallet_usd:       Math.round(walletUsd * 100) / 100,
        total_usd:        Math.round((stocksValueUsd + walletUsd) * 100) / 100,
      })
    } catch (err) {
      failed++
      console.error(`[sync-prices] portfolio snapshot falló para user ${userId}:`, err)
    }
  }

  if (rows.length > 0) {
    const { error } = await supabase.from('portfolio_snapshots').upsert(rows, { onConflict: 'user_id,snapshot_date' })
    if (error) { console.error('[sync-prices] portfolio_snapshots upsert error:', error.message); return { ok: 0, failed: rows.length } }
  }
  return { ok: rows.length, failed }
}

// ── Trailing stop por posición (ratchet: solo sube) ─────────────────────────
// El alarm del análisis se recalcula cada día y puede BAJAR si bajan sus
// insumos (soportes/SMA50/chandelier). Para proteger ganancias de verdad, el
// trailing persistido en stock_positions.trail_stop_usd toma el máximo entre
// lo guardado y el alarm del día: nunca retrocede mientras la posición viva.
// (Se resetea al comprar más — eso lo hace el cliente, no este cron.)
async function updateTrailingStops(supabase: SupabaseClient): Promise<{ updated: number; skipped: number }> {
  const { data: pos } = await supabase
    .from('stock_positions')
    .select('id, ticker, trail_stop_usd')
  const rows = (pos ?? []) as { id: string; ticker: string; trail_stop_usd: number | null }[]
  if (rows.length === 0) return { updated: 0, skipped: 0 }

  const alarmByTicker = new Map<string, number | null>()
  for (const ticker of new Set(rows.map(r => r.ticker))) {
    try {
      const candles = await readCandles(supabase, ticker)
      if (candles.closes.length < 30) { alarmByTicker.set(ticker, null); continue }
      alarmByTicker.set(ticker, analyze(candles).alarm)
    } catch (err) {
      console.error(`[sync-prices] trailing stop: analyze() falló para ${ticker}:`, err)
      alarmByTicker.set(ticker, null)
    }
  }

  let updated = 0, skipped = 0
  for (const row of rows) {
    const alarm = alarmByTicker.get(row.ticker) ?? null
    if (alarm === null) { skipped++; continue }
    const current = row.trail_stop_usd !== null ? Number(row.trail_stop_usd) : null
    const next = current !== null ? Math.max(current, alarm) : alarm
    if (current !== null && next <= current + 0.005) { skipped++; continue }   // sin cambio: no escribir
    const { error } = await supabase
      .from('stock_positions')
      .update({ trail_stop_usd: Math.round(next * 100) / 100 })
      .eq('id', row.id)
    if (error) { console.error(`[sync-prices] trail_stop update error (${row.ticker}):`, error.message); skipped++ }
    else updated++
  }
  return { updated, skipped }
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
  // Se reutiliza para la decisión de portafolio (computeDailyDecisions) — evita
  // recalcular analyze() por segunda vez para los mismos tickers.
  const analysesByTicker = new Map<string, TechnicalAnalysis>()
  // Para sincronizar price_cache con los precios de cierre EOD después del loop
  const changePctByTicker = new Map<string, number>()
  // D1 (roadmap de calidad de decisión): track record por ticker, calculado
  // UNA vez por ticker por día acá (no por usuario) y reutilizado en
  // computeDailyDecisions — antes ese 20% del score se pasaba en null en
  // TODO lado porque backtestSignals() es caro y solo corría on-demand.
  const statsByTicker = new Map<string, LabelStat[]>()
  const statRows: {
    ticker: string; label: string; count: number
    hit_rate_20: number | null; avg_return_20: number | null; avg_return_60: number | null
  }[] = []

  for (const ticker of tickers) {
    try {
      const candles = await readCandles(supabase, ticker)
      if (candles.closes.length < 30) continue   // sin historia suficiente, no se puede opinar
      const analysis = analyze(candles)
      analysesByTicker.set(ticker, analysis)
      const closes = candles.closes
      const changePct = closes.length >= 2
        ? Math.round(((closes[closes.length - 1] - closes[closes.length - 2]) / closes[closes.length - 2]) * 1000) / 10
        : 0
      changePctByTicker.set(ticker, changePct)

      // Track record: solo tiene sentido con suficiente historia para el
      // backtest (MIN_HISTORY de lib/signal-backtest.ts, ~260 ruedas) — con
      // menos, backtestSignals() ya devuelve stats vacíos, así que se salta
      // el cómputo (CPU) directamente en vez de gastarlo para nada.
      if (candles.closes.length >= 260) {
        try {
          const { stats } = backtestSignals(candles)
          if (stats.length > 0) {
            statsByTicker.set(ticker, stats)
            for (const s of stats) {
              statRows.push({
                ticker, label: s.label, count: s.count,
                hit_rate_20: s.hitRate20, avg_return_20: s.avgReturn20, avg_return_60: s.avgReturn60,
              })
            }
          }
        } catch (err) {
          console.error(`[sync-prices] backtestSignals() falló para ${ticker}:`, err)
        }
      }
    } catch (err) {
      console.error(`[sync-prices] analyze() falló para ${ticker}:`, err)
    }
  }

  // Convicción/zona de precio por ticker (jul 2026) — se calcula UNA vez por
  // ticker (no por usuario: computeConviction solo depende de analysis/stats/
  // spyReturn6m, ninguno de los tres es específico de un usuario) y se pega a
  // cada fila de daily_signals ya armada, antes del upsert. Mismo cálculo que
  // usa computeDailyDecisions más abajo — se comparte vía convictionByTicker
  // para no recalcularlo por usuario también ahí.
  const { spyReturn6m, marketRegime } = await computeSpyContext(supabase, analysesByTicker)
  const convictionByTicker = new Map<string, ReturnType<typeof computeConviction>>()
  for (const [ticker, analysis] of analysesByTicker) {
    convictionByTicker.set(ticker, computeConviction(analysis, statsByTicker.get(ticker) ?? null, spyReturn6m))
  }

  // buildSignals corre DESPUÉS de tener convictionByTicker/marketRegime (no
  // en el loop de arriba) porque 'buy' ahora depende de isActionableBuyNow,
  // que necesita la convicción — mismo criterio que usa Radar.tsx (actionFlag)
  // para el chip de la app. Antes 'buy' se decidía solo con el gatillo técnico
  // crudo (analysis.rating.label), sin convicción ni régimen de mercado.
  for (const [ticker, analysis] of analysesByTicker) {
    const rowsForTicker = wlRows.filter(r => r.ticker === ticker)
    const { signals, notifiedIds } = buildSignals(
      analysis, rowsForTicker, ownedByUser, changePctByTicker.get(ticker) ?? 0,
      convictionByTicker.get(ticker) ?? null, marketRegime,
    )
    allSignals.push(...signals)
    allNotifiedIds.push(...notifiedIds)
  }

  for (const row of allSignals) {
    const c = convictionByTicker.get(row.ticker)
    const a = analysesByTicker.get(row.ticker)
    row.conviction_score = c?.score ?? null
    row.conviction_tier  = c?.tier  ?? null
    row.price_zone       = a?.priceZone ?? null
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

  // ── Sincronizar price_cache con precios de cierre EOD ─────────────────────
  // La app lee price_cache (actualizado cuando el usuario abre la watchlist).
  // Si el usuario la abrió a mediodía, price_cache queda con precios intraday,
  // distintos al cierre. Al correr este cron ya tenemos el precio de cierre
  // para cada ticker en analysesByTicker — lo pisamos para que la app y el
  // correo muestren el mismo número.
  // Solo se actualiza price y change_pct; name/domain/history7d los maneja
  // /api/stock-price para no duplicar llamadas a la API de perfil.
  if (analysesByTicker.size > 0) {
    const priceRows = [...analysesByTicker.entries()].map(([ticker, a]) => ({
      ticker,
      price:      a.price,
      change_pct: changePctByTicker.get(ticker) ?? 0,
      fetched_at: new Date().toISOString(),
    }))
    const { error } = await supabase.from('price_cache').upsert(priceRows, { onConflict: 'ticker' })
    if (error) console.error('[sync-prices] price_cache sync error:', error.message)
  }
  if (statRows.length > 0) {
    const { error } = await supabase.from('signal_stats').upsert(statRows, { onConflict: 'ticker,label' })
    if (error) console.error('[sync-prices] signal_stats upsert error:', error.message)
  }

  const decisions = await computeDailyDecisions(supabase, wlRows, analysesByTicker, spyReturn6m, marketRegime, convictionByTicker)

  return { signals: allSignals.length, targetsReached: allNotifiedIds.length, decisions: decisions.decisions, signalStats: statRows.length }
}

// Fuerza relativa vs SPY + régimen de mercado — compartido entre el enriquecido
// de daily_signals (convicción por ticker) y computeDailyDecisions (antes cada
// uno lo calculaba por su cuenta). Se reutiliza si SPY ya se analizó (siempre
// se sincroniza); si nadie la sigue en watchlist, se calcula aparte.
async function computeSpyContext(
  supabase: SupabaseClient,
  analysesByTicker: Map<string, TechnicalAnalysis>,
): Promise<{ spyReturn6m: number | null; marketRegime: MarketRegime | null }> {
  let spyAnalysis = analysesByTicker.get('SPY') ?? null
  if (spyAnalysis === null) {
    try {
      const spyCandles = await readCandles(supabase, 'SPY')
      if (spyCandles.closes.length >= 30) spyAnalysis = analyze(spyCandles)
    } catch { /* sin SPY el score simplemente pesa sin ese componente y el régimen queda null */ }
  }
  return {
    spyReturn6m:  spyAnalysis?.returns.m6 ?? null,
    marketRegime: computeMarketRegime(spyAnalysis?.trend ?? null),
  }
}

// ── Decisión diaria de portafolio (Fase 5.4 del roadmap) ─────────────────────
// El digest listaba señales ticker por ticker sin decir explícitamente "esto
// es lo que harías hoy". Esta función corre el mismo ranking de convicción
// del panel "¿Qué comprar hoy?" (lib/conviction.ts) para CADA usuario, sobre
// SU watchlist, y guarda una sola fila con el veredicto — que el correo lee
// para abrir con la decisión en vez de con la lista completa.
async function computeDailyDecisions(
  supabase: SupabaseClient,
  wlRows: WatchlistRow[],
  analysesByTicker: Map<string, TechnicalAnalysis>,
  spyReturn6m: number | null,
  marketRegime: MarketRegime | null,
  convictionByTicker: Map<string, ReturnType<typeof computeConviction>>,
): Promise<{ decisions: number }> {
  if (wlRows.length === 0) return { decisions: 0 }

  const userIds = [...new Set(wlRows.map(r => r.user_id))]
  const [{ data: posRows }, { data: usdRows }] = await Promise.all([
    supabase.from('stock_positions').select('user_id, ticker, shares, avg_cost_usd').in('user_id', userIds),
    supabase.from('usd_purchases').select('user_id, usd_amount').in('user_id', userIds),
  ])

  const positionsByUser = new Map<string, { ticker: string; shares: number; avgCost: number }[]>()
  for (const p of posRows ?? []) {
    const uid = p.user_id as string
    const list = positionsByUser.get(uid) ?? []
    list.push({ ticker: p.ticker as string, shares: Number(p.shares), avgCost: Number(p.avg_cost_usd) })
    positionsByUser.set(uid, list)
  }
  // Saldo de billetera aproximado: Σ movimientos (aportes+ventas) − costo de
  // TODAS las posiciones del usuario. El cron no distingue legacy vs
  // financiadas por la billetera (esa distinción vive en wallet_cost_usd,
  // consultable, pero para una SUGERENCIA de monto esta aproximación nunca
  // infla el saldo — en el peor caso lo subestima, que es el lado seguro.
  const walletMovByUser = new Map<string, number>()
  for (const r of usdRows ?? []) {
    const uid = r.user_id as string
    walletMovByUser.set(uid, (walletMovByUser.get(uid) ?? 0) + Number(r.usd_amount))
  }

  const decisionRows: {
    user_id: string; ticker: string | null; tier: string | null; score: number
    suggested_usd: number | null; verdict: string; reasons: string[]
  }[] = []

  for (const userId of userIds) {
    const userTickers = [...new Set(wlRows.filter(r => r.user_id === userId).map(r => r.ticker))]
    const candidates = userTickers
      .map(ticker => {
        const a = analysesByTicker.get(ticker)
        const c = convictionByTicker.get(ticker)
        // La convicción ya se calculó una vez por ticker más arriba (compartida
        // con el enriquecido de daily_signals) — acá solo se reusa, no se
        // vuelve a calcular por usuario.
        return a && c ? { ticker, a, conviction: c } : null
      })
      .filter((c): c is { ticker: string; a: TechnicalAnalysis; conviction: ReturnType<typeof computeConviction> } => c !== null)
      // Ago 2026: mismo desempate que Radar.tsx (lib/conviction.ts#riskRewardRatio)
      // — sin esto, un empate de score (ej. NVDA/INTC 70/100, ambos con
      // gatillo) lo ganaba el que apareciera primero en userTickers, no el de
      // mejor relación riesgo/recompensa. Un solo criterio en los dos lugares
      // que arman este ranking (acá y el panel en vivo).
      .sort((x, y) => (y.conviction.score - x.conviction.score)
        || ((riskRewardRatio(y.a) ?? -Infinity) - (riskRewardRatio(x.a) ?? -Infinity)))

    if (candidates.length === 0) continue
    const top = candidates[0]
    // Convicción alta no basta: si el gráfico no da gatillo hoy (a.buy sin
    // tramo "now"), el detalle del ticker en la app va a decir "no compres
    // hoy" — este correo/decisión no puede contradecirlo (fix jul 2026).
    //
    // Segunda vuelta del mismo bug (jul 2026, a pedido de Cas): esto solo
    // miraba si el #1 por SCORE (top) tenía gatillo hoy — si no, mandaba
    // "no compres nada" aunque otro ticker más abajo en el ranking SÍ tuviera
    // gatillo activo (mismo caso que el panel "¿Qué comprar hoy?" de la app,
    // que tiene el mismo fix). candidates ya viene ordenado por score desc,
    // así que el primer accionable sigue siendo el de mayor convicción entre
    // los que de verdad tienen entrada hoy.
    const bestActionable = candidates.find(c => isActionableBuyNow(c.a, c.conviction, marketRegime)) ?? null
    const isBuy = bestActionable !== null
    const picked = bestActionable ?? top

    let suggestedUsd: number | null = null
    if (isBuy && picked) {
      const positions = positionsByUser.get(userId) ?? []
      const costOfPositions = positions.reduce((s, p) => s + p.shares * (analysesByTicker.get(p.ticker)?.price ?? p.avgCost), 0)
      const walletCash      = Math.max(0, walletMovByUser.get(userId) ?? 0)
      const portfolioValueUsd = costOfPositions + walletCash
      if (portfolioValueUsd > 0) {
        const sizing = positionSizeUsd(portfolioValueUsd, picked.a.price, picked.a.alarm)
        // Además del riesgo, no sugerir más de lo que realmente hay disponible
        if (sizing) suggestedUsd = Math.round(Math.min(sizing.maxUsd, walletCash || sizing.maxUsd) * 100) / 100
      }
    }

    decisionRows.push({
      user_id: userId,
      ticker:  isBuy ? picked.ticker : null,
      tier:    isBuy ? picked.conviction.tier : null,
      score:   picked.conviction.score,
      suggested_usd: suggestedUsd,
      verdict: isBuy
        ? picked.conviction.verdict
        : `Ni ${top.ticker}, tu mejor candidata (${top.conviction.score}/100), tiene caso suficiente para comprar hoy.`,
      reasons: picked.conviction.reasons.slice(0, 3),
    })
  }

  if (decisionRows.length > 0) {
    const { error } = await supabase.from('daily_decisions').upsert(decisionRows, { onConflict: 'user_id,decision_date' })
    if (error) console.error('[sync-prices] daily_decisions upsert error:', error.message)
  }
  return { decisions: decisionRows.length }
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

  // Ago 2026 (bug reportado por Cas: 3 días sin análisis nuevo, sin forma de
  // ver por qué porque su plan de Vercel no retiene logs tan atrás). Antes
  // nada acá abajo tenía una red de seguridad: una excepción sin capturar en
  // CUALQUIER paso (network blip, timeout de un proveedor, lo que sea)
  // tumbaba la función entera con un 500 genérico — sin log claro y sin que
  // los pasos de MÁS ABAJO (daily_signals, que es lo que la UI lee para
  // "análisis de hoy") llegaran a correr. Ahora el cuerpo completo queda
  // envuelto: si algo revienta, se loguea con un prefijo grepeable y la
  // respuesta HTTP trae el motivo explícito en vez de una página en blanco.
  try {
    // P1/F4: snapshot de patrimonio SIEMPRE corre, incluso fines de semana o
    // feriados NYSE (a diferencia del sync de precios) — el usuario puede
    // ahorrar, pagar cuotas o depositar cualquier día, y un mes sin snapshot
    // es historia perdida para siempre (los meses pasados quedan congelados).
    await refreshUsdClp(supabase)
    const netWorthSnapshots = await snapshotAllNetWorths(supabase)
    const fomcAlert = await updateFomcAlert(supabase)

    if (!isTradingDay()) {
      return NextResponse.json({ skipped: 'non-trading day (fin de semana o feriado NYSE)', netWorthSnapshots, fomcAlert })
    }

    // Tickers en uso: watchlist ∪ posiciones (todos los usuarios) ∪ SPY.
    // SPY se sincroniza SIEMPRE, la sigas o no: es el benchmark contra el que
    // se compara el rendimiento del portafolio ("¿le ganaste al mercado?"),
    // así que necesita historia propia aunque nadie la tenga en watchlist.
    const [{ data: wl }, { data: pos }] = await Promise.all([
      supabase.from('watchlist').select('ticker'),
      supabase.from('stock_positions').select('ticker'),
    ])
    const tickers = [...new Set([
      'SPY',
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
    //
    // allSettled, no all (mismo bug de fondo que el try/catch de arriba): un
    // solo ticker que revienta (no solo "sin datos", sino una excepción real)
    // ya no puede tumbar la sincronización de los demás ni cortar el paso de
    // daily_signals más abajo.
    const settled = await Promise.allSettled(tickers.map(t => syncTicker(supabase, t)))
    const results = settled.map((r, i) => r.status === 'fulfilled'
      ? r.value
      : { ticker: tickers[i], inserted: 0, source: null, reasons: [`excepción: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`] })

    const ok     = results.filter(r => r.source !== null).length
    const failed = results.filter(r => r.source === null)
    console.log(`[sync-prices] ${ok}/${tickers.length} ok`, failed.map(f => `${f.ticker}: ${f.reasons.join('·')}`))

    // Curva diaria del valor de la cartera (pedido de Cas, ago 2026) — corre
    // para TODOS los usuarios con posiciones, no solo los que tienen
    // watchlist, así que va independiente del gate de computeDailySignals.
    const portfolioSnapshots = await snapshotAllPortfolioValues(supabase, tickers)

    // Señales del digest diario — solo tiene sentido si hay favoritos con historia
    const digest = wl && wl.length > 0 ? await computeDailySignals(supabase) : { signals: 0, targetsReached: 0, decisions: 0 }

    // Trailing stops de posiciones: ratchet diario post-sync (solo sube)
    const trailingStops = await updateTrailingStops(supabase)

    // ── Disparar los correos ──────────────────────────────────────────────
    // Recién acá, con daily_signals / daily_decisions / fomc_alerts ya
    // persistidos: las Edge Functions solo LEEN esas tablas, así que llamarlas
    // antes mandaría el correo de ayer. Ver lib/invoke-edge-function.ts para el
    // bug que motivó esto (ninguna de las dos se llamaba nunca).
    const digestEmail = wl && wl.length > 0
      ? await invokeEdgeFunction(url, key, 'notify-watchlist-digest')
      : { ok: true, body: { skipped: 'sin watchlist' } }

    // El recordatorio de FOMC solo tiene sentido si updateFomcAlert() encontró
    // una reunión vigente y dejó la fila del día; si no hay nada que leer, la
    // Edge Function saldría en vacío igual, pero nos ahorramos la llamada.
    const fomcEmail = fomcAlert
      ? await invokeEdgeFunction(url, key, 'notify-fomc-reminder')
      : { ok: true, body: { skipped: 'sin reunión FOMC vigente' } }

    return NextResponse.json({
      synced: ok,
      total:  tickers.length,
      failed: failed.map(f => ({ ticker: f.ticker, reasons: f.reasons })),
      digest,
      digestEmail,
      fomcEmail,
      trailingStops,
      netWorthSnapshots,
      portfolioSnapshots,
      fomcAlert,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[sync-prices] ⚠ corte inesperado, daily_signals puede haber quedado sin actualizar:', message)
    return NextResponse.json({ error: 'sync-prices falló', detail: message }, { status: 500 })
  }
}
