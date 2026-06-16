import { createClient, getServerSession } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatCLP } from '@/lib/utils'
import RecurringManager from '@/components/RecurringManager'
import CalendarioPagos, { type RecurringWithRelations } from '@/components/CalendarioPagos'
import Link from 'next/link'
import { CircleDollarSign, CalendarClock } from 'lucide-react'
import type { RecurringExpense } from '@/types'

export const dynamic = 'force-dynamic'

/** Próxima fecha en que cae el día de cobro, desde hoy */
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

  const [{ data: recurring }, { data: categories }, { data: paymentMethods }, { data: allExpenses }] = await Promise.all([
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

  // Próximo cargo más cercano a hoy
  const now = new Date()
  const nextPayment = activeItems.length > 0
    ? activeItems
        .map(r => ({ ...r, nextDate: nextBillingDate(r.billing_day, now) }))
        .sort((a, b) => a.nextDate.getTime() - b.nextDate.getTime())[0]
    : null

  const nextDateLabel = nextPayment
    ? nextPayment.nextDate.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
    : null

  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-8">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-brand-900">Recurrentes</h1>
        <p className="text-sm text-gray-400 mt-0.5">Visualiza tus gastos recurrentes y tu carga mensual.</p>
      </div>

      {/* Toggle Lista / Calendario — solo mobile */}
      <div className="flex items-center gap-1.5 bg-gray-100 rounded-xl p-1 mb-5 lg:hidden">
        <Link
          href="/recurrentes"
          className={`flex-1 flex items-center justify-center py-1.5 rounded-lg text-xs font-semibold transition-all ${
            !isCalendar ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'
          }`}
        >
          Lista
        </Link>
        <Link
          href="/recurrentes?view=calendar"
          className={`flex-1 flex items-center justify-center py-1.5 rounded-lg text-xs font-semibold transition-all ${
            isCalendar ? 'bg-white text-brand-700 shadow-sm' : 'text-gray-500'
          }`}
        >
          Calendario
        </Link>
      </div>

      {/* ── Grid dos columnas ─────────────────────────────────────────────── */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-6 space-y-5 lg:space-y-0">

        {/* ── Columna izquierda ──────────────────────────────────────────── */}
        <div className={`space-y-4 ${isCalendar ? 'hidden lg:block' : 'block'}`}>

          {/* Carga mensual */}
          <div className="card p-5 flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#EEF4FF' }}>
              <CircleDollarSign className="w-7 h-7" style={{ color: '#1B6DD4' }} />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-500">Carga mensual</p>
              <p className="text-2xl font-extrabold text-brand-900 tabular-nums">{formatCLP(totalMonthly)}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {activeCount} gasto{activeCount !== 1 ? 's' : ''} activo{activeCount !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {/* Lista */}
          <div>
            <p className="text-sm font-bold text-gray-700 mb-3 px-0.5">Tus recurrentes</p>
            <RecurringManager
              items={recurringWithCounts}
              categories={categories ?? []}
              paymentMethods={paymentMethods ?? []}
              userId={user.id}
            />
          </div>
        </div>

        {/* ── Columna derecha ────────────────────────────────────────────── */}
        <div className={`space-y-4 ${!isCalendar ? 'hidden lg:block' : 'block'}`}>

          {/* Próximo cargo */}
          {nextPayment && (
            <div className="card p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#F0FDF4' }}>
                <CalendarClock className="w-5 h-5" style={{ color: '#16A34A' }} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-gray-400 mb-0.5">Próximo cargo</p>
                <p className="text-sm font-semibold text-gray-800 truncate">
                  {nextDateLabel}
                  <span className="text-gray-400 font-normal"> · </span>
                  {nextPayment.name}
                  <span className="text-gray-400 font-normal"> · </span>
                  <span className="tabular-nums">{formatCLP(nextPayment.amount)}</span>
                </p>
              </div>
            </div>
          )}

          {/* Calendario */}
          <CalendarioPagos items={recurringWithCounts as unknown as RecurringWithRelations[]} />
        </div>

      </div>
    </div>
  )
}
