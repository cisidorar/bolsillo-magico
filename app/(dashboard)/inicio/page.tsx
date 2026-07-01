import React from 'react'
import { createClient, getServerSession } from '@/lib/supabase/server'
import { formatCLP, monthName, pct, isEmoji, currentStatementRange, billingPeriod, getNowChile } from '@/lib/utils'
import { getCategoryIcon } from '@/lib/category-icons'
import {
  CreditCard, Calendar, Sun, Moon, AlertTriangle,
  TrendingUp, TrendingDown, CheckCircle2, XCircle,
  Wallet, BarChart3, ArrowRight, Zap,
} from 'lucide-react'
import ExpenseSheet from '@/components/ExpenseSheet'
import OverduePaySheet from '@/components/OverduePaySheet'
import ServiceLogo from '@/components/ServiceLogo'
import { getExpenseIcon } from '@/lib/expense-icons'
import Link from 'next/link'
import type { ExpenseWithRelations, RecurringExpense, CategoryBudget, PaymentMethod } from '@/types'

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

  const [
    { data: expenses },
    { data: budget },
    { data: categories },
    { data: paymentMethods },
    { data: recurring },
    { data: categoryBudgets },
    { data: profile },
    { data: allRecurringExpenses },
    { data: statementExpenses },
    { data: prevMonthExpenses },
  ] = await Promise.all([
    supabase
      .from('expenses')
      .select('*, category:categories(*), payment_method:payment_methods(*), recurring_expense:recurring_expenses(id,name,domain)')
      .eq('user_id', user!.id)
      .gte('date', `${year}-${monthStr}-01`)
      .lt('date',  `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase.from('budgets').select('amount')
      .eq('user_id', user!.id).eq('month', month).eq('year', year).maybeSingle(),
    supabase.from('categories').select('*').eq('user_id', user!.id).order('sort_order'),
    supabase.from('payment_methods').select('*').eq('user_id', user!.id).order('sort_order'),
    supabase
      .from('recurring_expenses')
      .select('*, category:categories(*), payment_method:payment_methods(*)')
      .eq('user_id', user!.id).eq('is_active', true).order('billing_day'),
    supabase.from('category_budgets').select('*').eq('user_id', user!.id),
    supabase.from('profiles').select('display_name').eq('id', user!.id).maybeSingle(),
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
      .gte('date', `${prevY}-${prevMStr}-01`)
      .lt('date',  `${prevNextY}-${String(prevNextM).padStart(2, '0')}-01`),
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
  const budgetAmount  = budget?.amount ?? null
  const progressPct   = budgetAmount ? Math.round((total / budgetAmount) * 100) : 0
  const isOver        = budgetAmount ? total > budgetAmount : false

  // Mes anterior — al mismo día
  const prevMonthSameDate = (prevMonthExpenses ?? []).filter(
    (e: { date: string }) => parseInt(e.date.split('-')[2]) <= todayDate
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

  // KPIs
  const daysElapsed   = todayDate
  const daysInMonth   = new Date(year, month, 0).getDate()
  const daysRemaining = daysInMonth - todayDate
  const dailyAvg      = daysElapsed > 0 && total > 0 ? Math.round(total / daysElapsed) : 0
  const projection    = dailyAvg > 0 ? Math.round(dailyAvg * daysInMonth) : 0
  const projOverBudget = budgetAmount && projection > budgetAmount ? projection - budgetAmount : null

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
        return !paidPrevMonthSet.has(r.id)
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
          {/* Month badge */}
          <div
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold"
            style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', color: 'var(--ink-2)' }}
          >
            <Calendar className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--primary)' }} />
            {monthLabelCap}
          </div>
        </div>

        {/* ── Hero + KPIs side-by-side ── */}
        <div className="hidden lg:grid gap-4 mb-5" style={{ gridTemplateColumns: '1fr 420px' }}>

          {/* Hero card */}
          <div className="hero-gradient rounded-3xl px-8 py-7 text-white flex flex-col justify-between" style={{ minHeight: '160px' }}>
            {total === 0 ? (
              /* ── Empty state hero ── */
              <div className="flex flex-col justify-between h-full" style={{ minHeight: '146px' }}>
                <div className="flex items-start justify-between gap-6">
                  <div>
                    <p className="text-xs text-white/60 font-bold uppercase tracking-widest mb-2">Gastado este mes</p>
                    <p className="text-5xl font-extrabold text-white tabular-nums leading-none tracking-tight">$0</p>
                    <p className="text-sm text-white/55 mt-2">
                      {budgetAmount
                        ? `Tienes ${formatCLP(budgetAmount)} disponibles`
                        : 'Aún no hay gastos registrados'}
                    </p>
                  </div>
                  {budgetAmount && (
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-white/60 font-bold uppercase tracking-widest mb-2">Disponible</p>
                      <p className="text-4xl font-extrabold leading-none" style={{ color: '#34D6A2' }}>
                        {formatCLP(budgetAmount)}
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-5 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }}>
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
                {/* Top row: gastado + te quedan */}
                <div className="flex items-start justify-between gap-6">
                  <div>
                    <p className="text-xs text-white/60 font-bold uppercase tracking-widest mb-2">Gastado este mes</p>
                    <p className="text-5xl font-extrabold text-white tabular-nums leading-none tracking-tight">{formatCLP(total)}</p>
                    {budgetAmount && <p className="text-sm text-white/45 mt-2">de {formatCLP(budgetAmount)} presupuestado</p>}
                  </div>
                  {budgetAmount && (
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-white/60 font-bold uppercase tracking-widest mb-2">
                        {isOver ? 'Sobre el límite' : 'Te quedan'}
                      </p>
                      <p className="text-4xl font-extrabold leading-none" style={{ color: isOver ? '#f87171' : '#34D6A2' }}>
                        {isOver ? `+${formatCLP(total - budgetAmount)}` : formatCLP(budgetAmount - total)}
                      </p>
                    </div>
                  )}
                </div>

                {/* Barra de presupuesto — al fondo de la tarjeta */}
                {budgetAmount && (
                  <div className="mt-6">
                    <div className="h-2 bg-white/15 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, progressPct)}%`,
                          backgroundColor: isOver ? '#f87171' : progressPct >= 80 ? '#FFC23C' : 'rgba(255,255,255,0.85)',
                        }}
                      />
                    </div>
                    <div className="flex justify-between mt-1.5">
                      <span className="text-xs text-white/45">{progressPct}% usado</span>
                      <span className="text-xs text-white/45">{daysRemaining} días restantes</span>
                    </div>
                  </div>
                )}
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

            {/* Ahorro */}
            <div className="card flex flex-col justify-between p-4" style={{ background: 'var(--surface)' }}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-3)' }}>Ahorro</p>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(31,190,141,0.12)' }}>
                  <Wallet className="w-3.5 h-3.5" style={{ color: 'var(--mint)' }} />
                </div>
              </div>
              {savings !== null ? (
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
              style={{ background: projOverBudget ? 'rgba(255,111,97,0.06)' : 'var(--surface)' }}
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-3)' }}>Proyección</p>
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: projOverBudget ? 'rgba(255,111,97,0.15)' : 'var(--primary-soft)' }}
                >
                  {projOverBudget
                    ? <AlertTriangle className="w-3.5 h-3.5" style={{ color: 'var(--coral)' }} />
                    : <Zap           className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} />
                  }
                </div>
              </div>
              <p className="text-xl font-extrabold tabular-nums leading-none truncate"
                style={{ color: projOverBudget ? 'var(--coral)' : 'var(--ink)' }}>
                {total > 0 ? formatCLP(projection) : '—'}
              </p>
              <p className="text-[10px] mt-1" style={{ color: projOverBudget ? 'var(--coral)' : 'var(--ink-3)' }}>
                {projOverBudget ? `+${formatCLP(projOverBudget)} sobre límite` : 'estimado fin de mes'}
              </p>
            </div>

          </div>
        </div>

        {/* ── Grid 3 columnas desktop ── */}
        <div className="hidden lg:grid gap-5 items-start" style={{ gridTemplateColumns: '1.3fr 1fr 240px' }}>

          {/* Col 1 — Categorías */}
          {catSummary.length === 0 ? (
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <h2 className="text-sm font-bold" style={{ color: 'var(--ink-2)' }}>Por categoría</h2>
                <Link href="/historial" className="text-sm font-semibold hover:opacity-70 transition-opacity" style={{ color: 'var(--primary)' }}>Agregar gasto</Link>
              </div>
              <div
                className="card flex flex-col items-center justify-center text-center px-6 py-10"
                style={{ borderColor: 'var(--border)', borderStyle: 'dashed', minHeight: '280px' }}
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
                <Link
                  href="/historial"
                  className="px-4 py-2 text-xs font-bold rounded-xl transition-all hover:opacity-90 active:scale-[.97]"
                  style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 4px 14px var(--shadow)' }}
                >
                  Registrar primer gasto
                </Link>
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
          {typedExpenses.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <h2 className="text-sm font-bold" style={{ color: 'var(--ink-2)' }}>Últimos gastos</h2>
                <Link href="/historial" className="text-sm font-semibold hover:opacity-70 transition-opacity" style={{ color: 'var(--primary)' }}>Ver todo</Link>
              </div>
              <div className="card overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                {typedExpenses.slice(0, 8).map((e, i) => {
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
                })}
              </div>
            </div>
          )}

          {/* Col 3 — Próximos pagos + Resumen rápido */}
          <div className="space-y-4">

            {statementCards.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <h2 className="text-sm font-bold flex items-center gap-1.5" style={{ color: 'var(--ink-2)' }}>
                    <CreditCard className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} />
                    Estado de cuenta
                  </h2>
                  <Link href="/historial?view=billing" className="text-sm font-semibold hover:opacity-70" style={{ color: 'var(--primary)' }}>Ver todo</Link>
                </div>
                <StatementCardList />
              </div>
            )}

            {atrasados.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2.5">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--coral)' }} />
                  <h2 className="text-sm font-bold" style={{ color: 'var(--coral)' }}>
                    Pagos atrasados
                  </h2>
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

            {proximosPagos.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <h2 className="text-sm font-bold flex items-center gap-1.5" style={{ color: 'var(--ink-2)' }}>
                    <Calendar className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} />
                    Próximos pagos
                  </h2>
                  <Link href="/recurrentes?view=calendar" className="text-sm font-semibold hover:opacity-70" style={{ color: 'var(--primary)' }}>Ver todo</Link>
                </div>
                <ProximosPagosList />
              </div>
            )}

            {/* Resumen rápido */}
            <div>
              <h2 className="text-sm font-bold mb-2.5" style={{ color: 'var(--ink-2)' }}>Resumen rápido</h2>
              <div className="card p-4" style={{ borderColor: 'var(--border)' }}>
                {allCats.length > 0 && (
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
                <div className="space-y-2" style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                  <div className="flex justify-between">
                    <span className="text-xs" style={{ color: 'var(--ink-3)' }}>Gastos del mes</span>
                    <span className="text-xs font-bold" style={{ color: 'var(--ink)' }}>{typedExpenses.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs" style={{ color: 'var(--ink-3)' }}>Categoría top</span>
                    <span className="text-xs font-bold truncate ml-2" style={{ color: 'var(--ink)' }}>{topCat}</span>
                  </div>
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
            <p className="text-base font-bold text-white mb-4 flex items-center gap-2">
              {greeting}, {displayName}
              <GreetIcon className="w-4 h-4 flex-shrink-0" style={{ color: greetIconColor }} />
            </p>

            {/* Monto + Te quedan */}
            {total === 0 ? (
              /* ── Empty state mobile ── */
              <>
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <p className="text-[10px] text-white/60 font-bold uppercase tracking-widest mb-1">Gastado este mes</p>
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
                    <p className="text-[10px] text-white/60 font-bold uppercase tracking-widest mb-1">Gastado este mes</p>
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
                        backgroundColor: isOver ? '#f87171' : progressPct >= 80 ? '#FFC23C' : 'rgba(255,255,255,0.85)',
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
                    style={{ background: projOverBudget ? 'rgba(255,111,97,0.25)' : 'rgba(255,255,255,0.15)' }}>
                    <p className="text-[10px] text-white/60 font-semibold mb-1 flex items-center gap-1">
                      Proyección
                      {projOverBudget && <AlertTriangle className="w-3 h-3 flex-shrink-0" style={{ color: '#fca5a5' }} />}
                    </p>
                    <p className="text-base font-extrabold tabular-nums"
                      style={{ color: projOverBudget ? '#fca5a5' : 'white' }}>
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
