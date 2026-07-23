import { createClient, getServerSession } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Radar, { type WatchlistItem } from '@/components/Radar'
import DepositManager from '@/components/DepositManager'
import TermDepositManager from '@/components/TermDepositManager'
import UsdWalletManager, { type UsdPurchase } from '@/components/UsdWalletManager'
import { computeSpyBenchmark, type SpyBenchmarkResult } from '@/lib/benchmark'
import { getNowChile } from '@/lib/utils'
import type { TodayDecision, TodaySignal } from '@/components/TodayQueue'
import PerformanceSection from '@/components/PerformanceSection'

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

  const isAhorro    = sp.view === 'ahorro'
  const isDepositos = sp.view === 'depositos'
  const isBilletera = sp.view === 'billetera'

  const [{ data: stocks }, { data: savings }, { data: deposits }, { data: watchlist }, { data: sales }, { data: purchases }] = await Promise.all([
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

  const stockCount   = stocks?.length   ?? 0
  const savingCount  = savings?.length  ?? 0
  const depositCount = deposits?.length ?? 0

  // ── Benchmark vs SPY (Fase 2.2 del roadmap): ¿le ganaste al mercado? ──────
  // Basado en cierres de price_history (misma tabla que usa el motor técnico)
  // — no requiere precio en vivo. Se computa server-side porque necesita leer
  // price_history directo, cosa que los client components no hacen.
  let spyBenchmark: SpyBenchmarkResult | null = null
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

    const latestCloseByTicker = new Map<string, number>()
    for (const row of latestRows ?? []) {
      if (!latestCloseByTicker.has(row.ticker)) latestCloseByTicker.set(row.ticker, Number(row.close))
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
  }

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
            ? `${savingCount} cuenta${savingCount !== 1 ? 's' : ''} · ahorro`
            : isDepositos
            ? `${depositCount} depósito${depositCount !== 1 ? 's' : ''} · a plazo`
            : isBilletera
            ? 'el fondo desde el que compras acciones'
            : `${stockCount} posición${stockCount !== 1 ? 'es' : ''} · acciones`}
        </p>
      </div>

      {/* ── Content */}
      {isAhorro ? (
        <DepositManager
          userId={user.id}
          initialSavings={(savings ?? []) as SavingsAccount[]}
        />
      ) : isBilletera ? (
        <UsdWalletManager
          userId={user.id}
          initialPurchases={(usdPurchases ?? []) as UsdPurchase[]}
          investedUsd={investedUsd}
          stockPurchases={(purchases ?? []) as StockPurchase[]}
          sales={(sales ?? []) as StockSale[]}
        />
      ) : isDepositos ? (
        <TermDepositManager
          userId={user.id}
          initialDeposits={(deposits ?? []) as TermDeposit[]}
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
          />
          <div className="mt-6">
            <PerformanceSection sales={(sales ?? []) as StockSale[]} spyBenchmark={spyBenchmark} purchases={(purchases ?? []) as StockPurchase[]} />
          </div>
        </>
      )}

    </div>
  )
}
