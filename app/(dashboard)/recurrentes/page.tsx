import { createClient, getServerSession } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatCLP, getNowChile } from '@/lib/utils'
import RecurringManager from '@/components/RecurringManager'
import CalendarioPagos, { type RecurringWithRelations } from '@/components/CalendarioPagos'
import RecurringOverdueAlert from '@/components/RecurringOverdueAlert'
import ServiceLogo from '@/components/ServiceLogo'
import { CircleDollarSign, CalendarClock, TrendingUp, Sparkles } from 'lucide-react'
import Link from 'next/link'
import type { RecurringExpense } from '@/types'

export const dynamic = 'force-dynamic'

function nextBillingDate(billingDay: number, from: Date, billingMonth: number | null = null): Date {
  const d = from.getDate()
  const m = from.getMonth() + 1
  const y = from.getFullYear()
  // Anual: la próxima ocurrencia es el billing_day de SU mes (este año o el próximo)
  if (billingMonth !== null) {
    const lastOfBm  = (yy: number) => new Date(yy, billingMonth, 0).getDate()
    const thisYear  = new Date(y, billingMonth - 1, Math.min(billingDay, lastOfBm(y)))
    if (billingMonth > m || (billingMonth === m && Math.min(billingDay, lastOfBm(y)) >= d)) return thisYear
    return new Date(y + 1, billingMonth - 1, Math.min(billingDay, lastOfBm(y + 1)))
  }
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

  const { now, year, month, todayDate } = getNowChile()

  // Últimos 3 meses para promedio
  const threeMonthsAgo = new Date(year, now.getMonth() - 3, 1)
  const threeMonthsStr = `${threeMonthsAgo.getFullYear()}-${String(threeMonthsAgo.getMonth() + 1).padStart(2, '0')}-01`

  const thisMonthStr = `${year}-${String(month).padStart(2, '0')}-01`

  const [
    { data: recurring },
    { data: categories },
    { data: paymentMethods },
    { data: allExpenses },
    { data: recentExpenses },
    { data: thisMonthExpenses },
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
    // Pagados este mes (para detectar atrasados)
    supabase
      .from('expenses')
      .select('recurring_expense_id')
      .eq('user_id', user.id)
      .not('recurring_expense_id', 'is', null)
      .gte('date', thisMonthStr),
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
  // Carga mensual: los anuales NO se suman completos cada mes — se prorratean
  // a amount/12. Antes un seguro anual de $600.000 inflaba la "carga mensual"
  // en $600.000 (y el "anual estimado" en $7,2M).
  const monthlyItems = activeItems.filter(r => r.billing_month === null)
  const annualItems  = activeItems.filter(r => r.billing_month !== null)
  const totalMonthly = monthlyItems.reduce((s, r) => s + r.amount, 0)
    + Math.round(annualItems.reduce((s, r) => s + r.amount, 0) / 12)
  const activeCount  = activeItems.length

  // Atrasados: billing_day ya pasó este mes y no hay gasto registrado este mes.
  // Los anuales solo pueden estar atrasados en SU mes de cobro (billing_month);
  // sin este filtro aparecían "atrasados" los 11 meses restantes del año.
  const paidThisMonthSet = new Set(
    (thisMonthExpenses ?? [])
      .map((e: { recurring_expense_id: string | null }) => e.recurring_expense_id)
      .filter(Boolean)
  )
  const overdueItems = activeItems.filter(r =>
    (r.billing_month === null || r.billing_month === month) &&
    r.billing_day < todayDate && !paidThisMonthSet.has(r.id)
  )
  const overdueCount = overdueItems.length
  const overdueNames = overdueItems.map(r => r.name)

  // Próximo cargo — los anuales van a su próxima ocurrencia real (su mes)
  const nextPayment = activeItems.length > 0
    ? activeItems
        .map(r => ({ ...r, nextDate: nextBillingDate(r.billing_day, now, r.billing_month) }))
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
  // Anual estimado: mensuales ×12 + anuales una sola vez (no ×12)
  const yearlyEstimate = monthlyItems.reduce((s, r) => s + r.amount, 0) * 12
    + annualItems.reduce((s, r) => s + r.amount, 0)

  return (
    <div className="px-4 lg:px-8 pt-2 lg:pt-8 pb-8">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-semibold leading-tight" style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--ink)' }}>Gastos recurrentes</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--ink-3)' }}>Visualiza, gestiona y controla tus gastos que se repiten cada mes.</p>
        </div>
      </div>

      {/* ── Alerta atrasados ── */}
      {overdueCount > 0 && (
        <RecurringOverdueAlert count={overdueCount} names={overdueNames} />
      )}

      {/* ── KPI Cards ── */}
      {activeCount > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">

          {/* Carga mensual — azul (mismo hero-gradient que Inversiones, para que
              sea el mismo azul en modo oscuro — var(--primary) sola difiere del
              tono de .hero-gradient en dark) */}
          <div className="rounded-3xl p-4 text-white col-span-2 lg:col-span-1 hero-gradient" style={{ boxShadow: '0 8px 18px var(--shadow)' }}>
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center mb-3" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
              <CircleDollarSign className="w-5 h-5 text-white" />
            </div>
            <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest mb-1">Carga mensual</p>
            <p className="text-2xl font-extrabold tabular-nums leading-tight">{formatCLP(totalMonthly)}</p>
            <p className="text-[11px] text-white/60 mt-1">
              {activeCount} gasto{activeCount !== 1 ? 's' : ''} activo{activeCount !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Próximo cargo */}
          <div className="card p-4">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center mb-3">
              <CalendarClock className="w-5 h-5 text-emerald-600" />
            </div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Próximo cargo</p>
            {nextPayment ? (
              <>
                <p className="text-sm font-bold text-gray-900 leading-tight">
                  {nextDateLabel} · {nextPayment.name}
                </p>
                <p className="text-base font-extrabold tabular-nums mt-0.5 text-brand-600">
                  {formatCLP(nextPayment.amount)}
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-400">Sin próximos cargos</p>
            )}
          </div>

          {/* Promedio mensual */}
          <div className="card p-4">
            <div className="w-10 h-10 rounded-2xl bg-violet-50 flex items-center justify-center mb-3">
              <TrendingUp className="w-5 h-5 text-violet-600" />
            </div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Promedio mensual</p>
            <p className="text-2xl font-extrabold tabular-nums text-gray-900 leading-tight">{formatCLP(avgMonthly)}</p>
            <p className="text-[11px] text-gray-400 mt-1">Últimos 3 meses</p>
          </div>

          {/* Gasto anual estimado */}
          <div className="card p-4">
            <div className="w-10 h-10 rounded-2xl bg-orange-50 flex items-center justify-center mb-3">
              <Sparkles className="w-5 h-5 text-orange-600" />
            </div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Gasto anual estimado</p>
            <p className="text-2xl font-extrabold tabular-nums text-gray-900 leading-tight">{formatCLP(yearlyEstimate)}</p>
            <p className="text-[11px] text-gray-400 mt-1">en base a carga mensual actual</p>
          </div>

        </div>
      )}

      {/* Toggle móvil */}
      <div className="view-toggle-wrap flex items-center gap-1.5 rounded-xl p-1 mb-5 lg:hidden">
        <Link href="/recurrentes" className={`flex-1 flex items-center justify-center py-1.5 rounded-lg text-xs font-semibold transition-all ${!isCalendar ? 'view-toggle-active-purchase' : 'view-toggle-btn'}`}>
          Lista
        </Link>
        <Link href="/recurrentes?view=calendar" className={`flex-1 flex items-center justify-center py-1.5 rounded-lg text-xs font-semibold transition-all ${isCalendar ? 'view-toggle-active-purchase' : 'view-toggle-btn'}`}>
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
