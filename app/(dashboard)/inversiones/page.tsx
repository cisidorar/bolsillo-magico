import { createClient, getServerSession } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
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

  const stockCount   = stocks?.length   ?? 0
  const depositCount = deposits?.length ?? 0

  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-12">

      {/* ── Header: solo título + subtítulo (tabs y botón van en el componente client) */}
      <div className="mb-6">
        <h1
          className="text-3xl font-semibold leading-tight"
          style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--ink)' }}
        >
          Inversiones
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--ink-3)' }}>
          {isAhorro
            ? `${depositCount} depósito${depositCount !== 1 ? 's' : ''} · ahorro`
            : `${stockCount} posición${stockCount !== 1 ? 'es' : ''} · acciones`}
        </p>
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
