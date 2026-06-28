import { createClient, getServerSession } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TrendingUp, Landmark } from 'lucide-react'
import Link from 'next/link'
import StockPositionManager from '@/components/StockPositionManager'
import DepositManager from '@/components/DepositManager'

export const dynamic = 'force-dynamic'

export interface StockPosition {
  id:           string
  ticker:       string
  shares:       number
  avg_cost_usd: number
  notes:        string | null
  created_at:   string
  updated_at:   string
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

  const isAhorro = sp.view === 'ahorro'

  const [{ data: stocks }, { data: deposits }] = await Promise.all([
    supabase
      .from('stock_positions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('term_deposits')
      .select('*')
      .eq('user_id', user.id)
      .order('maturity_date', { ascending: true }),
  ])

  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-12">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="mb-5">
        <h1
          className="text-3xl font-semibold leading-tight"
          style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--ink)' }}
        >
          Inversiones
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--ink-3)' }}>
          {isAhorro ? 'Depósitos a plazo y ahorro.' : 'Acciones y renta variable.'}
        </p>
      </div>

      {/* ── Toggle ─────────────────────────────────────────────────────────── */}
      <div className="view-toggle-wrap flex items-center gap-1.5 rounded-xl p-1 mb-6">
        <Link
          href="/inversiones"
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            !isAhorro ? 'view-toggle-active-purchase' : 'view-toggle-btn'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          Acciones
        </Link>
        <Link
          href="/inversiones?view=ahorro"
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            isAhorro ? 'view-toggle-active-purchase' : 'view-toggle-btn'
          }`}
        >
          <Landmark className="w-3.5 h-3.5" />
          Ahorro
        </Link>
      </div>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      {!isAhorro ? (
        <StockPositionManager
          userId={user.id}
          initialPositions={(stocks ?? []) as StockPosition[]}
        />
      ) : (
        <DepositManager
          userId={user.id}
          initialDeposits={(deposits ?? []) as TermDeposit[]}
        />
      )}

    </div>
  )
}
