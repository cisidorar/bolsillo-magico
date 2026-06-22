import { createClient, getServerSession } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatCLP } from '@/lib/utils'
import RecurringManager from '@/components/RecurringManager'
import CalendarioPagos, { type RecurringWithRelations } from '@/components/CalendarioPagos'
import ServiceLogo from '@/components/ServiceLogo'
import { CircleDollarSign, CalendarClock, TrendingUp, Sparkles } from 'lucide-react'
import Link from 'next/link'
import type { RecurringExpense } from '@/types'

export const dynamic = 'force-dynamic'

function nextBillingDate(billingDay: number, from: Date): Date {
  const d = from.getDate()
  const m = from.getMonth() + 1
  const y = from.getFullYear()
  const lastThisMonth = new Date(y, m, 0).getDate()
  const thisMonthDay  = Math.min(billingDay, lastThisMonth)
  if (thisMonthDay >= d) return new Date(y, m - 1, thisMonthDay)
  const nextM    = m === 12 ? 1 : m + 1
  const nextY    = m === 12 ? y + 1 : y
  const lastNext = new Date(nextY, nextM, 0).getDate()
  return new Date(nextY, nextM - 1, Math.min(billingDay, lastNext))
}

export default async function RecurrentesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>
}) {
  const { view } = await searchParams
  const isCalendar = view === 'calendar'

  const [user, supabase] = await Promise.all([getServerSession(), createClient()])
  if (!user) redirect('/login')

  const now   = new Date()
  const month = now.getMonth() + 1
  const year  = now.getFullYear()

  // Últimos 3 meses para promedio
  const threeMonthsAgo = new Date(year, now.getMonth() - 3, 1)
  const threeMonthsStr = `${threeMonthsAgo.getFullYear()}-${String(threeMonthsAgo.getMonth() + 1).padStart(2, '0')}-01`

  const [
    { data: recurring },
    { data: categories },
    { data: paymentMethods },
    { data: allExpenses },
    { data: recentExpenses },
  ] = await Promise.all([
    supabase
      .from('recurring_expenses')
      .select('*, category:categories(*), payment_method:payment_methods(*)')
      .eq('user_id', user.id)
      .order('billing_day'),
    supabase.from('categories').select('*').eq('user_id', user.id).order('sort_order'),
    supabase.from('payment_methods').select('*').eq('user_id', user.id).order('sort_order'),
    supabase
      .from('expenses')
      .select('recurring_expense_id')
      .eq('user_id', user.id)
      .not('recurring_expense_id', 'is', null),
    // Gastos recurrentes últimos 3 meses para calcular promedio real
    supabase
      .from('expenses')
      .select('amount, date, recurring_expense_id')
      .eq('user_id', user.id)
      .not('recurring_expense_id', 'is', null)
      .gte('date', threeMonthsStr),
  ])

  const paidMap = (allExpenses ?? []).reduce<Record<string, number>>((acc, e) => {
    if (e.recurring_expense_id) acc[e.recurring_expense_id] = (acc[e.recurring_expense_id] ?? 0) + 1
    return acc
  }, {})

  const recurringWithCounts = ((recurring ?? []) as RecurringExpense[]).map(r => ({
    ...r,
    paid_installments: r.total_installments ? (paidMap[r.id] ?? 0) : r.paid_installments,
  }))

  const activeItems  = recurringWithCounts.filter(r => r.is_active)
  const totalMonthly = activeItems.reduce((s, r) => s + r.amount, 0)
  const activeCount  = activeItems.length

  // Próximo cargo
  const nextPayment = activeItems.length > 0
    ? activeItems
        .map(r => ({ ...r, nextDate: nextBillingDate(r.billing_day, now) }))
        .sort((a, b) => a.nextDate.getTime() - b.nextDate.getTime())[0]
    : null
  const nextDateLabel = nextPayment
    ? nextPayment.nextDate.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
    : null

  // Promedio mensual real (últimos 3 meses)
  const monthlyTotals: Record<string, number> = {}
  ;(recentExpenses ?? []).forEach(e => {
    const key = e.date.slice(0, 7) // YYYY-MM
    monthlyTotals[key] = (monthlyTotals[key] ?? 0) + e.amount
  })
  const monthKeys      = Object.keys(monthlyTotals).sort().slice(-3)
  const avgMonthly     = monthKeys.length > 0
    ? Math.round(monthKeys.reduce((s, k) => s + monthlyTotals[k], 0) / monthKeys.length)
    : totalMonthly
  const yearlyEstimate = totalMonthly * 12

  return (
    <div className="px-4 lg:px-8 pt-2 lg:pt-8 pb-8">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-brand-900">Gastos recurrentes</h1>
          <p className="text-sm text-gray-400 mt-0.5">Visualiza, gestiona y controla tus gastos que se repiten cada mes.</p>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      {activeCount > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">

          {/* Carga mensual — azul */}
          <div className="rounded-3xl p-4 text-white col-span-2 lg:col-span-1" style={{ backgroundColor: '#1B6DD4', boxShadow: '0 6px 24px rgba(27,109,212,.35)' }}>
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center mb-3" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
              <CircleDollarSign className="w-5 h-5 text-white" />
            </div>
            <p className="text-[11px] font-bold text-white/70 uppercase tracking-widest mb-1">Carga mensual</p>
            <p className="text-2xl font-extrabold tabular-nums leading-tight">{formatCLP(totalMonthly)}</p>
            <p className="text-[11px] text-white/60 mt-1">
              {activeCount} gasto{activeCount !== 1 ? 's' : ''} activo{activeCount !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Próximo cargo */}
          <div className="card p-4">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center mb-3" style={{ backgroundColor: '#F0FDF4' }}>
              <CalendarClock className="w-5 h-5" style={{ color: '#16A34A' }} />
            </div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1">Próximo cargo</p>
            {nextPayment ? (
              <>
                <p className="text-sm font-bold text-gray-900 leading-tight">
                  {nextDateLabel} · {nextPayment.name}
                </p>
                <p className="text-base font-extrabold tabular-nums mt-0.5" style={{ color: '#1B6DD4' }}>
                  {formatCLP(nextPayment.amount)}
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-400">Sin próximos cargos</p>
            )}
          </div>

          {/* Promedio mensual */}
          <div className="card p-4">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center mb-3" style={{ backgroundColor: '#F5F3FF' }}>
              <TrendingUp className="w-5 h-5" style={{ color: '#7C3AED' }} />
            </div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1">Promedio mensual</p>
            <p className="text-2xl font-extrabold tabular-nums text-gray-900 leading-tight">{formatCLP(avgMonthly)}</p>
            <p className="text-[11px] text-gray-400 mt-1">Últimos 3 meses</p>
          </div>

          {/* Ahorro anual estimado */}
          <div className="card p-4">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center mb-3" style={{ backgroundColor: '#FFF7ED' }}>
              <Sparkles className="w-5 h-5" style={{ color: '#EA580C' }} />
            </div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1">Gasto anual estimado</p>
            <p className="text-2xl font-extrabold tabular-nums text-gray-900 leading-tight">{formatCLP(yearlyEstimate)}</p>
            <p className="text-[11px] text-gray-400 mt-1">vs. gastos no recurrentes</p>
          </div>

        </div>
      )}

      {/* Toggle móvil */}
      <div className="flex items-center gap-1.5 bg-gray-100 rounded-xl p-1 mb-5 lg:hidden">
        <Link href="/recurrentes" className={`flex-1 flex items-center justify-center py-1.5 rounded-lg text-xs font-semibold transition-all ${!isCalendar ? 'tab-active text-gray-800 shadow-sm' : 'text-gray-500'}`}>
          Lista
        </Link>
        <Link href="/recurrentes?view=calendar" className={`flex-1 flex items-center justify-center py-1.5 rounded-lg text-xs font-semibold transition-all ${isCalendar ? 'tab-active text-brand-700 shadow-sm' : 'text-gray-500'}`}>
          Calendario
        </Link>
      </div>

      {/* ── Grid ── */}
      <div className="lg:grid lg:grid-cols-[1fr_420px] lg:gap-6 space-y-5 lg:space-y-0">

        {/* Lista */}
        <div className={isCalendar ? 'hidden lg:block' : 'block'}>
          <RecurringManager
            items={recurringWithCounts}
            categories={categories ?? []}
            paymentMethods={paymentMethods ?? []}
            userId={user.id}
          />
        </div>

        {/* Calendario */}
        <div className={!isCalendar ? 'hidden lg:block' : 'block'}>
          <CalendarioPagos items={recurringWithCounts as unknown as RecurringWithRelations[]} />
        </div>
      </div>
    </div>
  )
}
