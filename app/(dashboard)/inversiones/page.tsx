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
import PerformanceSection from '@/components/PerformanceSection'
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
  const { data: lastSignal } = await supabase
    .from('daily_signals')
    .select('created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // ── "Hoy" (U1 del roadmap UX): la cola de acciones del día, leída del
  // servidor — misma fuente que el correo, no un recálculo client-side que
  // puede desalinearse con el cierre analizado. daily_decisions trae el
  // veredicto comparado (mejor compra o "no compres nada"); daily_signals
  // trae lo accionable por ticker que no es "comprar" (vender, tomar
  // ganancias, precio objetivo alcanzado).
  const { dateStr: todayCL } = getNowChile()
  const [{ data: todayDecisionRow }, { data: todaySignalRows }] = await Promise.all([
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

  // Billetera USD — se necesita siempre: en Ahorro para el manager y en
  // Acciones para el saldo disponible (tope de compra)
  const { data: usdPurchases } = await supabase
    .from('usd_purchases')
    .select('id, usd_amount, total_paid_clp, purchase_date, notes, kind')
    .eq('user_id', user.id)
    .order('purchase_date', { ascending: false })

  // Σ movimientos (aportes + ventas) y costo de posiciones FINANCIADAS por la
  // billetera — las legacy (compradas antes de usarla) no descuentan del saldo
  const walletUsdBase = (usdPurchases ?? []).reduce((s, r) => s + Number(r.usd_amount), 0)
  const investedUsd   = (stocks ?? [])
    .reduce((s, p) => s + Number(p.wallet_cost_usd ?? 0), 0)

  // ── P4 (roadmap largo plazo): meta mensual de aporte (profiles.monthly_invest_goal,
  // ya vive en /inicio y /analisis) — Acciones la ignoraba por completo. Mismo
  // criterio que inicio/page.tsx: "invertido este mes" = depósitos a la
  // billetera USD del mes (kind='deposit'), en CLP — el aporte real desde el
  // mundo CLP, no lo que ya compraste con saldo de meses anteriores.
  const { data: profileRow } = await supabase
    .from('profiles')
    .select('monthly_invest_goal')
    .eq('id', user.id)
    .maybeSingle()
  const monthlyInvestGoal = (profileRow as { monthly_invest_goal?: number | null } | null)?.monthly_invest_goal ?? null
  const [goalYear, goalMonth] = todayCL.split('-').map(Number)
  const thisMonthStartStr = `${goalYear}-${String(goalMonth).padStart(2, '0')}-01`
  const nextMonthStartStr = new Date(goalYear, goalMonth, 1).toISOString().slice(0, 10)
  const investedThisMonthClp = (usdPurchases ?? [])
    .filter(r => r.kind === 'deposit' && r.purchase_date >= thisMonthStartStr && r.purchase_date < nextMonthStartStr)
    .reduce((s, r) => s + Number(r.total_paid_clp ?? 0), 0)

  const stockCount   = stocks?.length   ?? 0
  const savingCount  = savings?.length  ?? 0
  const depositCount = deposits?.length ?? 0

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
  if ((purchases?.length ?? 0) > 0) {
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

    const cashFlows = [
      ...(purchases ?? []).map(p => ({ date: p.purchase_date, usd: Number(p.total_paid_usd) })),
      ...(sales ?? []).map(s => ({ date: s.sale_date, usd: -Number(s.proceeds_usd) })),
    ]

    spyBenchmark = computeSpyBenchmark(
      cashFlows,
      (spyRows ?? []).map(r => ({ date: r.date as string, close: Number(r.close) })),
      (stocks ?? []).map(s => ({ ticker: s.ticker, shares: s.shares })),
      latestCloseByTicker,
    )

    portfolioHistory = computePortfolioHistory(
      (latestRows ?? []).map(r => ({ ticker: r.ticker as string, date: r.date as string, close: Number(r.close) })),
      (stocks ?? []).map(s => ({ ticker: s.ticker, shares: s.shares })),
    )
  }

  // ── "Tu semana" (P3, roadmap largo plazo) — reemplaza la pestaña Semanal
  // completa: esa vista duplicaba el Radar ticker por ticker con más jerga
  // (Fibonacci, POC). Lo único que aportaba y que Acciones no tenía — vs. el
  // mercado, la Fed en cotidiano, el calendario — cabe en una card chica.
  // Contexto macro: cache 24h (barato), se calcula siempre; null en cada
  // serie si falta FRED_API_KEY, la card se degrada sola sin romper el resto.
  const macro = await fetchAllMacroSeries(supabase)
  const dffObs   = macro.DFF?.observations ?? []
  const cpiObs   = macro.CPIAUCSL?.observations ?? []
  const dgs10Obs = macro.DGS10?.observations ?? []
  const dgs2Obs  = macro.DGS2?.observations ?? []
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
  // ambos son avisos de "no es buen día para ejecutar compras", no solo trivia.
  const upcoming: UpcomingEvent[] = []
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

  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-12">

      {/* ── Header */}
      <div className="mb-1">
        <h1
          className="text-3xl font-semibold leading-tight"
          style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--ink)' }}
        >
          Inversiones
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--ink-3)' }}>
          {isAhorro
            ? `${savingCount + depositCount} ${savingCount + depositCount !== 1 ? 'cuentas' : 'cuenta'} · ahorro y depósitos`
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
          <div className="flex items-center justify-end mb-4">
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
              trailingInflationPct={trailingInflationPctResolved}
            />
            <TermDepositManager
              userId={user.id}
              initialDeposits={(deposits ?? []) as TermDeposit[]}
            />
          </div>
        </>
      ) : isBilletera ? (
        <UsdWalletManager
          userId={user.id}
          initialPurchases={(usdPurchases ?? []) as UsdPurchase[]}
          investedUsd={investedUsd}
          stockPurchases={(purchases ?? []) as StockPurchase[]}
          sales={(sales ?? []) as StockSale[]}
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
              contradecirse (detectado por Cas en AMD e INTC/TSM). */}
          <Radar
            userId={user.id}
            initialPositions={(stocks ?? []) as StockPosition[]}
            walletUsdBase={walletUsdBase}
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
          <div className="mt-6">
            <PerformanceSection sales={(sales ?? []) as StockSale[]} spyBenchmark={spyBenchmark} purchases={(purchases ?? []) as StockPurchase[]} />
          </div>
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
