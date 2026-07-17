import React from 'react'
import { createClient, getServerSession } from '@/lib/supabase/server'
import { formatCLP, monthName, pct, isEmoji, currentStatementRange, billingPeriod, billingPeriodRange, getNowChile, lastBusinessDay } from '@/lib/utils'
import { getCategoryIcon } from '@/lib/category-icons'
import {
  CreditCard, Calendar, Sun, Moon, AlertTriangle,
  TrendingUp, TrendingDown, CheckCircle2, XCircle,
  Wallet, BarChart3, ArrowRight, Zap,
} from 'lucide-react'
import ExpenseSheet from '@/components/ExpenseSheet'
import EmptyStateCTA from '@/components/EmptyStateCTA'
import AddExpenseInline from '@/components/AddExpenseInline'
import OverduePaySheet from '@/components/OverduePaySheet'
import ServiceLogo from '@/components/ServiceLogo'
import { getExpenseIcon } from '@/lib/expense-icons'
import Link from 'next/link'
import type { ExpenseWithRelations, RecurringExpense, CategoryBudget, PaymentMethod, Category } from '@/types'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const [user, supabase] = await Promise.all([getServerSession(), createClient()])

  const { now, year, month, todayDate, dateStr } = getNowChile()

  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear  = month === 12 ? year + 1 : year
  const monthStr  = String(month).padStart(2, '0')

  const prevM     = month === 1 ? 12 : month - 1
  const prevY     = month === 1 ? year - 1 : year
  const prevMStr  = String(prevM).padStart(2, '0')
  const prevNextM = prevM === 12 ? 1 : prevM + 1
  const prevNextY = prevM === 12 ? prevY + 1 : prevY

  const twoMonthsAgo        = new Date(year, now.getMonth() - 2, 1)
  const statementFetchStart = twoMonthsAgo.toISOString().split('T')[0]

  // ── Preferencia budget_period: mes calendario o período de facturación ────
  // Se resuelve ANTES del fetch principal porque define el rango de gastos.
  // payday_last_business_day va en un select aparte: si esa columna todavía
  // no existe en la DB, no debe tumbar el fetch de budget_period/period_card_id
  // (Postgrest falla la consulta COMPLETA cuando una sola columna no existe).
  const [{ data: profile }, { data: paymentMethods }, { data: paydayPrefRow }] = await Promise.all([
    supabase.from('profiles').select('display_name, payday, budget_period, period_card_id').eq('id', user!.id).maybeSingle(),
    supabase.from('payment_methods').select('*').eq('user_id', user!.id).order('sort_order'),
    supabase.from('profiles').select('payday_last_business_day').eq('id', user!.id).maybeSingle(),
  ])

  const creditCandidates = ((paymentMethods ?? []) as PaymentMethod[])
    .filter(pm => pm.card_type === 'credit' && pm.billing_day)
  const prefPeriod   = (profile as { budget_period?: string } | null)?.budget_period ?? 'calendar'
  const prefCardId   = (profile as { period_card_id?: string | null } | null)?.period_card_id ?? null
  const periodCard   = creditCandidates.find(c => c.id === prefCardId)
    ?? creditCandidates.find(c => (c as { is_default?: boolean }).is_default)
    ?? creditCandidates[0]
    ?? null
  const isBillingMode = prefPeriod === 'billing' && periodCard !== null

  // Rango del período: statement de la tarjeta o mes calendario
  const stmt = isBillingMode ? currentStatementRange(periodCard!.billing_day!) : null
  const addDay = (d: string) => {
    const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + 1)
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  }
  const mainStart  = isBillingMode ? stmt!.start : `${year}-${monthStr}-01`
  const mainEndEx  = isBillingMode ? addDay(stmt!.end) : `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`
  // Período anterior (para el pro-rata "vs anterior")
  const prevStmtM  = stmt ? (stmt.month === 1 ? 12 : stmt.month - 1) : prevM
  const prevStmtY  = stmt ? (stmt.month === 1 ? stmt.year - 1 : stmt.year) : prevY
  const prevRange  = stmt ? billingPeriodRange(prevStmtM, prevStmtY, periodCard!.billing_day!) : null
  const prevStart  = prevRange ? prevRange.start : `${prevY}-${prevMStr}-01`
  const prevEndEx  = prevRange ? addDay(prevRange.end) : `${prevNextY}-${String(prevNextM).padStart(2, '0')}-01`

  const [
    { data: expenses },
    { data: budget },
    { data: categories },
    { data: recurring },
    { data: categoryBudgets },
    { data: allRecurringExpenses },
    { data: statementExpenses },
    { data: prevMonthExpenses },
  ] = await Promise.all([
    supabase
      .from('expenses')
      .select('*, category:categories(*), payment_method:payment_methods(*), recurring_expense:recurring_expenses(id,name,domain)')
      .eq('user_id', user!.id)
      .gte('date', mainStart)
      .lt('date',  mainEndEx)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase.from('budgets').select('amount, month, year')
      .eq('user_id', user!.id).order('year', { ascending: false }).order('month', { ascending: false }).limit(12),
    supabase.from('categories').select('*').eq('user_id', user!.id).order('sort_order'),
    supabase
      .from('recurring_expenses')
      .select('*, category:categories(*), payment_method:payment_methods(*)')
      .eq('user_id', user!.id).eq('is_active', true).order('billing_day'),
    supabase.from('category_budgets').select('*').eq('user_id', user!.id),
    supabase
      .from('expenses')
      .select('recurring_expense_id, date')
      .eq('user_id', user!.id)
      .not('recurring_expense_id', 'is', null)
      .gte('date', `${year - 10}-01-01`),
    supabase
      .from('expenses')
      .select('amount, date, payment_method_id, payment_method:payment_methods(id, name, billing_day, card_type, domain)')
      .eq('user_id', user!.id)
      .gte('date', statementFetchStart)
      .lte('date', now.toISOString().split('T')[0]),
    supabase
      .from('expenses')
      .select('amount, date')
      .eq('user_id', user!.id)
      .gte('date', prevStart)
      .lt('date',  prevEndEx),
  ])

  // ── Derivaciones ─────────────────────────────────────────────────────────
  const paidMap = (allRecurringExpenses ?? []).reduce<Record<string, number>>((acc, e) => {
    if (e.recurring_expense_id) acc[e.recurring_expense_id] = (acc[e.recurring_expense_id] ?? 0) + 1
    return acc
  }, {})
  const recurringWithCounts = ((recurring ?? []) as RecurringExpense[]).map(r => ({
    ...r,
    paid_installments: r.total_installments ? (paidMap[r.id] ?? 0) : r.paid_installments,
  }))

  const typedExpenses = (expenses ?? []) as ExpenseWithRelations[]
  const total         = typedExpenses.reduce((s, e) => s + e.amount, 0)

  // Presupuesto: en modo billing aplica el del mes del estado de cuenta
  type BudgetRow = { amount: number; month: number; year: number }
  const allBudgets   = (budget ?? []) as BudgetRow[]
  const budgetMonth  = stmt ? stmt.month : month
  const budgetYear   = stmt ? stmt.year : year
  const thisBudget   = allBudgets.find(b => b.month === budgetMonth && b.year === budgetYear)
  const budgetAmount = thisBudget?.amount ?? allBudgets[0]?.amount ?? null
  const progressPct   = budgetAmount ? Math.round((total / budgetAmount) * 100) : 0
  const isOver        = budgetAmount ? total > budgetAmount : false

  // Días del período (mes calendario o statement)
  const dayDiff = (a: string, b: string) =>
    Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86_400_000)
  const periodDays      = stmt ? dayDiff(stmt.start, stmt.end) + 1 : new Date(year, month, 0).getDate()
  const periodDayNumber = stmt ? Math.min(dayDiff(stmt.start, dateStr) + 1, periodDays) : todayDate

  // Período anterior — al mismo día (pro-rata)
  const prevCutoff = prevRange
    ? (() => { const c = new Date(prevRange.start + 'T12:00:00'); c.setDate(c.getDate() + periodDayNumber - 1)
        return `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, '0')}-${String(c.getDate()).padStart(2, '0')}` })()
    : null
  const prevMonthSameDate = (prevMonthExpenses ?? []).filter(
    (e: { date: string }) => prevCutoff ? e.date <= prevCutoff : parseInt(e.date.split('-')[2]) <= todayDate
  )
  const prevTotal    = prevMonthSameDate.reduce((s: number, e: { amount: number }) => s + e.amount, 0)
  const deltaVsLast  = total > 0 && prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null
  const savings      = total > 0 && prevTotal > 0 ? prevTotal - total : null  // positivo = gasté menos
  const savingsPct   = savings !== null && prevTotal > 0 ? Math.round((savings / prevTotal) * 100) : null

  const catBudgetMap = new Map(
    ((categoryBudgets ?? []) as CategoryBudget[]).map(b => [b.category_id, b.amount])
  )

  // Resumen por categoría — top 6
  const byCat = typedExpenses.reduce<Record<string, {
    id: string; name: string; color: string; bg_color: string; icon: string; total: number
  }>>((acc, e) => {
    if (!e.category) return acc
    const id = e.category.id
    if (!acc[id]) acc[id] = { id, name: e.category.name, color: e.category.color, bg_color: e.category.bg_color, icon: e.category.icon, total: 0 }
    acc[id].total += e.amount
    return acc
  }, {})
  const catSummary = Object.values(byCat).sort((a, b) => b.total - a.total).slice(0, 6)

  const recurringByCatInicio: Record<string, number> = {}
  typedExpenses.forEach(e => {
    if (!e.category || !e.recurring_expense_id) return
    recurringByCatInicio[e.category.id] = (recurringByCatInicio[e.category.id] ?? 0) + e.amount
  })

  // Resumen rápido — todas las categorías (con y sin límite específico)
  // Sin límite → siempre "dentro". Con límite → comparar contra gasto.
  const allCats       = (categories ?? []) as { id: string }[]
  const catsDentro    = allCats.filter(c => {
    const limit = catBudgetMap.get(c.id) ?? null
    if (limit === null) return true  // sin límite = siempre dentro
    return (byCat[c.id]?.total ?? 0) <= limit
  }).length
  const catsExcedidas = allCats.filter(c => {
    const limit = catBudgetMap.get(c.id) ?? null
    if (limit === null) return false
    return (byCat[c.id]?.total ?? 0) > limit
  }).length
  const allCatsWithBudget = allCats  // para el JSX existente
  const topCat           = catSummary[0]?.name ?? '—'

  // Saludo
  const hour           = now.getHours()
  const greeting       = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'
  const GreetIcon      = hour < 19 ? Sun : Moon
  const greetIconColor = hour < 12 ? '#FBBF24' : hour < 19 ? '#F59E0B' : '#818CF8'
  const rawName        = profile?.display_name ?? user!.email ?? ''
  const displayName    = rawName.includes('@') ? rawName.split('@')[0] : rawName
  const dateLabelRaw   = now.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const dateLabel      = dateLabelRaw.charAt(0).toUpperCase() + dateLabelRaw.slice(1)
  const monthLabel     = now.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })
  const monthLabelCap  = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)

  // Cuenta regresiva al día de sueldo (configurable en Ajustes)
  const payday = (profile as { payday?: number | null } | null)?.payday ?? null
  const paydayIsLastBusinessDay = (paydayPrefRow as { payday_last_business_day?: boolean } | null)?.payday_last_business_day ?? false
  let daysToPayday: number | null = null
  if (paydayIsLastBusinessDay) {
    const dim = new Date(year, month, 0).getDate()
    const effectiveThis = lastBusinessDay(year, month)
    if (todayDate <= effectiveThis) {
      daysToPayday = effectiveThis - todayDate
    } else {
      const nextM = month === 12 ? 1 : month + 1
      const nextY = month === 12 ? year + 1 : year
      daysToPayday = (dim - todayDate) + lastBusinessDay(nextY, nextM)
    }
  } else if (payday) {
    const dim = new Date(year, month, 0).getDate()
    const effectivePayday = Math.min(payday, dim)  // ej: día 30 en febrero
    if (todayDate <= effectivePayday) {
      daysToPayday = effectivePayday - todayDate
    } else {
      const nextDim = new Date(year, month + 1, 0).getDate()
      daysToPayday = (dim - todayDate) + Math.min(payday, nextDim)
    }
  }
  const paydayLabel = daysToPayday === null ? null
    : daysToPayday === 0 ? '¡Hoy llega tu sueldo!'
    : daysToPayday === 1 ? 'Sueldo mañana'
    : `Sueldo en ${daysToPayday} días`

  // KPIs — sobre el período activo (mes calendario o statement)
  const daysElapsed   = periodDayNumber
  const daysInMonth   = periodDays
  const daysRemaining = periodDays - periodDayNumber
  const dailyAvg      = daysElapsed > 0 && total > 0 ? Math.round(total / daysElapsed) : 0
  const projection    = dailyAvg > 0 ? Math.round(dailyAvg * daysInMonth) : 0
  const projOverBudget = budgetAmount && projection > budgetAmount ? projection - budgetAmount : null

  // Labels del período para el hero
  const fmtShort = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }).replace('.', '')
  const gastadoLabel     = isBillingMode ? 'Gastado este período' : 'Gastado este mes'
  const periodWord       = isBillingMode ? 'este período' : 'este mes'
  const periodRangeLabel = stmt ? `${fmtShort(stmt.start)} – ${fmtShort(stmt.end)} · ${periodCard!.name}` : null

  // Estados de cuenta
  const creditCards = ((paymentMethods ?? []) as PaymentMethod[])
    .filter(pm => pm.card_type === 'credit' && pm.billing_day)

  type StatementCard = {
    id: string; name: string; domain: string | null; billingDay: number
    statementMonth: number; statementYear: number
    opensOn: string; closesOn: string
    total: number; count: number
  }
  const statementCards: StatementCard[] = creditCards.map(card => {
    const range   = currentStatementRange(card.billing_day!)
    const inRange = (statementExpenses ?? []).filter(e => {
      if (e.payment_method_id !== card.id) return false
      const bp = billingPeriod(e.date, card.billing_day!)
      return bp.month === range.month && bp.year === range.year
    })
    return {
      id: card.id, name: card.name, domain: card.domain, billingDay: card.billing_day!,
      statementMonth: range.month, statementYear: range.year,
      opensOn: range.start, closesOn: range.end,
      total: inRange.reduce((s: number, e: { amount: number }) => s + e.amount, 0),
      count: inRange.length,
    }
  }).filter(c => c.count > 0)

  // Recurrentes ya pagados ESTE MES (tienen gasto registrado en expenses del mes actual)
  const paidThisMonthSet = new Set(
    typedExpenses.filter(e => e.recurring_expense_id).map(e => e.recurring_expense_id!)
  )

  // Recurrentes pagados el MES ANTERIOR (para detectar atrasos cross-month, ej: billing_day=29 y hoy=1)
  const paidPrevMonthSet = new Set(
    (allRecurringExpenses ?? [])
      .filter((e: { date: string; recurring_expense_id: string | null }) =>
        e.recurring_expense_id && e.date.startsWith(`${prevY}-${prevMStr}`)
      )
      .map((e: { recurring_expense_id: string }) => e.recurring_expense_id)
  )

  // Días en el mes anterior (para calcular daysLate cross-month)
  const lastDayOfPrevMonth = new Date(year, now.getMonth(), 0).getDate()

  // Atrasados: billing_day ya pasó este mes O en el mes anterior (primeros 15 días del nuevo mes)
  type PagoAtrasado = {
    id: string; name: string; amount: number; domain: string | null; daysLate: number
    category_id: string | null; payment_method_id: string | null
  }
  const atrasados: PagoAtrasado[] = recurringWithCounts
    .filter(r => r.is_active)
    .filter(r => {
      if (r.billing_day < todayDate) {
        // Vencido en el ciclo del mes actual
        if (r.billing_month !== null && r.billing_month !== month) return false
        return !paidThisMonthSet.has(r.id)
      } else if (r.billing_day > todayDate && todayDate <= 15) {
        // billing_day > hoy: posible atraso del ciclo del mes anterior (cruce de mes)
        if (r.billing_month !== null && r.billing_month !== prevM) return false
        // Considerar pagado si está en junio O si el usuario lo pagó tarde en el mes actual
        return !paidPrevMonthSet.has(r.id) && !paidThisMonthSet.has(r.id)
      }
      return false
    })
    .map(r => {
      const daysLate = r.billing_day < todayDate
        ? todayDate - r.billing_day
        : (lastDayOfPrevMonth - r.billing_day) + todayDate
      return {
        id: r.id, name: r.name, amount: r.amount, domain: r.domain ?? null, daysLate,
        category_id: r.category_id ?? null, payment_method_id: r.payment_method_id ?? null,
      }
    })
    .sort((a, b) => b.daysLate - a.daysLate)

  // Próximos pagos (7 días) — excluye atrasados (ya cubiertos arriba)
  type ProximoPago = {
    id: string; name: string; amount: number; domain: string | null
    daysUntil: number; label: string; isToday: boolean
  }
  const proximosPagos: ProximoPago[] = recurringWithCounts
    .filter(r => r.is_active)
    .filter(r => {
      if (r.billing_month !== null && r.billing_month !== month) return false
      // Si está atrasado este mes, ya aparece en la sección de arriba
      if (r.billing_day < todayDate && !paidThisMonthSet.has(r.id)) return false
      // Si está atrasado del mes anterior (cruce de mes), también excluir
      if (r.billing_day > todayDate && todayDate <= 15 && !paidPrevMonthSet.has(r.id)) return false
      return true
    })
    .map(r => {
      let d = r.billing_day, m = month, y = year
      // Si ya fue pagado este mes o es hoy → calcular próxima ocurrencia (mes siguiente)
      if (paidThisMonthSet.has(r.id) && d <= todayDate) {
        m = month === 12 ? 1 : month + 1
        y = month === 12 ? year + 1 : year
      }
      const nextDate  = new Date(y, m - 1, d)
      const daysUntil = Math.round(
        (nextDate.getTime() - new Date(year, month - 1, todayDate).getTime()) / 86400000
      )
      const isToday = daysUntil === 0
      const label   = isToday ? 'Hoy' : daysUntil === 1 ? 'Mañana' : `${d} ${monthName(m).slice(0, 3)}`
      return { id: r.id, name: r.name, amount: r.amount, domain: r.domain ?? null, daysUntil, label, isToday }
    })
    .filter(r => r.daysUntil >= 0 && r.daysUntil <= 7)
    .sort((a, b) => a.daysUntil - b.daysUntil)

  // ── Helpers ───────────────────────────────────────────────────────────────
  const StatementCardList = () => (
    <div className="card overflow-hidden" style={{ borderColor: 'var(--border)' }}>
      {statementCards.map((card, i) => {
        const openDate  = new Date(card.opensOn  + 'T12:00:00')
        const closeDate = new Date(card.closesOn + 'T12:00:00')
        const fmt = (d: Date) => d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
        const today0   = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        const close0   = new Date(closeDate.getFullYear(), closeDate.getMonth(), closeDate.getDate())
        const daysLeft = Math.round((close0.getTime() - today0.getTime()) / 86_400_000)
        const daysLabel = daysLeft === 0 ? 'Cierra hoy'
          : daysLeft === 1 ? 'Cierra mañana'
          : daysLeft > 0   ? `Cierra en ${daysLeft}d`
          : 'Cerrado'
        return (
          <Link
            key={card.id}
            href={`/cuenta/${card.id}`}
            className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:opacity-80"
            style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}
          >
            <ServiceLogo domain={card.domain} name={card.name} size={36} className="flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{card.name}</p>
              <p className="text-xs" style={{ color: 'var(--ink-3)' }}>{fmt(openDate)} – {fmt(closeDate)}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(card.total)}</p>
              <p className="text-[10px] font-semibold" style={{ color: daysLeft <= 3 && daysLeft >= 0 ? 'var(--gold)' : 'var(--ink-3)' }}>{daysLabel}</p>
            </div>
            <ArrowRight className="w-3.5 h-3.5 flex-shrink-0 ml-1" style={{ color: 'var(--ink-3)' }} />
          </Link>
        )
      })}
    </div>
  )

  const atrasadosUserId = user!.id

  const ProximosPagosList = () => (
    <div className="card overflow-hidden" style={{ borderColor: 'var(--border)' }}>
      {proximosPagos.map((r, i) => (
        <div key={r.id} className="flex items-center gap-3 px-4 py-3"
          style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
          <ServiceLogo domain={r.domain} name={r.name} size={32} className="flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{r.name}</p>
            <p className="text-[10px] font-semibold" style={{ color: r.isToday ? 'var(--coral)' : r.daysUntil <= 3 ? 'var(--gold)' : 'var(--ink-3)' }}>
              {r.isToday ? 'Hoy' : `${r.label} · en ${r.daysUntil} día${r.daysUntil !== 1 ? 's' : ''}`}
            </p>
          </div>
          <p className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--ink)' }}>{formatCLP(r.amount)}</p>
        </div>
      ))}
    </div>
  )

  return (
    <>
      <div className="px-4 lg:px-8 pt-2 lg:pt-6 pb-2">

        {/* ══════════════════════ DESKTOP (≥ lg) ══════════════════════ */}

        {/* ── Header desktop ── */}
        <div className="hidden lg:flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--ink)' }}>
              ¡{greeting}, {displayName}!
              <GreetIcon className="w-5 h-5 flex-shrink-0" style={{ color: greetIconColor }} />
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--ink-3)' }}>{dateLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Payday badge */}
            {paydayLabel && (
              <div
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold"
                style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', color: daysToPayday === 0 ? 'var(--mint)' : 'var(--ink-2)' }}
              >
                <Wallet className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--mint)' }} />
                {paydayLabel}
              </div>
            )}
            {/* Month badge */}
            <div
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold"
              style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', color: 'var(--ink-2)' }}
            >
              <Calendar className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--primary)' }} />
              {monthLabelCap}
            </div>
          </div>
        </div>

        {/* ── Hero + KPIs side-by-side ── */}
        <div className="hidden lg:grid gap-4 mb-5" style={{ gridTemplateColumns: '1fr 420px' }}>

          {/* Hero card */}
          <div className="hero-gradient rounded-3xl px-8 py-7 text-white flex flex-col justify-between" style={{ minHeight: '190px' }}>
            {total === 0 ? (
              /* ── Empty state hero ── */
              <div className="flex flex-col gap-5">
                <div className="flex items-start justify-between gap-6">
                  <div>
                    <p className="text-xs text-white/60 font-bold uppercase tracking-widest mb-2">{gastadoLabel}</p>
                    <p className="text-6xl font-extrabold text-white tabular-nums leading-none tracking-tight">$0</p>
                    <p className="text-sm text-white/55 mt-2">
                      {budgetAmount
                        ? `Tienes ${formatCLP(budgetAmount)} disponibles ${periodWord}`
                        : 'Aún no hay gastos registrados'}
                    </p>
                  </div>
                  {budgetAmount && (
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-white/60 font-bold uppercase tracking-widest mb-2">Disponible</p>
                      <p className="text-5xl font-extrabold leading-none" style={{ color: '#34D6A2' }}>
                        {formatCLP(budgetAmount)}
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.15)' }}>
                    <Zap className="w-4 h-4 text-white" />
                  </div>
                  <p className="text-sm text-white/70">
                    ¡Nuevo mes! Registra tu primer gasto para empezar a hacer seguimiento.
                  </p>
                </div>
              </div>
            ) : (
              /* ── Normal state hero ── */
              <>
                {/* Top row: gastado + te quedan / por día */}
                <div className="flex items-start justify-between gap-6">
                  <div>
                    <p className="text-xs text-white/60 font-bold uppercase tracking-widest mb-2">{gastadoLabel}</p>
                    <p className="text-6xl font-extrabold text-white tabular-nums leading-none tracking-tight">{formatCLP(total)}</p>
                    <p className="text-sm text-white/45 mt-2">
                      {budgetAmount ? `de ${formatCLP(budgetAmount)} presupuestado` : `${typedExpenses.length} gasto${typedExpenses.length !== 1 ? 's' : ''} registrado${typedExpenses.length !== 1 ? 's' : ''}`}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-white/60 font-bold uppercase tracking-widest mb-2">
                      {budgetAmount ? (isOver ? 'Sobre el límite' : 'Te quedan') : 'Por día'}
                    </p>
                    <p className="text-5xl font-extrabold leading-none"
                      style={{ color: budgetAmount ? (isOver ? '#f87171' : '#34D6A2') : 'rgba(255,255,255,0.90)' }}>
                      {budgetAmount
                        ? (isOver ? `+${formatCLP(total - budgetAmount)}` : formatCLP(budgetAmount - total))
                        : formatCLP(dailyAvg)}
                    </p>
                  </div>
                </div>

                {/* Barra de presupuesto (con budget) o días info (sin budget) */}
                <div className="mt-7">
                  {budgetAmount ? (
                    <>
                      <div className="h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.18)' }}>
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min(100, progressPct)}%`,
                            backgroundColor: isOver ? '#f87171' : '#FFC23C',
                          }}
                        />
                      </div>
                      <div className="flex justify-between mt-2">
                        <span className="text-xs text-white/45">{progressPct}% usado</span>
                        <span className="text-xs text-white/45">{daysRemaining} días restantes</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between">
                      <span className="text-xs text-white/45">Día {daysElapsed} de {daysInMonth}{periodRangeLabel ? ` · ${periodRangeLabel}` : ''}</span>
                      <span className="text-xs text-white/45">{daysRemaining} días restantes</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* KPI 2×2 grid */}
          <div className="grid grid-cols-2 gap-3">

            {/* Por día */}
            <div className="card flex flex-col justify-between p-4" style={{ background: 'var(--surface)' }}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-3)' }}>Por día</p>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--primary-soft)' }}>
                  <BarChart3 className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} />
                </div>
              </div>
              <p className="text-xl font-extrabold tabular-nums leading-none truncate" style={{ color: 'var(--ink)' }}>
                {formatCLP(dailyAvg)}
              </p>
              <p className="text-[10px] mt-1" style={{ color: 'var(--ink-3)' }}>promedio diario</p>
            </div>

            {/* VS. mes anterior */}
            <div className="card flex flex-col justify-between p-4" style={{ background: 'var(--surface)' }}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-3)' }}>
                  VS. {monthName(prevM).slice(0, 3).toUpperCase()}
                </p>
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: deltaVsLast !== null && deltaVsLast < 0 ? 'rgba(31,190,141,0.12)' : 'rgba(255,111,97,0.10)' }}
                >
                  {deltaVsLast !== null && deltaVsLast < 0
                    ? <TrendingDown className="w-3.5 h-3.5" style={{ color: 'var(--mint)' }} />
                    : <TrendingUp   className="w-3.5 h-3.5" style={{ color: 'var(--coral)' }} />
                  }
                </div>
              </div>
              {deltaVsLast !== null ? (
                <>
                  <p className="text-xl font-extrabold tabular-nums leading-none truncate"
                    style={{ color: deltaVsLast < 0 ? 'var(--mint)' : 'var(--coral)' }}>
                    {deltaVsLast < 0 ? '' : '+'}{deltaVsLast}%
                  </p>
                  <p className="text-[10px] mt-1" style={{ color: 'var(--ink-3)' }}>
                    {deltaVsLast < 0 ? 'menos gasto' : 'más gasto'}
                  </p>
                </>
              ) : (
                <p className="text-2xl font-extrabold" style={{ color: 'var(--ink-3)' }}>—</p>
              )}
            </div>

            {/* Disponible / gasto vs. anterior — OJO: esto NO es la tasa de ahorro
                real (ingreso − gasto) que se muestra en /analisis y /ingresos.
                Antes esta card decía "Ahorro" en ambas ramas y chocaba con esa
                métrica: podía leerse "Ahorro $300.000" acá mientras /analisis
                mostraba tasa de ahorro negativa el mismo día. Título dinámico
                según qué se está mostrando en cada rama para no prestarse a
                confusión con la métrica real. */}
            <div className="card flex flex-col justify-between p-4" style={{ background: 'var(--surface)' }}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-3)' }}>
                  {budgetAmount !== null ? 'Disponible' : savings !== null ? 'Gasto vs. anterior' : 'Ahorro'}
                </p>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(31,190,141,0.12)' }}>
                  <Wallet className="w-3.5 h-3.5" style={{ color: 'var(--mint)' }} />
                </div>
              </div>
              {budgetAmount !== null ? (
                <>
                  <p className="text-xl font-extrabold tabular-nums leading-none truncate"
                    style={{ color: budgetAmount - total >= 0 ? 'var(--mint)' : 'var(--coral)' }}>
                    {budgetAmount - total < 0 ? '−' : ''}{formatCLP(Math.abs(budgetAmount - total))}
                  </p>
                  <p className="text-[10px] mt-1" style={{ color: 'var(--ink-3)' }}>
                    {budgetAmount - total >= 0 ? 'disponible aún' : 'sobre el límite'}
                  </p>
                </>
              ) : savings !== null ? (
                <>
                  <p className="text-xl font-extrabold tabular-nums leading-none truncate"
                    style={{ color: savings >= 0 ? 'var(--mint)' : 'var(--coral)' }}>
                    {savings >= 0 ? '' : '−'}{formatCLP(Math.abs(savings))}
                  </p>
                  <p className="text-[10px] mt-1" style={{ color: 'var(--ink-3)' }}>
                    {savingsPct !== null ? `${savings >= 0 ? '+' : ''}${savings >= 0 ? savingsPct : -savingsPct}% este mes` : 'vs. mes anterior'}
                  </p>
                </>
              ) : (
                <p className="text-2xl font-extrabold" style={{ color: 'var(--ink-3)' }}>—</p>
              )}
            </div>

            {/* Proyección */}
            <div
              className="card flex flex-col justify-between p-4"
              style={{
                background: projOverBudget ? 'rgba(239,91,82,0.08)' : 'var(--surface)',
                borderColor: projOverBudget ? 'rgba(239,91,82,0.30)' : undefined,
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1"
                  style={{ color: projOverBudget ? 'rgba(239,91,82,0.60)' : 'var(--ink-3)' }}>
                  Proyección
                  {projOverBudget && <AlertTriangle className="w-3 h-3 flex-shrink-0" style={{ color: 'rgba(239,91,82,0.60)' }} />}
                </p>
                {!projOverBudget && (
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--primary-soft)' }}>
                    <Zap className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} />
                  </div>
                )}
              </div>
              <p className="text-xl font-extrabold tabular-nums leading-none truncate"
                style={{ color: projOverBudget ? 'var(--coral)' : 'var(--ink)' }}>
                {total > 0 ? formatCLP(projection) : '—'}
              </p>
              <p className="text-[10px] mt-1" style={{ color: projOverBudget ? 'rgba(239,91,82,0.60)' : 'var(--ink-3)' }}>
                {projOverBudget ? `+${formatCLP(projOverBudget)} sobre límite` : 'estimado fin de mes'}
              </p>
            </div>

          </div>
        </div>

        {/* ── Grid 3 columnas desktop ── */}
        <div className="hidden lg:grid gap-5 items-start" style={{ gridTemplateColumns: '1.15fr 1fr 310px' }}>

          {/* Col 1 — Categorías */}
          {catSummary.length === 0 ? (
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <h2 className="text-sm font-bold" style={{ color: 'var(--ink-2)' }}>Por categoría</h2>
              </div>
              <div
                className="card flex flex-col items-center justify-center text-center px-6 py-12"
                style={{ borderColor: 'var(--border)', borderStyle: 'dashed' }}
              >
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                  style={{ background: 'var(--primary-soft)' }}
                >
                  <BarChart3 className="w-7 h-7" style={{ color: 'var(--primary)' }} />
                </div>
                <p className="text-sm font-bold mb-1" style={{ color: 'var(--ink)' }}>Sin gastos este mes</p>
                <p className="text-xs leading-relaxed mb-5" style={{ color: 'var(--ink-3)' }}>
                  Cuando registres tu primer gasto, aquí verás el desglose por categoría.
                </p>
                <EmptyStateCTA
                  categories={(categories ?? []) as Category[]}
                  paymentMethods={(paymentMethods ?? []) as PaymentMethod[]}
                />
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <h2 className="text-sm font-bold" style={{ color: 'var(--ink-2)' }}>Por categoría</h2>
                <Link href="/analisis" className="text-sm font-semibold hover:opacity-70 transition-opacity" style={{ color: 'var(--primary)' }}>Ver análisis</Link>
              </div>
              <div className="card overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                {(() => {
                  const maxCatTotal = catSummary[0]?.total ?? 1
                  return catSummary.map((c, idx) => {
                    const limit          = catBudgetMap.get(c.id) ?? null
                    const catPct         = limit ? Math.min(100, Math.round((c.total / limit) * 100)) : Math.round((c.total / maxCatTotal) * 100)
                    const over           = limit ? c.total > limit : false
                    const overPct        = limit && over ? Math.round(((c.total - limit) / limit) * 100) : 0
                    const recurringAmt   = recurringByCatInicio[c.id] ?? 0
                    const isAllRecurring = recurringAmt > 0 && recurringAmt >= c.total
                    const mildOver       = over && !isAllRecurring && overPct < 15
                    const hardOver       = over && !isAllRecurring && overPct >= 15
                    const barColor       = isAllRecurring && over ? c.color : hardOver ? '#FF6F61' : mildOver ? '#FFC23C' : limit && catPct >= 80 ? '#FFC23C' : c.color
                    return (
                      <Link
                        key={c.id}
                        href={`/analisis/${c.id}?month=${month}&year=${year}`}
                        className="flex items-center gap-3 px-4 py-3.5 transition-opacity hover:opacity-80 relative"
                        style={{ borderTop: idx > 0 ? '1px solid var(--border)' : undefined }}
                      >
                        {(hardOver || mildOver) && (
                          <div className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full"
                            style={{ background: hardOver ? '#FF6F61' : '#FFC23C' }} />
                        )}
                        <span
                          className="text-[11px] font-extrabold w-5 flex-shrink-0 tabular-nums text-center"
                          style={{ color: idx === 0 ? '#FFC23C' : idx === 1 ? 'var(--ink-3)' : idx === 2 ? '#FB923C' : 'var(--border)' }}
                        >{idx + 1}</span>
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 cat-icon-bg"
                          style={{ '--cat-bg': c.bg_color, '--cat-color': c.color } as React.CSSProperties}
                        >
                          {isEmoji(c.icon)
                            ? <span className="text-sm">{c.icon}</span>
                            : (() => { const Icon = getCategoryIcon(c.icon); return <Icon className="w-4 h-4" style={{ color: c.color }} /> })()
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2 mb-1.5">
                            <p className="text-[14px] font-semibold truncate" style={{ color: 'var(--ink)' }}>{c.name}</p>
                            <p className="text-[14px] font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--ink)' }}>{formatCLP(c.total)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="progress-track flex-1 h-1.5 rounded-full overflow-hidden" style={{ '--bar-color': barColor } as React.CSSProperties}>
                              <div className="h-full rounded-full transition-all" style={{ width: `${catPct}%`, backgroundColor: barColor }} />
                            </div>
                            <p className="text-[10px] font-semibold flex-shrink-0 w-24 text-right"
                              style={{ color: hardOver ? '#FF6F61' : mildOver ? '#FFC23C' : 'var(--ink-3)' }}>
                              {isAllRecurring && over ? '↻ fijo' : hardOver ? `+${formatCLP(c.total - limit!)} sobre` : mildOver ? `+${overPct}% · cuidado` : limit ? `${catPct}% de ${formatCLP(limit)}` : 'Sin límite'}
                            </p>
                          </div>
                        </div>
                      </Link>
                    )
                  })
                })()}
              </div>
            </div>
          )}

          {/* Col 2 — Últimos gastos */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h2 className="text-sm font-bold" style={{ color: 'var(--ink-2)' }}>Últimos gastos</h2>
              <div className="flex items-center gap-2">
                {typedExpenses.length > 0 && (
                  <Link href="/historial" className="text-sm font-semibold hover:opacity-70 transition-opacity" style={{ color: 'var(--primary)' }}>Ver todo</Link>
                )}
                <AddExpenseInline
                  categories={(categories ?? []) as Category[]}
                  paymentMethods={(paymentMethods ?? []) as PaymentMethod[]}
                />
              </div>
            </div>
            <div className="card overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              {typedExpenses.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center px-6 py-10">
                  <p className="text-sm" style={{ color: 'var(--ink-3)' }}>
                    Registra un gasto y aparecerá aquí al instante.
                  </p>
                </div>
              ) : (
                typedExpenses.slice(0, 8).map((e, i) => {
                  const { icon: Icon, color, bg } = getExpenseIcon(e.description ?? null, e.category?.name ?? null)
                  const d = new Date(e.date + 'T12:00:00')
                  const now2 = new Date()
                  const isToday2    = e.date === now2.toISOString().split('T')[0]
                  const isYesterday = e.date === new Date(now2.getTime() - 86400000).toISOString().split('T')[0]
                  const dayLabel    = isToday2 ? 'Hoy' : isYesterday ? 'Ayer' : d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
                  return (
                    <div
                      key={e.id}
                      className="flex items-center gap-3 px-4 py-3 transition-opacity hover:opacity-80"
                      style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}
                    >
                      {e.category && (
                        <div className="w-[3px] self-stretch rounded-full flex-shrink-0 opacity-70" style={{ background: e.category.color }} />
                      )}
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 cat-icon-bg"
                        style={{ '--cat-bg': bg, '--cat-color': color } as React.CSSProperties}
                      >
                        <Icon className="w-3.5 h-3.5" style={{ color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold truncate" style={{ color: 'var(--ink)' }}>
                          {e.description || e.category?.name || '—'}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {e.category && (
                            <span className="text-[10px] font-medium truncate" style={{ color: e.category.color }}>
                              {e.category.name}
                            </span>
                          )}
                          <span className="text-[10px]" style={{ color: 'var(--ink-3)' }}>· {dayLabel}</span>
                        </div>
                      </div>
                      <p className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--ink)' }}>
                        {formatCLP(e.amount)}
                      </p>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Col 3 — Próximos pagos + Resumen rápido (siempre en col 3) */}
          <div className="space-y-4" style={{ gridColumn: '3' }}>

            {/* ── Tarjeta(s) de crédito ── */}
            {statementCards.length > 0 && (
              <div className="space-y-3">
                {statementCards.map(card => {
                  const closeDate = new Date(card.closesOn + 'T12:00:00')
                  const today0   = new Date(now.getFullYear(), now.getMonth(), now.getDate())
                  const close0   = new Date(closeDate.getFullYear(), closeDate.getMonth(), closeDate.getDate())
                  const daysLeft = Math.round((close0.getTime() - today0.getTime()) / 86_400_000)
                  const daysLabel = daysLeft === 0 ? 'Cierra hoy'
                    : daysLeft === 1 ? 'Cierra mañana'
                    : daysLeft > 0   ? `Cierra en ${daysLeft} días`
                    : 'Cerrado'
                  const urgentColor = daysLeft <= 3 && daysLeft >= 0 ? 'var(--gold)' : 'var(--ink-3)'
                  return (
                    <div key={card.id} className="card p-4" style={{ borderColor: 'var(--border)' }}>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Tarjeta {card.name}</p>
                        <Link href={`/cuenta/${card.id}`} className="text-xs font-semibold hover:opacity-70 transition-opacity" style={{ color: 'var(--primary)' }}>Ver</Link>
                      </div>
                      <div className="flex items-center gap-3 rounded-2xl px-3 py-3" style={{ background: 'var(--surface-2)' }}>
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--surface)' }}>
                          <CreditCard className="w-4 h-4" style={{ color: 'var(--ink-3)' }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold leading-tight" style={{ color: 'var(--ink)' }}>Cupo usado</p>
                          <p className="text-xs mt-0.5" style={{ color: urgentColor }}>{daysLabel}</p>
                        </div>
                        <p className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--ink)' }}>
                          {formatCLP(card.total)}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* ── Pago(s) atrasado(s) ── */}
            {atrasados.length > 0 && (
              <div className="card overflow-hidden" style={{ background: 'rgba(239,91,82,0.08)', borderColor: 'rgba(239,91,82,0.30)' }}>
                <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid rgba(239,91,82,0.15)' }}>
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--coral)' }} />
                  <h2 className="text-sm font-bold" style={{ color: 'var(--coral)' }}>
                    {atrasados.length === 1 ? 'Pago atrasado' : `${atrasados.length} pagos atrasados`}
                  </h2>
                </div>
                {atrasados.map((r, i) => (
                  <OverduePaySheet
                    key={r.id}
                    atrasado={r}
                    userId={atrasadosUserId}
                    dateStr={dateStr}
                    borderTop={i > 0}
                    firstItem={false}
                  />
                ))}
                {atrasados.length === 1 && (
                  <OverduePaySheet
                    atrasado={atrasados[0]}
                    userId={atrasadosUserId}
                    dateStr={dateStr}
                    buttonOnly
                  />
                )}
              </div>
            )}

            {/* ── Próximos pagos ── */}
            {proximosPagos.length > 0 && (
              <div className="card p-4" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Próximos pagos</h2>
                  <Link href="/recurrentes?view=calendar" className="text-xs font-semibold hover:opacity-70 transition-opacity" style={{ color: 'var(--primary)' }}>Ver todo</Link>
                </div>
                <div className="space-y-2">
                  {proximosPagos.map(r => (
                    <div key={r.id} className="flex items-center gap-3 rounded-2xl px-3 py-3" style={{ background: 'var(--surface-2)' }}>
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ background: 'var(--surface)' }}>
                        <ServiceLogo domain={r.domain} name={r.name} size={28} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate leading-tight" style={{ color: 'var(--ink)' }}>{r.name}</p>
                        <p className="text-xs mt-0.5" style={{ color: r.isToday ? 'var(--coral)' : r.daysUntil <= 3 ? 'var(--gold)' : 'var(--ink-3)' }}>
                          {r.isToday ? 'Hoy' : `${r.label} · en ${r.daysUntil} día${r.daysUntil !== 1 ? 's' : ''}`}
                        </p>
                      </div>
                      <p className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--ink)' }}>{formatCLP(r.amount)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Resumen rápido ── */}
            <div className="card p-4" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--ink)' }}>Resumen rápido</h2>
              {allCats.length > 0 && typedExpenses.length > 0 && (
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(31,190,141,0.10)' }}>
                    <p className="text-2xl font-extrabold" style={{ color: 'var(--mint)' }}>{catsDentro}</p>
                    <p className="text-[9px] font-semibold tabular-nums mb-0.5" style={{ color: 'var(--mint)', opacity: 0.7 }}>de {allCats.length}</p>
                    <div className="flex items-center justify-center gap-1">
                      <CheckCircle2 className="w-3 h-3" style={{ color: 'var(--mint)' }} />
                      <p className="text-[10px] font-semibold" style={{ color: 'var(--mint)' }}>dentro</p>
                    </div>
                  </div>
                  <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,111,97,0.10)' }}>
                    <p className="text-2xl font-extrabold" style={{ color: 'var(--coral)' }}>{catsExcedidas}</p>
                    <p className="text-[9px] font-semibold tabular-nums mb-0.5" style={{ color: 'var(--coral)', opacity: 0.7 }}>de {allCats.length}</p>
                    <div className="flex items-center justify-center gap-1">
                      <XCircle className="w-3 h-3" style={{ color: 'var(--coral)' }} />
                      <p className="text-[10px] font-semibold" style={{ color: 'var(--coral)' }}>excedidas</p>
                    </div>
                  </div>
                </div>
              )}
              <div className="space-y-2" style={{ borderTop: typedExpenses.length > 0 ? '1px solid var(--border)' : undefined, paddingTop: typedExpenses.length > 0 ? '12px' : undefined }}>
                <div className="flex justify-between">
                  <span className="text-xs" style={{ color: 'var(--ink-3)' }}>Gastos del mes</span>
                  <span className="text-xs font-bold" style={{ color: 'var(--ink)' }}>{typedExpenses.length > 0 ? typedExpenses.length : '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs" style={{ color: 'var(--ink-3)' }}>Categoría top</span>
                  <span className="text-xs font-bold truncate ml-2" style={{ color: 'var(--ink)' }}>{topCat}</span>
                </div>
              </div>
            </div>

          </div>
        </div>
        {/* ══ FIN DESKTOP ══ */}


        {/* ══════════════════════ MOBILE (< lg) ══════════════════════ */}
        <div className="lg:hidden space-y-4">

          {/* Hero mobile */}
          {/* ── Hero mobile ── */}
          <div className="hero-gradient rounded-3xl px-5 pt-5 pb-4 text-white flex flex-col" style={{ gap: '0' }}>

            {/* Saludo */}
            <div className="flex items-center justify-between gap-2 mb-4">
              <p className="text-base font-bold text-white flex items-center gap-2 min-w-0">
                {greeting}, {displayName}
                <GreetIcon className="w-4 h-4 flex-shrink-0" style={{ color: greetIconColor }} />
              </p>
              {paydayLabel && (
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full flex-shrink-0"
                  style={{ background: 'rgba(255,255,255,0.15)', color: daysToPayday === 0 ? '#34D6A2' : 'rgba(255,255,255,0.85)' }}>
                  {paydayLabel}
                </span>
              )}
            </div>

            {/* Monto + Te quedan */}
            {total === 0 ? (
              /* ── Empty state mobile ── */
              <>
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <p className="text-[10px] text-white/60 font-bold uppercase tracking-widest mb-1">{gastadoLabel}</p>
                    <p className="text-4xl font-extrabold text-white tabular-nums leading-none tracking-tight">$0</p>
                    <p className="text-xs text-white/50 mt-1.5">
                      {budgetAmount ? `${formatCLP(budgetAmount)} disponibles` : 'Sin gastos aún'}
                    </p>
                  </div>
                  {budgetAmount && (
                    <div className="text-right flex-shrink-0">
                      <p className="text-[10px] text-white/60 font-bold uppercase tracking-widest mb-1">Disponible</p>
                      <p className="text-2xl font-extrabold leading-none tabular-nums" style={{ color: '#34D6A2' }}>
                        {formatCLP(budgetAmount)}
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-2xl" style={{ background: 'rgba(255,255,255,0.12)' }}>
                  <Zap className="w-3.5 h-3.5 text-white/70 flex-shrink-0" />
                  <p className="text-xs text-white/65">Registra tu primer gasto del mes</p>
                </div>
              </>
            ) : (
              /* ── Normal state mobile ── */
              <>
                <div className="flex items-start justify-between gap-3 mb-1">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-white/60 font-bold uppercase tracking-widest mb-1">{gastadoLabel}</p>
                    <p className="text-4xl font-extrabold text-white tabular-nums leading-none tracking-tight">
                      {formatCLP(total)}
                    </p>
                    {budgetAmount && (
                      <p className="text-xs text-white/45 mt-1.5">de {formatCLP(budgetAmount)} presupuestado</p>
                    )}
                  </div>
                  {budgetAmount && (
                    <div className="text-right flex-shrink-0">
                      <p className="text-[10px] text-white/60 font-bold uppercase tracking-widest mb-1">
                        {isOver ? 'Sobre el límite' : 'Te quedan'}
                      </p>
                      <p className="text-2xl font-extrabold leading-none tabular-nums"
                        style={{ color: isOver ? '#f87171' : '#34D6A2' }}>
                        {isOver ? `+${formatCLP(total - budgetAmount)}` : formatCLP(budgetAmount - total)}
                      </p>
                    </div>
                  )}
                </div>

                {/* Barra de presupuesto */}
                {budgetAmount && (
                  <div className="mt-4 mb-4">
                    <div className="h-2 bg-white/15 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{
                        width: `${Math.min(100, progressPct)}%`,
                        backgroundColor: isOver ? '#f87171' : '#FFC23C',
                      }} />
                    </div>
                    <div className="flex justify-between mt-1.5">
                      <span className="text-xs text-white/45">{progressPct}% usado</span>
                      <span className="text-xs text-white/45">{daysRemaining} días restantes</span>
                    </div>
                  </div>
                )}

                {/* Chips: Por día + Proyección */}
                <div className="flex gap-2 mt-1">
                  <div className="flex-1 bg-white/15 rounded-2xl px-4 py-3">
                    <p className="text-[10px] text-white/60 font-semibold mb-1">Por día</p>
                    <p className="text-base font-extrabold tabular-nums text-white">{formatCLP(dailyAvg)}</p>
                  </div>
                  <div className="flex-1 rounded-2xl px-4 py-3"
                    style={{ background: projOverBudget ? 'rgba(239,91,82,0.25)' : 'rgba(255,255,255,0.15)' }}>
                    <p className="text-[10px] font-semibold mb-1 flex items-center gap-1"
                      style={{ color: projOverBudget ? 'var(--coral)' : 'rgba(255,255,255,0.60)' }}>
                      Proyección
                      {projOverBudget && <AlertTriangle className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--coral)' }} />}
                    </p>
                    <p className="text-base font-extrabold tabular-nums"
                      style={{ color: projOverBudget ? 'var(--coral)' : 'white' }}>
                      {formatCLP(projection)}
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Estado de cuenta mobile */}
          {statementCards.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <h2 className="text-sm font-bold flex items-center gap-1.5" style={{ color: 'var(--ink-2)' }}>
                  <CreditCard className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} />
                  Estado de cuenta
                </h2>
                <Link href="/historial?view=billing" className="text-sm font-semibold" style={{ color: 'var(--primary)' }}>Ver detalle</Link>
              </div>
              <StatementCardList />
            </div>
          )}

          {/* Por categoría mobile — lista completa (igual que desktop) */}
          {catSummary.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <h2 className="text-sm font-bold" style={{ color: 'var(--ink-2)' }}>Por categoría</h2>
                <Link href="/analisis" className="text-sm font-semibold" style={{ color: 'var(--primary)' }}>Ver análisis</Link>
              </div>
              <div className="card overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                {(() => {
                  const maxCatTotal = catSummary[0]?.total ?? 1
                  return catSummary.map((c, idx) => {
                    const limit        = catBudgetMap.get(c.id) ?? null
                    const catPct       = limit ? Math.min(100, Math.round((c.total / limit) * 100)) : Math.round((c.total / maxCatTotal) * 100)
                    const over         = limit ? c.total > limit : false
                    const overPct      = limit && over ? Math.round(((c.total - limit) / limit) * 100) : 0
                    const recurringAmt = recurringByCatInicio[c.id] ?? 0
                    const isAllRec     = recurringAmt > 0 && recurringAmt >= c.total
                    const mildOver     = over && !isAllRec && overPct < 15
                    const hardOver     = over && !isAllRec && overPct >= 15
                    const barColor     = isAllRec && over ? c.color : hardOver ? '#FF6F61' : mildOver ? '#FFC23C' : limit && catPct >= 80 ? '#FFC23C' : c.color
                    return (
                      <Link
                        key={c.id}
                        href={`/analisis/${c.id}?month=${month}&year=${year}`}
                        className="flex items-center gap-3 px-4 py-3.5 transition-opacity active:opacity-70 relative"
                        style={{ borderTop: idx > 0 ? '1px solid var(--border)' : undefined }}
                      >
                        {(hardOver || mildOver) && (
                          <div className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full"
                            style={{ background: hardOver ? '#FF6F61' : '#FFC23C' }} />
                        )}
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 cat-icon-bg"
                          style={{ '--cat-bg': c.bg_color, '--cat-color': c.color } as React.CSSProperties}
                        >
                          {isEmoji(c.icon)
                            ? <span className="text-lg">{c.icon}</span>
                            : (() => { const Icon = getCategoryIcon(c.icon); return <Icon className="w-5 h-5" style={{ color: c.color }} /> })()
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2 mb-1.5">
                            <p className="text-[14px] font-semibold truncate" style={{ color: 'var(--ink)' }}>{c.name}</p>
                            <div className="text-right flex-shrink-0">
                              <p className="text-[14px] font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(c.total)}</p>
                              <p className="text-[10px] font-semibold"
                                style={{ color: hardOver ? '#FF6F61' : mildOver ? '#FFC23C' : 'var(--ink-3)' }}>
                                {isAllRec && over ? '↻ fijo' : hardOver ? `+${formatCLP(c.total - limit!)} sobre` : mildOver ? `+${overPct}% · cuidado` : limit ? `${catPct}% de ${formatCLP(limit)}` : 'Sin límite'}
                              </p>
                            </div>
                          </div>
                          <div className="progress-track h-1.5 rounded-full overflow-hidden" style={{ '--bar-color': barColor } as React.CSSProperties}>
                            <div className="h-full rounded-full transition-all" style={{ width: `${catPct}%`, backgroundColor: barColor }} />
                          </div>
                        </div>
                      </Link>
                    )
                  })
                })()}
              </div>
            </div>
          )}

          {/* Últimos gastos mobile */}
          {typedExpenses.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <h2 className="text-sm font-bold" style={{ color: 'var(--ink-2)' }}>Últimos gastos</h2>
                <Link href="/historial" className="text-sm font-semibold" style={{ color: 'var(--primary)' }}>Ver todo</Link>
              </div>
              <div className="card overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                {typedExpenses.slice(0, 6).map((e, i) => {
                  const { icon: Icon, color, bg } = getExpenseIcon(e.description ?? null, e.category?.name ?? null)
                  const d = new Date(e.date + 'T12:00:00')
                  const now2 = new Date()
                  const isToday2    = e.date === now2.toISOString().split('T')[0]
                  const isYesterday = e.date === new Date(now2.getTime() - 86400000).toISOString().split('T')[0]
                  const dayLabel    = isToday2 ? 'Hoy' : isYesterday ? 'Ayer' : d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
                  return (
                    <div key={e.id} className="flex items-center gap-3 px-4 py-3"
                      style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                      {e.category && <div className="w-[3px] self-stretch rounded-full flex-shrink-0 opacity-70" style={{ background: e.category.color }} />}
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 cat-icon-bg"
                        style={{ '--cat-bg': bg, '--cat-color': color } as React.CSSProperties}>
                        <Icon className="w-4 h-4" style={{ color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold truncate" style={{ color: 'var(--ink)' }}>
                          {e.description || e.category?.name || '—'}
                        </p>
                        <div className="flex items-center gap-1 mt-0.5">
                          {e.category && <span className="text-[10px] font-medium" style={{ color: e.category.color }}>{e.category.name}</span>}
                          <span className="text-[10px]" style={{ color: 'var(--ink-3)' }}>· {dayLabel}</span>
                        </div>
                      </div>
                      <p className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--ink)' }}>
                        {formatCLP(e.amount)}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Pagos atrasados mobile */}
          {atrasados.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2.5">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--coral)' }} />
                <h2 className="text-sm font-bold" style={{ color: 'var(--coral)' }}>Pagos atrasados</h2>
              </div>
              <div className="card overflow-hidden" style={{ borderColor: '#FAD3CF' }}>
                {atrasados.map((r, i) => (
                  <OverduePaySheet
                    key={r.id}
                    atrasado={r}
                    userId={atrasadosUserId}
                    dateStr={dateStr}
                    borderTop={i > 0}
                    firstItem={i === 0}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Próximos pagos mobile */}
          {proximosPagos.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <h2 className="text-sm font-bold flex items-center gap-1.5" style={{ color: 'var(--ink-2)' }}>
                  <Calendar className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} />
                  Próximos pagos
                </h2>
                <Link href="/recurrentes?view=calendar" className="text-sm font-semibold" style={{ color: 'var(--primary)' }}>Ver calendario</Link>
              </div>
              <ProximosPagosList />
            </div>
          )}

        </div>
        {/* ══ FIN MOBILE ══ */}

      </div>

      <ExpenseSheet
        categories={categories ?? []}
        paymentMethods={paymentMethods ?? []}
      />
    </>
  )
}
