import { createClient, getServerSession } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Radar, { type WatchlistItem } from '@/components/Radar'
import DepositManager from '@/components/DepositManager'
import TermDepositManager from '@/components/TermDepositManager'
import RentaFijaSummary from '@/components/RentaFijaSummary'
import InversionesToggle from '@/components/InversionesToggle'
import UsdWalletManager, { type UsdPurchase } from '@/components/UsdWalletManager'
import { computeSpyBenchmark, type SpyBenchmarkResult } from '@/lib/benchmark'
import { computePortfolioHistory, type PortfolioPoint } from '@/lib/portfolio-history'
import { getNowChile } from '@/lib/utils'
import type { TodayDecision, TodaySignal } from '@/components/TodayQueue'
import WeekSnapshotCard, { type UpcomingEvent } from '@/components/WeekSnapshotCard'
import { fetchAllMacroSeries } from '@/lib/macro-fetch'
import { fedRateSentence, inflationSentence, nextFomcMeeting } from '@/lib/market-week'
import { computeRatePath } from '@/lib/rate-path'
import { computeRateSensitivity } from '@/lib/rate-sensitivity'
import { computeRateScenarios } from '@/lib/rate-scenarios'
import RateScenariosCard from '@/components/RateScenariosCard'
import { detectLeverage } from '@/lib/leveraged-etfs'
import { computeYieldCurve } from '@/lib/yield-curve'
import { fetchEarnings } from '@/lib/earnings-fetch'
import { businessDaysUntil } from '@/lib/earnings'
import { fetchClIpcSeries, trailingAnnualInflation } from '@/lib/cl-indicators'
import { computeWalletCash } from '@/lib/wallet-cash'

export const dynamic = 'force-dynamic'

export interface StockPosition {
  id:              string
  ticker:          string
  shares:          number
  avg_cost_usd:    number
  notes:           string | null
  wallet_funded:   boolean   // marcador: wallet_cost_usd > 0
  wallet_cost_usd: number    // porción del costo que salió de la billetera USD (descuenta del saldo)
  trail_stop_usd:  number | null   // trailing stop (ratchet, solo sube) — lo escribe el cron sync-prices
  created_at:      string
  updated_at:      string
}

export interface StockSale {
  id:               string
  ticker:           string
  shares_sold:      number
  cost_basis_usd:   number
  proceeds_usd:     number
  realized_pnl_usd: number
  sale_date:        string
  notes:            string | null
  usd_purchase_id:  string | null   // enlaza con la fila 'sell' en usd_purchases que devolvió estos USD a la billetera
  created_at:       string
}

export interface StockPurchase {
  id:             string
  ticker:         string
  shares:         number
  total_paid_usd: number
  purchase_date:  string
  notes:          string | null
  created_at:     string
  /** D5 (roadmap de calidad de decisión): lectura con la que se decidió esta
   *  compra — null en compras registradas antes de jul 2026 (no reconstruible). */
  conviction_score?:  number | null
  conviction_tier?:   string | null
  had_entry_trigger?: boolean | null
}

export interface TermDeposit {
  id:            string
  bank:          string
  amount:        number
  interest_rate: number
  start_date:    string
  maturity_date: string
  /** Renovable (se reinvierte solo al vencer) vs. fijo (se corta al vencer). Ago 2026. */
  renewable:     boolean
  notes:         string | null
  created_at:    string
}

export interface SavingsAccount {
  id:          string
  user_id:     string
  name:        string
  balance:     number        // CLP entero
  annual_rate: number        // % TAE, ej: 12.5
  start_date:  string        // YYYY-MM-DD
  notes:       string | null
  created_at:  string
  updated_at:  string
}

interface Props {
  searchParams: Promise<{ view?: string }>
}

