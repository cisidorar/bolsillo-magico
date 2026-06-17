import Image from 'next/image'
import { createClient, getServerSession } from '@/lib/supabase/server'
import { formatCLP, monthName, pct, isEmoji, currentStatementRange, billingPeriod, billingPeriodRange } from '@/lib/utils'
import { getCategoryIcon } from '@/lib/category-icons'
import { Sparkles, CreditCard, Calendar, ChevronRight } from 'lucide-react'
import ExpenseSheet from '@/components/ExpenseSheet'
import ExpenseList from '@/components/ExpenseList'
import RecurringWidget from '@/components/RecurringWidget'
import ServiceLogo from '@/components/ServiceLogo'
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
    // Prev month for vs-anterior + insights (al mismo día del mes)
    supabase
      .from('expenses')
      .select('amount, category_id, date')
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

  // Mes anterior — comparación al mismo día del mes (ej. si hoy es día 16, comparamos vs días 1-16 del mes anterior)
  const prevMonthSameDate = (prevMonthExpenses ?? []).filter(
    (e: { date: string }) => parseInt(e.date.split('-')[2]) <= todayDate
  )
  const prevTotal = prevMonthSameDate.reduce((s: number, e: { amount: number }) => s + e.amount, 0)
  const prevByCat: Record<string, number> = {}
  prevMonthSameDate.forEach((e: { amount: number; category_id: string | null }) => {
    if (e.category_id) prevByCat[e.category_id] = (prevByCat[e.category_id] ?? 0) + e.amount
  })
  const deltaVsLast = prevTotal > 0
    ? Math.round(((total - prevTotal) / prevTotal) * 100)
    : null

  const registeredRecurringIds = typedExpenses
    .filter(e => e.recurring_expense_id != null)
    .map(e => e.recurring_expense_id as string)

  const catBudgetMap = new Map(
    ((categoryBudgets ?? []) as CategoryBudget[]).map(b => [b.category_id, b.amount])
  )

  // Resumen por categoría
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

  // Saludo + fecha
  const hour        = now.getHours()
  const greeting    = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'
  const greetEmoji  = hour < 12 ? '🌤️' : hour < 19 ? '☀️' : '🌙'
  const rawName     = profile?.display_name ?? user!.email ?? ''
  const displayName = rawName.includes('@') ? rawName.split('@')[0] : rawName
  const dateLabelRaw = now.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const dateLabel    = dateLabelRaw.charAt(0).toUpperCase() + dateLabelRaw.slice(1)

  // Indicadores financieros
  const daysElapsed = todayDate
  const daysInMonth = new Date(year, month, 0).getDate()
  const dailyAvg    = daysElapsed > 0 && total > 0 ? Math.round(total / daysElapsed) : 0
  const projection  = dailyAvg > 0 ? Math.round(dailyAvg * daysInMonth) : 0

  // Gasto semanal
  const daysFromMonday = (now.getDay() + 6) % 7
  const monday = new Date(now); monday.setDate(now.getDate() - daysFromMonday)
  const mondayStr  = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
  const weekTotal  = typedExpenses.filter(e => e.date >= mondayStr).reduce((s, e) => s + e.amount, 0)

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

  // ── Gráfico SVG: gasto acumulado diario ──────────────────────────────────
  const byDay: Record<number, number> = {}
  typedExpenses.forEach(e => {
    const d = parseInt(e.date.split('-')[2])
    byDay[d] = (byDay[d] ?? 0) + e.amount
  })
  let cum = 0
  const cumulativeByDay: { day: number; value: number }[] = []
  for (let d = 1; d <= todayDate; d++) {
    cum += (byDay[d] ?? 0)
    cumulativeByDay.push({ day: d, value: cum })
  }

  const SVG_W = 400, SVG_H = 80, PAD_T = 12, PAD_B = 4
  const plotH  = SVG_H - PAD_T - PAD_B
  const maxVal = Math.max(total, budgetAmount ?? 0, 1)
  const toX    = (day: number)   => ((day - 1) / Math.max(daysInMonth - 1, 1)) * SVG_W
  const toY    = (value: number) => PAD_T + plotH - Math.min(1, value / maxVal) * plotH

  const spendingPoints = cumulativeByDay
    .map(p => `${toX(p.day).toFixed(1)},${toY(p.value).toFixed(1)}`)
    .join(' ')
  const lastX  = cumulativeByDay.length > 0 ? toX(todayDate)  : 0
  const lastY  = cumulativeByDay.length > 0 ? toY(total)       : PAD_T + plotH
  const labelX = Math.min(lastX, SVG_W - 58)

  // ── Insights ─────────────────────────────────────────────────────────────
  type Insight = { emoji: string; title: string; detail: string; bg: string; textColor: string; href?: string }
  const insights: Insight[] = []

  // 1. Top category trend vs prev month
  // Umbral mínimo: ambos meses deben tener al menos $10.000 en esa categoría
  // para evitar % engañosos (ej: subió 1300% porque pasó de $500 a $7.000)
  const MIN_CAT_AMOUNT = 10_000
  if (catSummary.length > 0 && prevTotal > 0) {
    const top  = catSummary[0]
    const prev = prevByCat[top.id] ?? 0
    if (prev >= MIN_CAT_AMOUNT && top.total >= MIN_CAT_AMOUNT) {
      const delta    = Math.round(((top.total - prev) / prev) * 100)
      const deltaAbs = Math.abs(delta)
      // Solo mostrar si el cambio es significativo (≥15%) y hay diferencia real en CLP
      const clpDiff  = Math.abs(top.total - prev)
      if (deltaAbs >= 15 && clpDiff >= 5_000) {
        const pctLabel = deltaAbs > 200 ? `más del doble` : `${deltaAbs}%`
        insights.push(delta > 0
          ? { emoji: '📈', title: `${top.name} subió ${pctLabel}`, detail: `${formatCLP(top.total - prev)} más que ${monthName(prevM).slice(0, 3).toLowerCase()}`, bg: '#FFF7ED', textColor: '#C2410C', href: `/analisis/${top.id}?month=${month}&year=${year}` }
          : { emoji: '📉', title: `${top.name} bajó ${pctLabel}`, detail: `${formatCLP(prev - top.total)} menos que ${monthName(prevM).slice(0, 3).toLowerCase()}`, bg: '#F0FDF4', textColor: '#166534', href: `/analisis/${top.id}?month=${month}&year=${year}` }
        )
      }
    }
  }

  // 2. Categoría mejor controlada
  const goodCat = catSummary.find(c => {
    const limit = catBudgetMap.get(c.id)
    return limit && c.total < limit * 0.7
  })
  if (goodCat) {
    const limit = catBudgetMap.get(goodCat.id)!
    insights.push({
      emoji: '✅',
      title: `${goodCat.name} dentro del presupuesto`,
      detail: `Quedan ${formatCLP(limit - goodCat.total)}`,
      bg: '#F0FDF4', textColor: '#166534',
    })
  }

  // 3. Proyección
  if (budgetAmount && projection > 0) {
    if (projection > budgetAmount) {
      insights.push({
        emoji: '⚠️',
        title: `Tu proyección supera el presupuesto`,
        detail: `en ${formatCLP(projection - budgetAmount)}`,
        bg: '#FEF2F2', textColor: '#B91C1C',
      })
    } else if (insights.length < 2) {
      insights.push({
        emoji: '🎯',
        title: `¡Vas bien este mes!`,
        detail: `Proyectas usar el ${Math.round(pct(projection, budgetAmount))}% del presupuesto`,
        bg: '#EFF6FF', textColor: '#1E40AF',
      })
    }
  }

  // Fallback
  if (insights.length === 0 && total > 0) {
    insights.push({
      emoji: '💡',
      title: `${formatCLP(dailyAvg)} en promedio por día`,
      detail: `${daysElapsed} días transcurridos`,
      bg: '#EEF4FF', textColor: '#155BB0',
    })
  }

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
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 4)

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-2 lg:grid lg:grid-cols-[3fr,2fr] lg:gap-6 lg:items-start">

        {/* ══ LEFT COLUMN ══════════════════════════════════════════════ */}
        <div className="space-y-4">

          {/* ── Desktop header ────────────────────────────────────────── */}
          <div className="hidden lg:block mb-1">
            <h1 className="text-xl font-bold text-brand-900">
              ¡{greeting}, {displayName}! {greetEmoji}
            </h1>
            <p className="text-sm text-gray-400 mt-0.5">{dateLabel}</p>
          </div>

          {/* ── Hero card ─────────────────────────────────────────────── */}
          <div className="hero-gradient rounded-3xl p-6 lg:p-5 text-white overflow-hidden relative">
            <div className="lg:flex lg:gap-5 lg:items-start">

              {/* LEFT: monto + presupuesto */}
              <div className="lg:flex-1">
                {/* Saludo mobile */}
                <p className="text-sm text-white font-bold mb-3 lg:hidden">
                  {greeting}, {displayName} {greetEmoji}
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
                    <span className={`text-[10px] font-bold ${deltaVsLast <= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                      {deltaVsLast <= 0 ? '↓' : '↑'} {Math.abs(deltaVsLast)}%{' '}
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
                        <span className="text-[10px] font-semibold text-red-200">
                          ⚠ Riesgo: superar presupuesto
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Stat chips — fila en mobile, apilados en desktop */}
                <div className="flex gap-2 lg:flex-col lg:gap-2">
                  {[
                    { label: 'Por día',      value: formatCLP(dailyAvg) },
                    { label: 'Esta semana',  value: formatCLP(weekTotal) },
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
                  // Días restantes hasta el cierre
                  const today0   = new Date(now.getFullYear(), now.getMonth(), now.getDate())
                  const close0   = new Date(closeDate.getFullYear(), closeDate.getMonth(), closeDate.getDate())
                  const daysLeft = Math.round((close0.getTime() - today0.getTime()) / 86_400_000)
                  const daysLabel = daysLeft === 0 ? 'Cierra hoy'
                    : daysLeft === 1 ? 'Cierra mañana'
                    : daysLeft > 0   ? `Cierra en ${daysLeft}d`
                    : 'Cerrado'
                  return (
                    <div key={card.id} className="flex items-center gap-3 px-4 py-3.5">
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
                    </div>
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
                  Ver todas
                </Link>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
                {catSummary.map(c => {
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
                          className="w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: c.bg_color }}
                        >
                          {isEmoji(c.icon)
                            ? <span className="text-base">{c.icon}</span>
                            : (() => { const Icon = getCategoryIcon(c.icon); return <Icon className="w-4 h-4" style={{ color: c.color }} /> })()
                          }
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-gray-400 truncate">{c.name}</p>
                          <p className="text-sm font-extrabold text-gray-900 tabular-nums leading-tight">
                            {formatCLP(c.total)}
                          </p>
                          {limit && (
                            <p className="text-[10px] text-gray-400 leading-tight">de {formatCLP(limit)}</p>
                          )}
                        </div>
                      </div>
                      <div
                        className="h-1.5 rounded-full overflow-hidden"
                        style={{ backgroundColor: `${barColor}20` }}
                      >
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${limit ? catPct : pct(c.total, total)}%`,
                            backgroundColor: barColor,
                          }}
                        />
                      </div>
                      {limit ? (
                        <p className={`text-[10px] mt-1 font-semibold ${over ? 'text-red-500' : catPct !== null && catPct >= 80 ? 'text-amber-500' : 'text-gray-400'}`}>
                          {over ? `+${formatCLP(c.total - limit)} sobre` : `${catPct}% usado`}
                        </p>
                      ) : (
                        <p className="text-[10px] mt-1 font-semibold text-gray-400">
                          {pct(c.total, total)}% del total
                        </p>
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Evolución + Insights — side-by-side en desktop ─────────── */}
          {total > 0 && (
            <div className="lg:grid lg:grid-cols-[3fr,2fr] lg:gap-4 space-y-4 lg:space-y-0">

              {/* Evolución de gastos */}
              <div className="card p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-bold text-gray-700">Evolución de gastos</p>
                  <span className="text-xs font-semibold text-brand-600 bg-brand-50 border border-brand-100 px-2 py-0.5 rounded-lg">
                    {monthName(month)}
                  </span>
                </div>

                {/* SVG chart */}
                <svg
                  viewBox={`0 0 ${SVG_W} ${SVG_H}`}
                  className="w-full"
                  style={{ height: SVG_H, overflow: 'visible' }}
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient id="spendGrad" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%"   stopColor="#1B6DD4" stopOpacity="0.22" />
                      <stop offset="100%" stopColor="#1B6DD4" stopOpacity="0"    />
                    </linearGradient>
                  </defs>

                  {/* Budget ramp (diagonal dashed) */}
                  {budgetAmount && (
                    <line
                      x1="0"    y1={toY(0).toFixed(1)}
                      x2={SVG_W} y2={toY(budgetAmount).toFixed(1)}
                      stroke="#1B6DD4" strokeWidth="1.5" strokeDasharray="5 3" opacity="0.3"
                    />
                  )}

                  {/* Area under spending line */}
                  {cumulativeByDay.length >= 2 && (
                    <polygon
                      points={`${toX(1).toFixed(1)},${(PAD_T + plotH).toFixed(1)} ${spendingPoints} ${lastX.toFixed(1)},${(PAD_T + plotH).toFixed(1)}`}
                      fill="url(#spendGrad)"
                    />
                  )}

                  {/* Spending line */}
                  {cumulativeByDay.length >= 2 && (
                    <polyline
                      points={spendingPoints}
                      fill="none"
                      stroke="#1B6DD4"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}

                  {/* Dot at current day */}
                  {cumulativeByDay.length >= 1 && (
                    <>
                      <circle
                        cx={lastX.toFixed(1)} cy={lastY.toFixed(1)}
                        r="5" fill="white" stroke="#1B6DD4" strokeWidth="2.5"
                      />
                      {/* Value label */}
                      <rect
                        x={labelX.toFixed(1)} y={(lastY - 22).toFixed(1)}
                        width="58" height="16" rx="5" fill="#1B6DD4"
                      />
                      <text
                        x={(labelX + 29).toFixed(1)} y={(lastY - 11).toFixed(1)}
                        textAnchor="middle" fill="white"
                        fontSize="8.5" fontWeight="700"
                      >
                        {total >= 1_000_000
                          ? `$${(total / 1_000_000).toFixed(1)}M`
                          : `$${Math.round(total / 1000)}k`}
                      </text>
                    </>
                  )}
                </svg>

                {/* X axis day labels */}
                <div className="flex justify-between mt-1 px-0.5">
                  {[1, Math.ceil(daysInMonth / 3), Math.ceil((daysInMonth * 2) / 3), daysInMonth].map(d => (
                    <span key={d} className="text-[9px] text-gray-300 font-medium">{d}</span>
                  ))}
                </div>

                {/* Legend */}
                <div className="flex items-center gap-4 mt-2.5">
                  <div className="flex items-center gap-1.5">
                    <div className="w-4 h-0.5 bg-brand-600 rounded-full" />
                    <span className="text-[10px] text-gray-400">Gasto real</span>
                  </div>
                  {budgetAmount && (
                    <div className="flex items-center gap-1.5">
                      <svg width="16" height="4" aria-hidden="true">
                        <line x1="0" y1="2" x2="16" y2="2" stroke="#1B6DD4" strokeWidth="1.5" strokeDasharray="4 2" opacity="0.5" />
                      </svg>
                      <span className="text-[10px] text-gray-400">Ritmo presupuesto</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Insights para ti */}
              <div>
                <h2 className="text-sm font-bold text-gray-600 mb-2.5 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  Insights para ti
                </h2>
                <div className="space-y-2">
                  {insights.slice(0, 3).map((ins, i) => {
                    const inner = (
                      <div
                        className="rounded-2xl px-3.5 py-3 flex items-start gap-2.5"
                        style={{ backgroundColor: ins.bg }}
                      >
                        <span className="text-base flex-shrink-0 mt-0.5">{ins.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold leading-snug" style={{ color: ins.textColor }}>
                            {ins.title}
                          </p>
                          <p className="text-[10px] text-gray-400 mt-0.5">{ins.detail}</p>
                        </div>
                        {ins.href && <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-gray-300" />}
                      </div>
                    )
                    return ins.href
                      ? <Link key={i} href={ins.href}>{inner}</Link>
                      : <div key={i}>{inner}</div>
                  })}
                </div>
              </div>

            </div>
          )}

        </div>
        {/* ══ END LEFT COLUMN ══ */}

        {/* ══ RIGHT COLUMN ════════════════════════════════════════════ */}
        <div className="space-y-4 mt-4 lg:mt-0">

          {/* Recurrentes */}
          {recurringWithCounts.length > 0 && (
            <RecurringWidget
              recurring={recurringWithCounts}
              registeredIds={registeredRecurringIds}
              userId={user!.id}
              month={month}
              year={year}
            />
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

          {/* Últimos gastos */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h2 className="text-sm font-bold text-gray-600">
                Últimos gastos
                {typedExpenses.length > 0 && (
                  <span className="ml-1.5 text-[10px] font-bold text-gray-400 bg-gray-100 rounded-full px-1.5 py-0.5">
                    {typedExpenses.length}
                  </span>
                )}
              </h2>
              <Link href="/historial" className="text-sm font-semibold text-brand-600 hover:text-brand-700 transition-colors">
                Ver todos
              </Link>
            </div>

            {typedExpenses.length === 0 ? (
              <div className="card text-center py-14 flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-2xl bg-brand-50 flex items-center justify-center mb-1">
                  <Sparkles className="w-6 h-6 text-brand-400" />
                </div>
                <p className="text-sm font-bold text-gray-600">Sin gastos este mes</p>
                <p className="text-xs text-gray-400">Toca + para agregar el primero</p>
              </div>
            ) : (
              <ExpenseList expenses={typedExpenses.slice(0, 10)} />
            )}
          </div>

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
