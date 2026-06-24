import React from 'react'
import { createClient, getServerSession } from '@/lib/supabase/server'
import { formatCLP, monthName, pct, isEmoji, currentStatementRange, billingPeriod } from '@/lib/utils'
import { getCategoryIcon } from '@/lib/category-icons'
import { CreditCard, Calendar, Sun, Moon, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react'
import ExpenseSheet from '@/components/ExpenseSheet'
import ServiceLogo from '@/components/ServiceLogo'
import { getExpenseIcon } from '@/lib/expense-icons'
import Link from 'next/link'
import type { ExpenseWithRelations, RecurringExpense, CategoryBudget, PaymentMethod } from '@/types'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const [user, supabase] = await Promise.all([getServerSession(), createClient()])

  const now       = new Date()
  const month     = now.getMonth() + 1
  const year      = now.getFullYear()
  const todayDate = now.getDate()

  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear  = month === 12 ? year + 1 : year
  const monthStr  = String(month).padStart(2, '0')

  // Previous month
  const prevM     = month === 1 ? 12 : month - 1
  const prevY     = month === 1 ? year - 1 : year
  const prevMStr  = String(prevM).padStart(2, '0')
  const prevNextM = prevM === 12 ? 1 : prevM + 1
  const prevNextY = prevM === 12 ? prevY + 1 : prevY

  // Para el widget de estado de cuenta
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
      .select('recurring_expense_id')
      .eq('user_id', user!.id)
      .not('recurring_expense_id', 'is', null)
      .gte('date', `${year - 10}-01-01`),
    supabase
      .from('expenses')
      .select('amount, date, payment_method_id, payment_method:payment_methods(id, name, billing_day, card_type, domain)')
      .eq('user_id', user!.id)
      .gte('date', statementFetchStart)
      .lte('date', now.toISOString().split('T')[0]),
    // Prev month for vs-anterior (al mismo día del mes)
    supabase
      .from('expenses')
      .select('amount, date')
      .eq('user_id', user!.id)
      .gte('date', `${prevY}-${prevMStr}-01`)
      .lt('date',  `${prevNextY}-${String(prevNextM).padStart(2, '0')}-01`),
  ])

  // ── Derivaciones básicas ──────────────────────────────────────────────────
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

  // Mes anterior — comparación al mismo día del mes
  const prevMonthSameDate = (prevMonthExpenses ?? []).filter(
    (e: { date: string }) => parseInt(e.date.split('-')[2]) <= todayDate
  )
  const prevTotal = prevMonthSameDate.reduce((s: number, e: { amount: number }) => s + e.amount, 0)
  const deltaVsLast = prevTotal > 0
    ? Math.round(((total - prevTotal) / prevTotal) * 100)
    : null

  const catBudgetMap = new Map(
    ((categoryBudgets ?? []) as CategoryBudget[]).map(b => [b.category_id, b.amount])
  )

  // Resumen por categoría — top 4
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

  // Recurring amount per category — to avoid false alarms on fixed costs
  const recurringByCatInicio: Record<string, number> = {}
  typedExpenses.forEach(e => {
    if (!e.category || !e.recurring_expense_id) return
    recurringByCatInicio[e.category.id] = (recurringByCatInicio[e.category.id] ?? 0) + e.amount
  })

  // Saludo + fecha
  const hour        = now.getHours()
  const greeting    = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'
  const GreetIcon      = hour < 19 ? Sun : Moon
  const greetIconColor = hour < 12 ? '#FBBF24' : hour < 19 ? '#F59E0B' : '#818CF8'
  const rawName     = profile?.display_name ?? user!.email ?? ''
  const displayName = rawName.includes('@') ? rawName.split('@')[0] : rawName
  const dateLabelRaw = now.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const dateLabel    = dateLabelRaw.charAt(0).toUpperCase() + dateLabelRaw.slice(1)

  // Indicadores financieros
  const daysElapsed = todayDate
  const daysInMonth = new Date(year, month, 0).getDate()
  const dailyAvg    = daysElapsed > 0 && total > 0 ? Math.round(total / daysElapsed) : 0
  const projection  = dailyAvg > 0 ? Math.round(dailyAvg * daysInMonth) : 0

  // ── Estados de cuenta ────────────────────────────────────────────────────
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

  // ── Próximos pagos ────────────────────────────────────────────────────────
  type ProximoPago = {
    id: string; name: string; amount: number; domain: string | null
    daysUntil: number; label: string; isToday: boolean
  }
  const proximosPagos: ProximoPago[] = recurringWithCounts
    .filter(r => r.is_active)
    .map(r => {
      let d = r.billing_day, m = month, y = year
      if (d < todayDate) {
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
    .filter(r => r.daysUntil <= 7)
    .sort((a, b) => a.daysUntil - b.daysUntil)

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="px-4 lg:px-8 pt-2 lg:pt-8 pb-2 lg:grid lg:grid-cols-[3fr,2fr] lg:gap-6 lg:items-start">

        {/* ══ LEFT COLUMN ══════════════════════════════════════════════ */}
        <div className="space-y-4">

          {/* ── Desktop header ────────────────────────────────────────── */}
          <div className="hidden lg:block mb-1">
            <h1 className="text-xl font-bold text-brand-900 dark:text-slate-100 flex items-center gap-2">
              ¡{greeting}, {displayName}!
              <GreetIcon className="w-4 h-4 flex-shrink-0" style={{ color: greetIconColor }} />
            </h1>
            <p className="text-sm text-gray-400 dark:text-slate-500 mt-0.5">{dateLabel}</p>
          </div>

          {/* ── Hero card ─────────────────────────────────────────────── */}
          <div className="hero-gradient rounded-3xl p-6 lg:p-5 text-white overflow-hidden relative">
            <div className="lg:flex lg:gap-5 lg:items-start">

              {/* LEFT: monto + presupuesto */}
              <div className="lg:flex-1">
                {/* Saludo mobile */}
                <p className="text-sm text-white font-bold mb-3 lg:hidden flex items-center gap-1.5">
                  {greeting}, {displayName}
                  <GreetIcon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: greetIconColor }} />
                </p>

                <p className="text-[10px] text-white/65 font-semibold uppercase tracking-wide mb-1">
                  Gastado este mes
                </p>
                <p
                  className="font-extrabold text-white tracking-tight leading-none"
                  style={{ fontSize: 'clamp(28px, 7vw, 44px)' }}
                >
                  {formatCLP(total)}
                </p>
                {budgetAmount && (
                  <p className="text-xs text-white/50 mt-1.5">
                    de {formatCLP(budgetAmount)} presupuestado
                  </p>
                )}

                {/* Barra de progreso */}
                {budgetAmount && (
                  <div className="mt-4">
                    <div className="h-2 bg-white/15 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, progressPct)}%`,
                          backgroundColor: isOver ? '#f87171' : progressPct >= 80 ? '#fbbf24' : 'rgba(255,255,255,0.85)',
                        }}
                      />
                    </div>
                    <div className="flex justify-between mt-1.5">
                      <span className="text-[10px] text-white/45">{progressPct}% del presupuesto</span>
                      <span className="text-[10px] text-white/45">
                        {isOver
                          ? `+${formatCLP(total - budgetAmount)} sobre el límite`
                          : `Quedan ${formatCLP(budgetAmount - total)}`}
                      </span>
                    </div>
                  </div>
                )}

                {/* vs mes anterior */}
                {deltaVsLast !== null && (
                  <div className="mt-3 inline-flex items-center gap-1.5 bg-white/15 rounded-xl px-2.5 py-1.5">
                    <span className={`text-[10px] font-bold flex items-center gap-1 ${deltaVsLast <= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                      {deltaVsLast <= 0
                        ? <TrendingDown className="w-3 h-3 flex-shrink-0" />
                        : <TrendingUp   className="w-3 h-3 flex-shrink-0" />}
                      {Math.abs(deltaVsLast)}%{' '}
                      {deltaVsLast <= 0 ? 'menos' : 'más'} que {monthName(prevM).slice(0, 3).toLowerCase()}
                    </span>
                    <span className="text-[10px] text-white/35">· al día {todayDate}: {formatCLP(prevTotal)}</span>
                  </div>
                )}
              </div>

              {/* Separador desktop */}
              <div className="hidden lg:block w-px bg-white/15 self-stretch flex-shrink-0" />

              {/* RIGHT: Te quedan + stats */}
              <div className="mt-5 lg:mt-0 lg:flex-shrink-0 lg:w-48">

                {/* "Te quedan" — desktop */}
                {budgetAmount && (
                  <div className="hidden lg:block mb-4">
                    <p className="text-[10px] text-white/55 font-semibold uppercase tracking-wide mb-0.5">
                      Te quedan
                    </p>
                    <p className={`text-2xl font-extrabold leading-none ${isOver ? 'text-red-300' : 'text-emerald-300'}`}>
                      {isOver
                        ? `–${formatCLP(total - budgetAmount)}`
                        : formatCLP(budgetAmount - total)}
                    </p>
                    <p className="text-[10px] text-white/40 mt-0.5">para finalizar el mes</p>
                    {budgetAmount && projection > budgetAmount && (
                      <div className="mt-2.5 flex items-center gap-1.5 bg-red-500/20 border border-red-400/20 rounded-xl px-2.5 py-1.5">
                        <AlertTriangle className="w-3 h-3 text-red-200 flex-shrink-0" />
                        <span className="text-[10px] font-semibold text-red-200">
                          Riesgo: superar presupuesto
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Stat chips */}
                <div className="flex gap-2 lg:flex-col lg:gap-2">
                  {[
                    { label: 'Por día',    value: formatCLP(dailyAvg) },
                    {
                      label: 'Proyección',
                      value: total > 0 ? formatCLP(projection) : '–',
                      warn: budgetAmount != null && projection > budgetAmount,
                    },
                  ].map(chip => (
                    <div
                      key={chip.label}
                      className="flex-1 bg-white/15 rounded-2xl px-3 py-2.5 lg:flex lg:items-center lg:justify-between"
                    >
                      <p className="text-[10px] text-white/65 font-semibold mb-1 lg:mb-0">{chip.label}</p>
                      <p
                        className={`font-extrabold tabular-nums leading-none ${chip.warn ? 'text-red-300' : 'text-white'}`}
                        style={{ fontSize: 'clamp(12px, 3.5vw, 15px)' }}
                      >
                        {chip.value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>

          {/* ── Estado de cuenta ──────────────────────────────────────── */}
          {statementCards.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <h2 className="text-sm font-bold text-gray-600 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-indigo-500" />
                  Estado de cuenta
                </h2>
                <Link href="/historial?view=billing" className="text-sm font-semibold text-brand-600 hover:text-brand-700 transition-colors">
                  Ver detalle
                </Link>
              </div>
              <div className="card divide-y divide-gray-50 overflow-hidden">
                {statementCards.map(card => {
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
                      className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50/60 active:bg-gray-100/50 transition-colors"
                    >
                      <ServiceLogo domain={card.domain} name={card.name} size={36} className="flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{card.name}</p>
                        <p className="text-xs text-gray-400">
                          {fmt(openDate)} – {fmt(closeDate)}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-gray-900 tabular-nums">{formatCLP(card.total)}</p>
                        <p className={`text-[10px] font-semibold ${daysLeft <= 3 && daysLeft >= 0 ? 'text-amber-500' : 'text-gray-400'}`}>
                          {daysLabel}
                        </p>
                      </div>
                      <svg className="w-3.5 h-3.5 text-gray-300 flex-shrink-0 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Por categoría ─────────────────────────────────────────── */}
          {catSummary.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <h2 className="text-sm font-bold text-gray-600">Por categoría</h2>
                <Link href="/analisis" className="text-sm font-semibold text-brand-600 hover:text-brand-700 transition-colors">
                  Ver análisis
                </Link>
              </div>

              {/* Mobile: 2x2 grid / Desktop: compact list */}
              <div className="grid grid-cols-2 gap-2.5 lg:hidden">
                {catSummary.slice(0, 4).map(c => {
                  const limit    = catBudgetMap.get(c.id) ?? null
                  const catPct   = limit ? Math.min(100, Math.round((c.total / limit) * 100)) : null
                  const over     = limit ? c.total > limit : false
                  const barColor = over ? '#EF4444' : catPct !== null && catPct >= 80 ? '#F59E0B' : c.color
                  return (
                    <Link
                      key={c.id}
                      href={`/analisis/${c.id}?month=${month}&year=${year}`}
                      className="card p-4 block hover:bg-brand-50/40 transition-colors active:scale-[0.98]"
                    >
                      <div className="flex items-center gap-2.5 mb-3">
                        <div
                          className="cat-icon-bg w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0"
                          style={{ '--cat-bg': c.bg_color, '--cat-color': c.color } as React.CSSProperties}
                        >
                          {isEmoji(c.icon)
                            ? <span className="text-base">{c.icon}</span>
                            : (() => { const Icon = getCategoryIcon(c.icon); return <Icon className="w-4 h-4" style={{ color: c.color }} /> })()
                          }
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-gray-400 truncate">{c.name}</p>
                          <p className="text-sm font-extrabold text-gray-900 tabular-nums leading-tight">{formatCLP(c.total)}</p>
                          {limit && <p className="text-[10px] text-gray-400 leading-tight">de {formatCLP(limit)}</p>}
                        </div>
                      </div>
                      <div className="progress-track h-1.5 rounded-full overflow-hidden" style={{ '--bar-color': barColor } as React.CSSProperties}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${limit ? catPct : pct(c.total, total)}%`, backgroundColor: barColor }} />
                      </div>
                      {limit
                        ? <p className={`text-[10px] mt-1 font-semibold ${over ? 'text-red-500' : catPct !== null && catPct >= 80 ? 'text-amber-500' : 'text-gray-400'}`}>{over ? `+${formatCLP(c.total - limit)} sobre` : `${catPct}% usado`}</p>
                        : <p className="text-[10px] mt-1 font-semibold text-gray-400">{pct(c.total, total)}% del total</p>
                      }
                    </Link>
                  )
                })}
              </div>

              {/* Desktop: compact ranked list */}
              <div className="hidden lg:block card overflow-hidden divide-y divide-gray-50">
                {(() => {
                  const maxCatTotal = catSummary[0]?.total ?? 1
                  return catSummary.map((c, idx) => {
                  const limit          = catBudgetMap.get(c.id) ?? null
                  const catPct         = limit ? Math.min(100, Math.round((c.total / limit) * 100)) : Math.round((c.total / maxCatTotal) * 100)
                  const over           = limit ? c.total > limit : false
                  const overPct        = limit && over ? Math.round(((c.total - limit) / limit) * 100) : 0
                  const recurringAmt   = recurringByCatInicio[c.id] ?? 0
                  const isAllRecurring = recurringAmt > 0 && recurringAmt >= c.total
                  // Over by <15% = amber warning, >15% = red alarm
                  const mildOver  = over && !isAllRecurring && overPct < 15
                  const hardOver  = over && !isAllRecurring && overPct >= 15
                  const barColor  = isAllRecurring && over ? c.color
                    : hardOver  ? '#EF4444'
                    : mildOver  ? '#F59E0B'
                    : limit && catPct >= 80 ? '#F59E0B'
                    : c.color

                  return (
                    <Link
                      key={c.id}
                      href={`/analisis/${c.id}?month=${month}&year=${year}`}
                      className={`flex items-center gap-3 px-4 py-3.5 transition-colors relative ${
                        hardOver ? 'hover:bg-red-50/30 dark:hover:bg-red-950/20'
                        : mildOver ? 'hover:bg-amber-50/30 dark:hover:bg-amber-950/20'
                        : 'hover:bg-gray-50/60'
                      }`}
                    >
                      {/* Left accent for over-budget */}
                      {(hardOver || mildOver) && (
                        <div className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full"
                          style={{ background: hardOver ? '#EF4444' : '#F59E0B' }} />
                      )}

                      {/* Rank badge */}
                      <span className={`text-[12px] font-extrabold w-5 flex-shrink-0 tabular-nums text-center ${
                        idx === 0 ? 'text-amber-500'
                        : idx === 1 ? 'text-slate-400'
                        : idx === 2 ? 'text-orange-400'
                        : 'text-gray-300 dark:text-gray-600'
                      }`}>{idx + 1}</span>

                      {/* Icon */}
                      <div
                        className="cat-icon-bg w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ '--cat-bg': c.bg_color, '--cat-color': c.color } as React.CSSProperties}
                      >
                        {isEmoji(c.icon)
                          ? <span className="text-sm">{c.icon}</span>
                          : (() => { const Icon = getCategoryIcon(c.icon); return <Icon className="w-4 h-4" style={{ color: c.color }} /> })()
                        }
                      </div>

                      {/* Name + bar */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2 mb-1.5">
                          <p className="text-sm font-semibold text-gray-700 truncate">{c.name}</p>
                          <p className="text-sm font-bold text-gray-900 tabular-nums flex-shrink-0">{formatCLP(c.total)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div
                            className="progress-track flex-1 h-1.5 rounded-full overflow-hidden"
                            style={{ '--bar-color': barColor } as React.CSSProperties}
                          >
                            <div className="h-full rounded-full transition-all" style={{ width: `${catPct}%`, backgroundColor: barColor }} />
                          </div>
                          <p className={`text-[10px] font-semibold flex-shrink-0 w-24 text-right ${
                            hardOver ? 'text-red-500' : mildOver ? 'text-amber-500' : 'text-gray-400'
                          }`}>
                            {isAllRecurring && over
                              ? '↻ fijo'
                              : hardOver
                                ? `+${formatCLP(c.total - limit!)} sobre`
                                : mildOver
                                  ? `+${overPct}% · cuidado`
                                  : limit
                                    ? `${catPct}% de ${formatCLP(limit)}`
                                    : 'Sin límite'
                            }
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

        </div>
        {/* ══ END LEFT COLUMN ══ */}

        {/* ══ RIGHT COLUMN ════════════════════════════════════════════ */}
        <div className="space-y-4 mt-4 lg:mt-0">

          {/* ── Últimos gastos (desktop only) ──────────────────────────── */}
          {typedExpenses.length > 0 && (
            <div className="hidden lg:block">
              <div className="flex items-center justify-between mb-2.5">
                <h2 className="text-sm font-bold text-gray-600">Últimos gastos</h2>
                <Link href="/historial" className="text-sm font-semibold text-brand-600 hover:text-brand-700 transition-colors">
                  Ver todo
                </Link>
              </div>
              <div className="card overflow-hidden">
                {typedExpenses.slice(0, 7).map((e, i) => {
                  const { icon: Icon, color, bg } = getExpenseIcon(e.description ?? null, e.category?.name ?? null)
                  const d = new Date(e.date + 'T12:00:00')
                  const now2 = new Date()
                  const isToday = e.date === now2.toISOString().split('T')[0]
                  const isYesterday = e.date === new Date(now2.getTime() - 86400000).toISOString().split('T')[0]
                  const dayLabel = isToday ? 'Hoy' : isYesterday ? 'Ayer' : d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
                  return (
                    <div key={e.id} className={`flex items-center gap-3 px-4 py-3 hover:bg-gray-50/50 transition-colors ${i > 0 ? 'border-t border-gray-50' : ''}`}>
                      {/* Category color bar */}
                      {e.category && (
                        <div className="w-[3px] self-stretch rounded-full flex-shrink-0 opacity-70"
                          style={{ background: e.category.color }} />
                      )}
                      <div
                        className="cat-icon-bg w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ '--cat-bg': bg, '--cat-color': color } as React.CSSProperties}
                      >
                        <Icon className="w-3.5 h-3.5" style={{ color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate leading-tight">
                          {e.description || e.category?.name || '—'}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {e.category && (
                            <span className="text-[10px] font-medium truncate" style={{ color: e.category.color }}>
                              {e.category.name}
                            </span>
                          )}
                          <span className="text-[10px] text-gray-400">· {dayLabel}</span>
                        </div>
                      </div>
                      <p className="text-sm font-bold text-gray-900 tabular-nums flex-shrink-0">{formatCLP(e.amount)}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Próximos pagos */}
          {proximosPagos.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <h2 className="text-sm font-bold text-gray-600 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-brand-500" />
                  Próximos pagos
                </h2>
                <Link
                  href="/recurrentes?view=calendar"
                  className="text-sm font-semibold text-brand-600 hover:text-brand-700 transition-colors"
                >
                  Ver calendario
                </Link>
              </div>
              <div className="card divide-y divide-gray-50 overflow-hidden">
                {proximosPagos.map(r => (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                    <ServiceLogo domain={r.domain} name={r.name} size={32} className="flex-shrink-0" />
                    <p className="flex-1 text-sm font-semibold text-gray-800 truncate min-w-0">{r.name}</p>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-gray-900 tabular-nums">{formatCLP(r.amount)}</p>
                      <p className={`text-[10px] font-semibold ${
                        r.isToday ? 'text-red-500'
                        : r.daysUntil <= 3 ? 'text-amber-500'
                        : 'text-gray-400'
                      }`}>
                        {r.label}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
        {/* ══ END RIGHT COLUMN ══ */}

      </div>

      <ExpenseSheet
        categories={categories ?? []}
        paymentMethods={paymentMethods ?? []}
      />
    </>
  )
}
