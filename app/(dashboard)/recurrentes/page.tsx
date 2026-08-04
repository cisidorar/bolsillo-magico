import { createClient, getServerSession } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatCLP, getNowChile, nextPaydayDate, lastClosedStatementRange, billingPeriod, statementDueDate } from '@/lib/utils'
import { buildCashFlowTimeline, withinWindow, type CashFlowEvent } from '@/lib/cash-flow'
import { buildCommittedTimeline } from '@/lib/committed-timeline'
import CommittedTimeline from '@/components/CommittedTimeline'
import RecurringManager from '@/components/RecurringManager'
import CalendarioPagos, { type RecurringWithRelations } from '@/components/CalendarioPagos'
import RecurringOverdueAlert from '@/components/RecurringOverdueAlert'
import FlujoCaja30d from '@/components/FlujoCaja30d'
import ServiceLogo from '@/components/ServiceLogo'
import { CircleDollarSign } from 'lucide-react'
import Link from 'next/link'
import type { RecurringExpense, PaymentMethod } from '@/types'

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

  const { now, year, month, todayDate, dateStr } = getNowChile()

  // Últimos 3 meses para promedio
  const threeMonthsAgo = new Date(year, now.getMonth() - 3, 1)
  const threeMonthsStr = `${threeMonthsAgo.getFullYear()}-${String(threeMonthsAgo.getMonth() + 1).padStart(2, '0')}-01`

  const thisMonthStr = `${year}-${String(month).padStart(2, '0')}-01`

  // Ventana para totales de estado de cuenta abierto (F8) — 2 meses cubre
  // cualquier statement en curso incluso si empezó el mes pasado.
  const twoMonthsAgo        = new Date(year, now.getMonth() - 2, 1)
  const statementFetchStart = twoMonthsAgo.toISOString().split('T')[0]

  const [
    { data: recurring },
    { data: categories },
    { data: paymentMethods },
    { data: allExpenses },
    { data: recentExpenses },
    { data: thisMonthExpenses },
    { data: profile },
    { data: paydayPrefRow },
    { data: lastIncome },
    { data: statementExpenses },
  ] = await Promise.all([
    supabase
      .from('recurring_expenses')
      .select('*, category:categories(*), payment_method:payment_methods(*)')
      .eq('user_id', user.id)
      .order('billing_day'),
    supabase.from('categories').select('*').eq('user_id', user.id).order('sort_order'),
    supabase.from('payment_methods').select('*').eq('user_id', user.id).order('sort_order'),
    // E6: también trae amount/date — sirve para paidMap (conteo) Y para la
    // auditoría de recurrentes (costo total pagado, detección de alza de
    // precio) sin una query aparte.
    supabase
      .from('expenses')
      .select('recurring_expense_id, amount, date')
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
    // F8 — Calendario de flujo de caja: payday, último sueldo, estados abiertos
    supabase.from('profiles').select('payday').eq('id', user.id).maybeSingle(),
    supabase.from('profiles').select('payday_last_business_day').eq('id', user.id).maybeSingle(),
    supabase
      .from('incomes')
      .select('amount, month, year')
      .eq('user_id', user.id)
      .order('year', { ascending: false })
      .order('month', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('expenses')
      .select('amount, date, payment_method_id')
      .eq('user_id', user.id)
      .gte('date', statementFetchStart)
      .lte('date', now.toISOString().split('T')[0]),
  ])

  const paidMap = (allExpenses ?? []).reduce<Record<string, number>>((acc, e) => {
    if (e.recurring_expense_id) acc[e.recurring_expense_id] = (acc[e.recurring_expense_id] ?? 0) + 1
    return acc
  }, {})

  // E6: historial completo por recurrente (para costo anualizado, total
  // pagado y detección de alza de precio en RecurringManager).
  const expensesByRecurring = (allExpenses ?? []).reduce<Record<string, { amount: number; date: string }[]>>((acc, e) => {
    if (!e.recurring_expense_id) return acc
    ;(acc[e.recurring_expense_id] ??= []).push({ amount: e.amount, date: e.date })
    return acc
  }, {})

  const recurringWithCounts = ((recurring ?? []) as RecurringExpense[]).map(r => ({
    ...r,
    paid_installments: r.total_installments ? (paidMap[r.id] ?? 0) : r.paid_installments,
  }))

  const activeItems  = recurringWithCounts.filter(r => r.is_active)
  // Bug reportado por Cas: una cuota ya pagada completa (3/3) seguía
  // proyectándose como si fuera a cobrarse de nuevo — "carga mensual",
  // "atrasados" y el calendario de flujo de caja (F8, más abajo) usaban
  // activeItems sin descontar las cuotas ya terminadas (is_active puede
  // seguir en true aunque no quede nada por cobrar; RecurringManager.tsx ya
  // distingue "Completado" de "Activo" para mostrar el badge, pero acá no se
  // aplicaba el mismo criterio a los cálculos). ongoingItems son las
  // activeItems que TODAVÍA generan cobros futuros.
  const isInstallmentDone = (r: { total_installments: number | null; paid_installments: number | null }) =>
    r.total_installments != null && r.total_installments > 0 && (r.paid_installments ?? 0) >= r.total_installments
  const ongoingItems = activeItems.filter(r => !isInstallmentDone(r))
  // Carga mensual: los anuales NO se suman completos cada mes — se prorratean
  // a amount/12. Antes un seguro anual de $600.000 inflaba la "carga mensual"
  // en $600.000 (y el "anual estimado" en $7,2M).
  const monthlyItems = ongoingItems.filter(r => r.billing_month === null)
  const annualItems  = ongoingItems.filter(r => r.billing_month !== null)
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
  const overdueItems = ongoingItems.filter(r =>
    (r.billing_month === null || r.billing_month === month) &&
    r.billing_day < todayDate && !paidThisMonthSet.has(r.id)
  )
  const overdueCount = overdueItems.length
  const overdueNames = overdueItems.map(r => r.name)

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

  // ── F8 — Calendario de flujo de caja (próximos 30 días) ──────────────────
  const paydayNum        = (profile as { payday?: number | null } | null)?.payday ?? null
  const paydayIsLBD       = (paydayPrefRow as { payday_last_business_day?: boolean } | null)?.payday_last_business_day ?? false
  const nextPayday        = nextPaydayDate(dateStr, paydayNum, paydayIsLBD)
  const hasPayday         = nextPayday !== null
  type IncomeRowRec = { amount: number; month: number; year: number }
  const sueldoEstimado    = (lastIncome as IncomeRowRec | null)?.amount ?? null

  const cashFlowEvents: CashFlowEvent[] = []

  if (nextPayday && sueldoEstimado !== null) {
    cashFlowEvents.push({ date: nextPayday, type: 'income', label: 'Sueldo', amount: sueldoEstimado })
  }

  ongoingItems.forEach(r => {
    const d = nextBillingDate(r.billing_day, now, r.billing_month)
    const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    cashFlowEvents.push({
      date: dStr, type: 'recurring', label: r.name, amount: -r.amount,
      sublabel: r.category?.name, domain: r.domain ?? null,
    })
  })

  const creditCardsF8 = ((paymentMethods ?? []) as PaymentMethod[])
    .filter(pm => pm.card_type === 'credit' && pm.billing_day)
  const cardsWithoutDueDay = creditCardsF8.filter(c => !c.payment_due_day).map(c => c.name)

  // Estados de cuenta con vencimiento conocido — se calculan una sola vez y
  // alimentan tanto el Flujo de caja 30 días como "Ya comprometido" (E2). Solo
  // se conoce con certeza el estado YA CERRADO más próximo a vencer; no se
  // proyectan estados futuros (el gasto con tarjeta de meses venideros no
  // existe todavía), a diferencia de las cuotas y fijos, que sí son conocidos
  // de antemano.
  const cardStatements = creditCardsF8.filter(c => c.payment_due_day).map(card => {
    // Estado YA CERRADO más reciente, no el que se está acumulando ahora —
    // es el monto real que vence pronto (mismo criterio que Ciclo de sueldo
    // en /inicio, ver lib/utils.ts).
    const range = lastClosedStatementRange(card.billing_day!)
    const total = (statementExpenses ?? [])
      .filter((e: { payment_method_id: string | null; date: string }) => {
        if (e.payment_method_id !== card.id) return false
        const bp = billingPeriod(e.date, card.billing_day!)
        return bp.month === range.month && bp.year === range.year
      })
      .reduce((s: number, e: { amount: number }) => s + e.amount, 0)
    const dueDate = statementDueDate(range.month, range.year, card.payment_due_day!)
    return { label: card.name, amount: total, dueDate, domain: card.domain }
  })

  cardStatements.forEach(st => {
    cashFlowEvents.push({
      date: st.dueDate, type: 'card', label: st.label, amount: -st.amount,
      sublabel: 'estado de cuenta', domain: st.domain,
    })
  })

  const cashFlowTimelineFull = buildCashFlowTimeline(cashFlowEvents, dateStr)
  const cashFlowTimeline     = withinWindow(cashFlowTimelineFull, 30)

  // ── E2 — Línea de tiempo de compromiso (próximos 6 meses) ────────────────
  // Sin estados de cuenta de tarjeta a propósito: el monto de la tarjeta
  // cambia cada mes según lo que se gaste, así que no es algo "comprometido"
  // de antemano como una cuota o un fijo — mezclarlo distorsionaba la
  // proyección. Ese vencimiento puntual ya vive en Flujo de caja 30 días.
  const committedItems = activeItems.map(r => ({
    name: r.name,
    amount: r.amount,
    billing_month: r.billing_month,
    totalInstallments: r.total_installments,
    paidInstallments: r.paid_installments ?? 0,
    isActive: r.is_active,
  }))
  const committedMonths = buildCommittedTimeline(committedItems, month, year, 6)

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

      {/* ── KPI: un solo número (UX3) — antes 4 cards con variaciones del mismo
          concepto ("cuánto pesan mis fijos"). "Próximo cargo" ahora vive en
          Flujo de caja (30 días, más abajo), que ya es más preciso porque
          también cruza tarjetas y sueldo, no solo recurrentes. */}
      {activeCount > 0 && (
        <div className="rounded-3xl p-5 text-white mb-6 hero-gradient" style={{ boxShadow: '0 8px 18px var(--shadow)' }}>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
                  <CircleDollarSign className="w-4 h-4 text-white" />
                </div>
                <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest">Carga mensual</p>
              </div>
              <p className="text-3xl font-extrabold tabular-nums leading-tight">{formatCLP(totalMonthly)}</p>
              <p className="text-[11px] text-white/60 mt-1.5">
                {activeCount} gasto{activeCount !== 1 ? 's' : ''} activo{activeCount !== 1 ? 's' : ''}
                {' '}· ≈{formatCLP(avgMonthly)} promedio real (3m) · {formatCLP(yearlyEstimate)} al año
              </p>
            </div>
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
            expensesByItem={expensesByRecurring}
          />
        </div>

        {/* Calendario + Flujo de caja */}
        <div className={(!isCalendar ? 'hidden lg:block' : 'block') + ' space-y-5'}>
          <CommittedTimeline months={committedMonths} income={sueldoEstimado} />
          <FlujoCaja30d
            events={cashFlowTimeline}
            hasPayday={hasPayday}
            hasIncome={sueldoEstimado !== null}
            cardsWithoutDueDay={cardsWithoutDueDay}
            muteRiskBanner={overdueCount > 0}
          />
          <CalendarioPagos items={recurringWithCounts as unknown as RecurringWithRelations[]} />
        </div>
      </div>
    </div>
  )
}