export default async function InversionesPage({ searchParams }: Props) {
  const [user, supabase, sp] = await Promise.all([
    getServerSession(),
    createClient(),
    searchParams,
  ])
  if (!user) redirect('/login')

  // Ago 2026 (ROADMAP-ahorro-depositos.md, A3): Ahorro y Depósitos se
  // fusionaron en una sola vista — 'depositos' queda como ALIAS de 'ahorro'
  // para que links/bookmarks viejos (ej. PatrimonioCards antes de A3, o
  // correos ya enviados) sigan cayendo en la vista correcta en vez de
  // silenciosamente mostrar Acciones.
  const isAhorro    = sp.view === 'ahorro' || sp.view === 'depositos'
  const isBilletera = sp.view === 'billetera'
  // Ago 2026 (pedido de Cas: "quiero separar en dos vistas, una de
  // seguimiento de las acciones que ya tengo y otra con las que me interesa
  // comprar") — Watchlist es 100% candidatos a comprar (ranking, favoritos
  // sin posición); el default (sin ?view=, antes "Acciones") pasa a ser
  // "Mis acciones", 100% seguimiento (valor, rendimiento, historial).
  const isWatchlist = sp.view === 'watchlist'

  // ago 2026 (Cas: "siento que los cambios entre billetera, acciones y todo
  // eso es muy lento" — `dynamic = 'force-dynamic'` significa que CADA click
  // de tab en InversionesToggle es una navegación completa que vuelve a
  // correr esta función entera, sin importar qué pestaña se pida. Antes de
  // esto se traía TODO sin condicionar: benchmark vs SPY + historial de
  // precios, hasta 5 llamadas a la API de FRED (macro) y una llamada a
  // Finnhub POR CADA ticker en cartera (earnings) — aunque Billetera y
  // Ahorro nunca renderizan nada de eso. Estos dos flags acotan ese trabajo
  // a las pestañas que de verdad lo consumen (Radar: Mis acciones y
  // Watchlist; macro/earnings: solo Mis acciones, mismo criterio que ya
  // usaba WeekSnapshotCard/RateScenariosCard más abajo).
  const needsRadarData = !isAhorro && !isBilletera   // Watchlist o Mis acciones
  const needsMacro      = needsRadarData && !isWatchlist   // solo Mis acciones

  // E5 (roadmap economía): rentabilidad real (F7 de FEATURES.md) — un
  // depósito al 12% con IPC 4% rinde ~7,7% real, no 8%. Solo se pide en la
  // pestaña Ahorro, que es la única que la usa.
  const trailingInflationPct = isAhorro
    ? (() => {
        const { dateStr } = getNowChile()
        return fetchClIpcSeries(supabase).then(series => series ? trailingAnnualInflation(series, dateStr) : null)
      })()
    : Promise.resolve(null)

  const [{ data: stocks }, { data: savings }, { data: deposits }, { data: watchlist }, { data: sales }, { data: purchases }, trailingInflationPctResolved] = await Promise.all([
    supabase
      .from('stock_positions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('savings_accounts')
      .select('*')
      .eq('user_id', user.id)
      .order('start_date', { ascending: true }),
    supabase
      .from('term_deposits')
      .select('*')
      .eq('user_id', user.id)
      .order('maturity_date', { ascending: true }),
    supabase
      .from('watchlist')
      .select('id, ticker, target_price, target_direction')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('stock_sales')
      .select('*')
      .eq('user_id', user.id)
      .order('sale_date', { ascending: false }),
    supabase
      .from('stock_purchases')
      .select('*')
      .eq('user_id', user.id)
      .order('purchase_date', { ascending: false }),
    trailingInflationPct,
  ])

  // Última vez que corrió el análisis técnico automático (cron sync-prices →
  // daily_signals) — visible en Acciones para poder notar de un vistazo si el
  // pipeline diario dejó de correr, sin tener que revisar logs de Vercel/Supabase.
  // Solo lo lee Radar (Mis acciones/Watchlist) — sin uso en Ahorro/Billetera.
  const { data: lastSignal } = needsRadarData
    ? await supabase
        .from('daily_signals')
        .select('created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null }

  // ── "Hoy" (U1 del roadmap UX): la cola de acciones del día, leída del
  // servidor — misma fuente que el correo, no un recálculo client-side que
  // puede desalinearse con el cierre analizado. daily_decisions trae el
  // veredicto comparado (mejor compra o "no compres nada"); daily_signals
  // trae lo accionable por ticker que no es "comprar" (vender, tomar
  // ganancias, precio objetivo alcanzado). Solo lo lee Radar.
  const { dateStr: todayCL } = getNowChile()
  const [{ data: todayDecisionRow }, { data: todaySignalRows }] = needsRadarData
    ? await Promise.all([
        supabase
          .from('daily_decisions')
          .select('ticker, tier, score, suggested_usd, verdict, reasons')
          .eq('user_id', user.id)
          .eq('decision_date', todayCL)
          .maybeSingle(),
        supabase
          .from('daily_signals')
          .select('ticker, kind, message, price')
          .eq('user_id', user.id)
          .eq('signal_date', todayCL)
          .in('kind', ['sell', 'caution', 'target']),
      ])
    : [{ data: null }, { data: null }]

  // Billetera USD — se necesita siempre: en Ahorro para el manager y en
  // Acciones para el saldo disponible (tope de compra)
  const { data: usdPurchases } = await supabase
    .from('usd_purchases')
    .select('id, usd_amount, total_paid_clp, purchase_date, notes, kind')
    .eq('user_id', user.id)
    .order('purchase_date', { ascending: false })

  // Efectivo de la billetera por flujo de caja real (sep 2026, ver
  // lib/wallet-cash.ts): entradas − compras. Antes se restaba el
  // wallet_cost_usd de las posiciones ABIERTAS, que dejaba de descontar el
  // costo apenas vendías una posición completa e inflaba el saldo.
  const walletMovements = (usdPurchases ?? []).map(r => ({
    kind: (r.kind === 'sell' ? 'sell' : 'deposit') as 'sell' | 'deposit',
    usd_amount: Number(r.usd_amount),
  }))
  const walletPurchases = (purchases ?? []).map(p => ({ total_paid_usd: Number(p.total_paid_usd) }))
  const walletCash = computeWalletCash(walletMovements, walletPurchases)

  // ── P4 (roadmap largo plazo): meta mensual de aporte (profiles.monthly_invest_goal,
  // ya vive en /inicio y /analisis) — Acciones la ignoraba por completo. Mismo
  // criterio que inicio/page.tsx: "invertido este mes" = depósitos a la
  // billetera USD del mes (kind='deposit'), en CLP — el aporte real desde el
  // mundo CLP, no lo que ya compraste con saldo de meses anteriores.
  const { data: profileRow } = needsRadarData
    ? await supabase
        .from('profiles')
        .select('monthly_invest_goal')
        .eq('id', user.id)
        .maybeSingle()
    : { data: null }
  const monthlyInvestGoal = (profileRow as { monthly_invest_goal?: number | null } | null)?.monthly_invest_goal ?? null
  const [goalYear, goalMonth] = todayCL.split('-').map(Number)
  const thisMonthStartStr = `${goalYear}-${String(goalMonth).padStart(2, '0')}-01`
  const nextMonthStartStr = new Date(goalYear, goalMonth, 1).toISOString().slice(0, 10)
  const investedThisMonthClp = (usdPurchases ?? [])
    .filter(r => r.kind === 'deposit' && r.purchase_date >= thisMonthStartStr && r.purchase_date < nextMonthStartStr)
    .reduce((s, r) => s + Number(r.total_paid_clp ?? 0), 0)

  const stockCount   = stocks?.length   ?? 0

  // ── Benchmark vs SPY (Fase 2.2 del roadmap): ¿le ganaste al mercado? ──────
  // Basado en cierres de price_history (misma tabla que usa el motor técnico)
  // — no requiere precio en vivo. Se computa server-side porque necesita leer
  // price_history directo, cosa que los client components no hacen.
  let spyBenchmark: SpyBenchmarkResult | null = null
  // W3 (roadmap de vista, fase 2): evolución del portafolio en el tiempo —
  // reusa la MISMA consulta de price_history que ya se pedía para el
  // benchmark vs SPY (todo el historial de los tickers en posición), sin
  // fetch aparte.
  let portfolioHistory: PortfolioPoint[] = []
  // M3 (roadmap macro/tasas): historial completo por ticker + último cierre,
  // hoisteados fuera del bloque para reusarlos más abajo en los escenarios de
  // tasa (necesitan el mismo price_history que ya se pide acá — cero fetch
  // aparte) — se calculan DESPUÉS de traer dgs2Obs (bloque macro, más abajo).
  let priceHistoryByTicker = new Map<string, { date: string; value: number }[]>()
  let latestCloseByTicker  = new Map<string, number>()
  // Solo lo consumen Radar (Mis acciones/Watchlist) y PerformanceSection —
  // nada en Ahorro/Billetera lee spyBenchmark/portfolioHistory.
  // ago 2026 (Cas): el gate ahora es sobre APORTES a la billetera, no sobre
  // compras de acciones — son el flujo de caja que de verdad mueve la sombra
  // (ver lib/benchmark.ts).
  const hasDeposits = (usdPurchases ?? []).some(p => p.kind === 'deposit')
  if (needsRadarData && hasDeposits) {
    const positionTickers = [...new Set((stocks ?? []).map(s => s.ticker))]
    const [{ data: spyRows }, { data: latestRows }] = await Promise.all([
      supabase
        .from('price_history')
        .select('date, close')
        .eq('ticker', 'SPY')
        .order('date', { ascending: true }),
      positionTickers.length > 0
        ? supabase
            .from('price_history')
            .select('ticker, date, close')
            .in('ticker', positionTickers)
            .order('date', { ascending: false })
        : Promise.resolve({ data: [] as { ticker: string; date: string; close: number }[] }),
    ])

    for (const row of latestRows ?? []) {
      if (!latestCloseByTicker.has(row.ticker)) latestCloseByTicker.set(row.ticker, Number(row.close))
      const list = priceHistoryByTicker.get(row.ticker) ?? []
      list.push({ date: row.date as string, value: Number(row.close) })
      priceHistoryByTicker.set(row.ticker, list)
    }

    // ago 2026 (Cas: "me gustaria que cuando compre los dolares altiro
    // hubiera comprado [SPY]... para que sea justo"): flujo de caja = aportes
    // a la billetera (dinero nuevo entrando), no compra/venta de acciones —
    // ver el comentario de metodología en lib/benchmark.ts.
    const cashFlows = (usdPurchases ?? [])
      .filter(p => p.kind === 'deposit')
      .map(p => ({ date: p.purchase_date, usd: Number(p.usd_amount) }))
    const walletCashUsd = Math.max(0, walletCash.cash)

    spyBenchmark = computeSpyBenchmark(
      cashFlows,
      (spyRows ?? []).map(r => ({ date: r.date as string, close: Number(r.close) })),
      (stocks ?? []).map(s => ({ ticker: s.ticker, shares: s.shares })),
      latestCloseByTicker,
      walletCashUsd,
    )

    portfolioHistory = computePortfolioHistory(
      (latestRows ?? []).map(r => ({ ticker: r.ticker as string, date: r.date as string, close: Number(r.close) })),
      (stocks ?? []).map(s => ({ ticker: s.ticker, shares: s.shares })),
    )
  }

  // ── Curva diaria REAL del valor del portafolio (pedido de Cas, ago 2026) ──
  // A diferencia de portfolioHistory (reconstrucción con las posiciones de
  // HOY hacia atrás), esto lee valores guardados de verdad día a día por el
  // cron (snapshotAllPortfolioValues en sync-prices) — solo tiene sentido en
  // "Mis acciones", no en Watchlist.
  let portfolioSnapshots:   { date: string; value: number }[] = []
  let dollarsBoughtHistory: { date: string; value: number }[] = []
  if (needsRadarData && !isWatchlist) {
    const { data: snapRows } = await supabase
      .from('portfolio_snapshots')
      .select('snapshot_date, total_usd')
      .eq('user_id', user.id)
      .order('snapshot_date', { ascending: true })
    portfolioSnapshots = (snapRows ?? []).map(r => ({ date: r.snapshot_date as string, value: Number(r.total_usd) }))

    // Serie acumulada de DÓLARES COMPRADOS — la línea gris del gráfico
    // (sep 2026, Cas: "la gris los dolares que he comprado para asi poder ver
    // el gap"). Solo `kind='deposit'`: son los USD que compraste con pesos,
    // plata nueva que entró. Las filas `kind='sell'` quedan fuera a propósito
    // — esos dólares vienen de vender acciones que YA estaban adentro, no de
    // tu bolsillo; contarlos inflaría la gris y haría desaparecer el gap.
    //
    // A diferencia de portfolioSnapshots, esta serie tiene historia completa
    // desde el primer aporte: sale de usd_purchases, no del cron nuevo.
    let running = 0
    dollarsBoughtHistory = (usdPurchases ?? [])
      .filter(p => p.kind === 'deposit')
      .map(p => ({ date: p.purchase_date as string, amount: Number(p.usd_amount) }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .map(a => {
        running += a.amount
        return { date: a.date, value: Math.round(running * 100) / 100 }
      })
  }

  // ── "Tu semana" (P3, roadmap largo plazo) — reemplaza la pestaña Semanal
  // completa: esa vista duplicaba el Radar ticker por ticker con más jerga
  // (Fibonacci, POC). Lo único que aportaba y que Acciones no tenía — vs. el
  // mercado, la Fed en cotidiano, el calendario — cabe en una card chica.
  // Contexto macro: cache 24h en price_cache (barato en $ pero sigue siendo
  // ida y vuelta a Supabase + hasta 5 llamadas a FRED en cache-miss) — solo
  // WeekSnapshotCard/RateScenariosCard lo leen, y ambas viven solo en Mis
  // acciones (ver comentario de Watchlist más abajo), así que se salta
  // entero en Ahorro/Billetera/Watchlist. null en cada serie si falta
  // FRED_API_KEY, la card se degrada sola sin romper el resto.
  const macro = needsMacro ? await fetchAllMacroSeries(supabase) : null
  const dffObs   = macro?.DFF?.observations ?? []
  const cpiObs   = macro?.CPIAUCSL?.observations ?? []
  const dgs10Obs = macro?.DGS10?.observations ?? []
  const dgs2Obs  = macro?.DGS2?.observations ?? []
  // M1 (roadmap macro/tasas, jul 2026): DFF es la tasa YA realizada — nunca
  // se mueve antes de una decisión. El spread DGS2-DFF (lib/rate-path.ts) es
  // el proxy de hacia dónde el mercado espera que se mueva, sin lo cual
  // fedRateSentence podía decir "sin presión nueva" el mismo día en que la
  // expectativa cambió mucho (caso real: FOMC 29 jul 2026).
  const ratePath = dffObs.length > 0 && dgs2Obs.length > 0
    ? computeRatePath(dgs2Obs[dgs2Obs.length - 1].value, dffObs[dffObs.length - 1].value)
    : null
  const fedSentence  = dffObs.length > 0 ? fedRateSentence(dffObs, ratePath) : null
  const inflSentence = cpiObs.length > 0 ? inflationSentence(cpiObs) : null
  const yieldCurveInverted = dgs10Obs.length > 0 && dgs2Obs.length > 0
    ? computeYieldCurve(dgs10Obs[dgs10Obs.length - 1].value, dgs2Obs[dgs2Obs.length - 1].value).inverted
    : false

  // M3 (roadmap macro/tasas, jul 2026): escenarios +25/0/-25pb sobre la
  // cartera real — reusa el price_history ya traído arriba (spyBenchmark/
  // portfolioHistory) y la serie DGS2 recién cacheada, sin fetch aparte.
  // Aproximación de primer orden, no una predicción (ver disclaimer en la UI).
  const rateScenarios = dgs2Obs.length > 0
    ? computeRateScenarios(
        (stocks ?? []).map(s => {
          const valueUsd = s.shares * (latestCloseByTicker.get(s.ticker) ?? 0)
          const sensitivity = computeRateSensitivity(priceHistoryByTicker.get(s.ticker) ?? [], dgs2Obs)
          return {
            ticker: s.ticker,
            valueUsd,
            betaPer10bp: sensitivity?.betaPer10bp ?? null,
            leverageFactor: detectLeverage(s.ticker)?.factor ?? null,
          }
        }),
      )
    : null

  // "Lo que viene": reunión de la Fed en ≤7 días + earnings de tickers en
  // cartera en ≤5 días hábiles (mismo umbral que D3 ya usa para earnings) —
  // ambos son avisos de "no es buen día para ejecutar compras", no solo
  // trivia. Solo se renderiza en WeekSnapshotCard (Mis acciones) — la
  // llamada a Finnhub por ticker (fetchEarnings) es la más cara de toda la
  // página, así que se salta entero fuera de esa pestaña.
  const upcoming: UpcomingEvent[] = []
  if (needsMacro) {
    const fomcDate = nextFomcMeeting(todayCL)
    if (fomcDate) upcoming.push({ label: 'Decisión de tasas de la Fed', date: fomcDate })
    const ownedTickersForEarnings = [...new Set((stocks ?? []).map(s => s.ticker))]
    if (ownedTickersForEarnings.length > 0) {
      const earningsResults = await Promise.all(ownedTickersForEarnings.map(t => fetchEarnings(supabase, t)))
      for (const e of earningsResults) {
        if (!e.nextDate) continue
        const days = businessDaysUntil(e.nextDate, todayCL)
        if (days !== null && days <= 5) upcoming.push({ label: `${e.symbol} reporta resultados`, date: e.nextDate })
      }
    }
    upcoming.sort((a, b) => a.date.localeCompare(b.date))
  }

  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-12">

      {/* ── Header */}
      <div className="mb-1">
        <h1
          className="text-3xl font-semibold leading-tight"
          style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--ink)' }}
        >
          {isAhorro ? 'Ahorros y depósitos' : isWatchlist ? 'Watchlist' : isBilletera ? 'Inversiones' : 'Mis acciones'}
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--ink-3)' }}>
          {isAhorro
            ? 'Todo tu dinero que genera interés'
            : isWatchlist
            ? 'Candidatos que te interesa comprar'
            : isBilletera
            ? 'el fondo desde el que compras acciones'
            : `${stockCount} posición${stockCount !== 1 ? 'es' : ''} · acciones`}
        </p>
      </div>

      {/* ── Content */}
      {isAhorro ? (
        <>
          {/* A1 (roadmap ahorro+depósitos): el toggle vive UNA sola vez acá
              — DepositManager y TermDepositManager ya no dibujan el suyo
              propio, porque ahora conviven en la misma pantalla. */}
          {/* sep 2026 (Cas: "el toggle aun no aparece a la izquierda" —
              mismo ajuste aplicado en Radar.tsx y UsdWalletManager, para que
              las 4 pestañas de /inversiones se comporten igual): a la
              izquierda en mobile y al borde derecho en sm+, mismo criterio y
              mismo breakpoint que las otras tres vistas (Cas, ronda 2: "para
              la version escritorio esto este a la derecha congruente en las 4
              vistas del toggle"). Acá no hay botón al lado, así que el toggle
              viaja solo. */}
          <div className="flex items-center justify-start sm:justify-end mb-4">
            <InversionesToggle active="ahorro" />
          </div>
          <RentaFijaSummary
            savings={(savings ?? []) as SavingsAccount[]}
            deposits={(deposits ?? []) as TermDeposit[]}
            todayStr={todayCL}
            trailingInflationPct={trailingInflationPctResolved}
          />
          <div className="space-y-8">
            <DepositManager
              userId={user.id}
              initialSavings={(savings ?? []) as SavingsAccount[]}
            />
            <TermDepositManager
              userId={user.id}
              initialDeposits={(deposits ?? []) as TermDeposit[]}
            />
          </div>
          {/* Footer único (mockup de Cas, ago 2026): combina las dos notas que
              antes vivían por separado en cada manager. */}
          {(((savings ?? []).length > 0) || ((deposits ?? []).length > 0)) && (
            <p className="text-[11px] text-center mt-4" style={{ color: 'var(--ink-3)' }}>
              Ahorro con capitalización diaria · plazo con interés simple del período. Actualizado hoy.
            </p>
          )}
        </>
      ) : isBilletera ? (
        <UsdWalletManager
          userId={user.id}
          initialPurchases={(usdPurchases ?? []) as UsdPurchase[]}
          spentUsd={walletCash.spent}
          stockPurchases={(purchases ?? []) as StockPurchase[]}
          sales={(sales ?? []) as StockSale[]}
        />
      ) : isWatchlist ? (
        /* Ago 2026 (split Mis acciones / Watchlist): esta vista es 100%
           candidatos a comprar — ranking "¿Qué comprar hoy?" + favoritos sin
           posición. Sin PerformanceSection/WeekSnapshotCard/RateScenariosCard
           (eso es contexto sobre lo que YA tienes, vive en Mis acciones). */
        <Radar
          view="watchlist"
          userId={user.id}
          initialPositions={(stocks ?? []) as StockPosition[]}
          walletUsdBase={walletCash.deposited + walletCash.proceeds}
          initialSales={(sales ?? []) as StockSale[]}
          initialPurchases={(purchases ?? []) as StockPurchase[]}
          spyBenchmark={spyBenchmark}
          lastAutoUpdate={lastSignal?.created_at ?? null}
          initialWatchlist={(watchlist ?? []) as WatchlistItem[]}
          todayDecision={(todayDecisionRow ?? null) as TodayDecision | null}
          todaySignals={(todaySignalRows ?? []) as TodaySignal[]}
          portfolioHistory={portfolioHistory}
          monthlyInvestGoal={monthlyInvestGoal}
          investedThisMonthClp={investedThisMonthClp}
        />
      ) : (
        <>
          {/* U4 (roadmap UX): un solo mundo — Radar reemplaza StockPositionManager
              + WatchlistPanel. Un solo fetch de análisis por ticker, un solo
              detalle (TechnicalDetail, el de U3) para cualquiera, el modal
              transaccional (TransactionModal) queda solo para comprar/vender/editar.
              V1 (roadmap de vista): TodayQueue ya NO se renderiza aparte — su
              decisión (calculada anoche por el cron, la misma del correo) se
              le pasa a Radar como prop para que la fusione con el panel
              "¿Qué comprar hoy?" en una sola tarjeta, en vez de dos que podían
              contradecirse (detectado por Cas en AMD e INTC/TSM).
              Ago 2026 (split Mis acciones / Watchlist): view="mias" — 100%
              seguimiento, sin ranking ni tabs (eso vive en ?view=watchlist). */}
          <Radar
            view="mias"
            userId={user.id}
            initialPositions={(stocks ?? []) as StockPosition[]}
            walletUsdBase={walletCash.deposited + walletCash.proceeds}
            initialSales={(sales ?? []) as StockSale[]}
            initialPurchases={(purchases ?? []) as StockPurchase[]}
            spyBenchmark={spyBenchmark}
            lastAutoUpdate={lastSignal?.created_at ?? null}
            initialWatchlist={(watchlist ?? []) as WatchlistItem[]}
            todayDecision={(todayDecisionRow ?? null) as TodayDecision | null}
            todaySignals={(todaySignalRows ?? []) as TodaySignal[]}
            portfolioHistory={portfolioHistory}
            portfolioSnapshots={portfolioSnapshots}
            dollarsBoughtHistory={dollarsBoughtHistory}
            monthlyInvestGoal={monthlyInvestGoal}
            investedThisMonthClp={investedThisMonthClp}
          />
          <div className="mt-4">
            <WeekSnapshotCard
              spyBenchmark={spyBenchmark}
              fedSentence={fedSentence}
              inflationSentence={inflSentence}
              yieldCurveInverted={yieldCurveInverted}
              upcoming={upcoming}
            />
          </div>
          {rateScenarios && (
            <div className="mt-4">
              <RateScenariosCard
                scenarios={rateScenarios.scenarios}
                excludedTickers={rateScenarios.excludedTickers}
                consideredValueUsd={rateScenarios.consideredValueUsd}
              />
            </div>
          )}
        </>
      )}

    </div>
  )
}
