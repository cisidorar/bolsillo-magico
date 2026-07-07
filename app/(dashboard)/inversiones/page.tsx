import { createClient, getServerSession } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import StockPositionManager from '@/components/StockPositionManager'
import DepositManager from '@/components/DepositManager'
import TermDepositManager from '@/components/TermDepositManager'
import WatchlistPanel, { type WatchlistItem } from '@/components/WatchlistPanel'
import UsdWalletManager, { type UsdPurchase } from '@/components/UsdWalletManager'

export const dynamic = 'force-dynamic'

export interface StockPosition {
  id:            string
  ticker:        string
  shares:        number
  avg_cost_usd:  number
  notes:         string | null
  wallet_funded: boolean   // true = comprada con la billetera USD (descuenta del saldo); false = legacy
  created_at:    string
  updated_at:    string
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

  const [{ data: stocks }, { data: savings }, { data: deposits }, { data: watchlist }] = await Promise.all([
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
    .filter(p => p.wallet_funded === true)
    .reduce((s, p) => s + Number(p.shares) * Number(p.avg_cost_usd), 0)

  const stockCount   = stocks?.length   ?? 0
  const savingCount  = savings?.length  ?? 0
  const depositCount = deposits?.length ?? 0

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
            : `${stockCount} posición${stockCount !== 1 ? 'es' : ''} · acciones`}
        </p>
      </div>

      {/* ── Content */}
      {isAhorro ? (
        <>
          <DepositManager
            userId={user.id}
            initialSavings={(savings ?? []) as SavingsAccount[]}
          />
          <UsdWalletManager
            userId={user.id}
            initialPurchases={(usdPurchases ?? []) as UsdPurchase[]}
            investedUsd={investedUsd}
          />
        </>
      ) : isDepositos ? (
        <TermDepositManager
          userId={user.id}
          initialDeposits={(deposits ?? []) as TermDeposit[]}
        />
      ) : (
        <>
          <StockPositionManager
            userId={user.id}
            initialPositions={(stocks ?? []) as StockPosition[]}
            walletUsdBase={walletUsdBase}
          />
          <WatchlistPanel
            userId={user.id}
            initialItems={(watchlist ?? []) as WatchlistItem[]}
            positions={(() => {
              // Agregado por ticker (puede haber varias filas): acciones totales + costo promedio ponderado
              const map: Record<string, { shares: number; avgCost: number }> = {}
              for (const s of (stocks ?? []) as StockPosition[]) {
                const prev = map[s.ticker]
                if (prev) {
                  const totalShares = prev.shares + s.shares
                  map[s.ticker] = {
                    shares: totalShares,
                    avgCost: (prev.shares * prev.avgCost + s.shares * s.avg_cost_usd) / totalShares,
                  }
                } else {
                  map[s.ticker] = { shares: s.shares, avgCost: s.avg_cost_usd }
                }
              }
              return map
            })()}
          />
        </>
      )}

    </div>
  )
}
