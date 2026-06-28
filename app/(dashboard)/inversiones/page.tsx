import { createClient, getServerSession } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TrendingUp } from 'lucide-react'
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

export default async function InversionesPage() {
  const [user, supabase] = await Promise.all([getServerSession(), createClient()])
  if (!user) redirect('/login')

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
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-12 space-y-8">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'var(--primary-soft)' }}
          >
            <TrendingUp className="w-5 h-5" style={{ color: 'var(--primary)' }} />
          </div>
          <h1
            className="text-3xl font-semibold leading-tight"
            style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--ink)' }}
          >
            Inversiones
          </h1>
        </div>
        <p className="text-sm mt-0.5 ml-0.5" style={{ color: 'var(--ink-3)' }}>
          Seguimiento de acciones y depósitos a plazo.
        </p>
      </div>

      {/* ── Acciones ───────────────────────────────────────────────────────── */}
      <section>
        <h2
          className="text-lg font-semibold mb-4"
          style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--ink)' }}
        >
          Acciones
        </h2>
        <StockPositionManager
          userId={user.id}
          initialPositions={(stocks ?? []) as StockPosition[]}
        />
      </section>

      {/* ── Depósitos a plazo ──────────────────────────────────────────────── */}
      <section>
        <h2
          className="text-lg font-semibold mb-4"
          style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--ink)' }}
        >
          Depósitos a plazo
        </h2>
        <DepositManager
          userId={user.id}
          initialDeposits={(deposits ?? []) as TermDeposit[]}
        />
      </section>

    </div>
  )
}
