import { createClient, getServerSession } from '@/lib/supabase/server'
import { billingPeriod, formatCLP, monthName, pct, isEmoji } from '@/lib/utils'
import { getExpenseIcon } from '@/lib/expense-icons'
import { getCategoryIcon } from '@/lib/category-icons'
import MonthNav from '@/components/MonthNav'
import Link from 'next/link'
import type { ExpenseWithRelations, CategoryBudget } from '@/types'
import { TrendingUp, TrendingDown, Minus, CreditCard, BarChart2, ChevronRight, ShoppingCart, Wallet, Lightbulb } from 'lucide-react'
import ServiceLogo from '@/components/ServiceLogo'

export const revalidate = 0

export default async function AnalisisPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string; view?: string }>
}) {
  const { month: monthStr, year: yearStr, view } = await searchParams
  const now   = new Date()
  const month = monthStr ? parseInt(monthStr) : now.getMonth() + 1
  const year  = yearStr  ? parseInt(yearStr)  : now.getFullYear()
  const isBilling = view === 'billing'

  const [user, supabase] = await Promise.all([getServerSession(), createClient()])

  // El gráfico siempre muestra los últimos 6 meses hasta HOY
  const chartAnchor = new Date(now.getFullYear(), now.getMonth(), 1)
  const sixAgo      = new Date(chartAnchor); sixAgo.setMonth(sixAgo.getMonth() - 5)
  const chartStart  = `${sixAgo.getFullYear()}-${String(sixAgo.getMonth() + 1).padStart(2, '0')}-01`

  const selectedKey = `${year}-${String(month).padStart(2, '0')}`
  const currentKey  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const selEnd   = new Date(year, month + (isBilling ? 2 : 1), 1)
  const curEnd   = new Date(now.getFullYear(), now.getMonth() + (isBilling ? 2 : 1), 1)
  const fetchEnd = selEnd > curEnd ? selEnd : curEnd
  const nextYear  = fetchEnd.getFullYear()
  const nextMonth = fetchEnd.getMonth() + 1
  const endDate   = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`

  const fetchStartBase = selectedKey < chartStart.substring(0, 7) ? `${year}-${String(month).padStart(2, '0')}-01` : chartStart
  const fetchStartDate = isBilling
    ? new Date(new Date(fetchStartBase).getFullYear(), new Date(fetchStartBase).getMonth() - 1, 1)
    : new Date(fetchStartBase)
  const fetchStart = `${fetchStartDate.getFullYear()}-${String(fetchStartDate.getMonth() + 1).padStart(2, '0')}-01`

  const [{ data: expenses }, { data: categoryBudgets }] = await Promise.all([
    supabase
      .from('expenses')
      .select('*, category:categories(*), payment_method:payment_methods(*)')
      .eq('user_id', user!.id)
      .gte('date', fetchStart)
      .lt('date', endDate)
      .order('date', { ascending: false }),
    supabase.from('category_budgets').select('*').eq('user_id', user!.id),
  ])

  const catBudgetMap = new Map(
    ((categoryBudgets ?? []) as CategoryBudget[]).map(b => [b.category_id, b.amount])
  )

  const typedExpenses = (expenses ?? []) as ExpenseWithRelations[]

  function expenseMonthKey(e: ExpenseWithRelations): string {
    if (!isBilling) return e.date.substring(0, 7)
    const pm = e.payment_method as { billing_day?: number | null } | null
    const bd = pm?.billing_day ?? null
    const bp = billingPeriod(e.date, bd)
    return `${bp.year}-${String(bp.month).padStart(2, '0')}`
  }

  // ── Gráfico: últimos 6 meses ──────────────────────────────────────────────
  const byMonth: Record<string, { label: string; total: number; key: string }> = {}
  for (let i = 5; i >= 0; i--) {
    const d = new Date(chartAnchor); d.setMonth(d.getMonth() - i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    byMonth[key] = { key, label: d.toLocaleString('es-CL', { month: 'short' }), total: 0 }
  }
  typedExpenses.forEach(e => {
    const key = expenseMonthKey(e)
    if (byMonth[key]) byMonth[key].total += e.amount
  })
  const monthData = Object.values(byMonth)
  const maxMonth  = Math.max(...monthData.map(m => m.total), 1)

  // ── Selected month data ───────────────────────────────────────────────────
  const selectedExpenses = typedExpenses.filter(e => expenseMonthKey(e) === selectedKey)
  const totalSelected    = selectedExpenses.reduce((s, e) => s + e.amount, 0)

  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear()
  const daysElapsed    = isCurrentMonth ? now.getDate() : new Date(year, month, 0).getDate()
  const dailyAvg       = daysElapsed > 0 && totalSelected > 0 ? Math.round(totalSelected / daysElapsed) : 0

  // vs previous month — comparación al mismo día cuando es el mes actual
  const prevMonthNum  = month === 1 ? 12 : month - 1
  const prevMonthYear = month === 1 ? year - 1 : year
  const prevMonthKey2 = `${prevMonthYear}-${String(prevMonthNum).padStart(2, '0')}`

  const rawPrevExpenses = typedExpenses.filter(e => expenseMonthKey(e) === prevMonthKey2)
  const cutoffDay       = now.getDate()
  // En modo compra y mes actual: solo hasta el mismo día del mes anterior
  const prevExpensesForDelta = (isCurrentMonth && !isBilling)
    ? rawPrevExpenses.filter(e => parseInt(e.date.split('-')[2]) <= cutoffDay)
    : rawPrevExpenses
  const prevTotal     = prevExpensesForDelta.reduce((s, e) => s + e.amount, 0)
  const delta         = prevTotal > 0 ? Math.round(((totalSelected - prevTotal) / prevTotal) * 100) : null
  const absoluteDelta = totalSelected - prevTotal

  // ── Category breakdown ────────────────────────────────────────────────────
  const byCat: Record<string, {
    id: string; name: string; color: string; bg_color: string; icon: string; total: number
  }> = {}
  selectedExpenses.forEach(e => {
    if (!e.category) return
    const id = e.category.id
    if (!byCat[id]) byCat[id] = { id, name: e.category.name, color: e.category.color, bg_color: e.category.bg_color, icon: e.category.icon, total: 0 }
    byCat[id].total += e.amount
  })
  const catSummary = Object.values(byCat).sort((a, b) => b.total - a.total)

  // ── Top single expense ────────────────────────────────────────────────────
  const topExpense = selectedExpenses.length > 0
    ? [...selectedExpenses].sort((a, b) => b.amount - a.amount)[0]
    : null

  // ── Payment method breakdown ──────────────────────────────────────────────
  const byPM: Record<string, { name: string; total: number; domain?: string | null }> = {}
  selectedExpenses.forEach(e => {
    const key  = e.payment_method?.id ?? 'efectivo'
    const name = e.payment_method?.name ?? 'Efectivo'
    if (!byPM[key]) byPM[key] = { name, total: 0, domain: (e.payment_method as any)?.domain ?? null }
    byPM[key].total += e.amount
  })
  const pmSummary = Object.values(byPM).sort((a, b) => b.total - a.total)

  // ── Distribución por día de semana ────────────────────────────────────────
  const weekdayLabels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
  const byWeekday = Array.from({ length: 7 }, () => ({ total: 0, count: 0 }))
  selectedExpenses.forEach(e => {
    const d = new Date(e.date + 'T12:00:00')
    const dow = (d.getDay() + 6) % 7 // Lun=0, Dom=6
    byWeekday[dow].total += e.amount
    byWeekday[dow].count++
  })
  const maxWeekday = Math.max(...byWeekday.map(d => d.total), 1)
  const peakDowIdx = byWeekday.reduce((maxIdx, d, i) => d.total > byWeekday[maxIdx].total ? i : maxIdx, 0)

  // ── Insight del mes ───────────────────────────────────────────────────────
  const weekendTotal  = byWeekday[5].total + byWeekday[6].total
  const weekdayTotal  = byWeekday.slice(0, 5).reduce((s, d) => s + d.total, 0)
  const weekendPct    = totalSelected > 0 ? Math.round((weekendTotal / totalSelected) * 100) : 0
  const topCat        = catSummary[0]
  const topCatPct     = topCat && totalSelected > 0 ? pct(topCat.total, totalSelected) : 0

  function buildInsight(): string {
    if (totalSelected === 0) return ''
    const parts: string[] = []
    if (topCat) parts.push(`${topCat.name} fue tu categoría principal (${topCatPct}% del total).`)
    if (byWeekday[peakDowIdx].total > 0) parts.push(`Gastaste más los ${weekdayLabels[peakDowIdx]}.`)
    if (weekendPct >= 30) parts.push(`El fin de semana representó el ${weekendPct}% de tus gastos.`)
    else if (weekdayTotal > 0) parts.push(`La mayoría de tus gastos fueron entre semana.`)
    if (delta !== null && delta < -10) parts.push(`Redujiste tus gastos un ${Math.abs(delta)}% vs el mes anterior. ¡Bien hecho!`)
    else if (delta !== null && delta > 20) parts.push(`Tus gastos subieron un ${delta}% vs el mes anterior.`)
    return parts.slice(0, 2).join(' ')
  }
  const insight = buildInsight()

  const viewParam = isBilling ? '&view=billing' : ''

  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-8">

      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-brand-900">Análisis</h1>
          <p className="text-sm text-gray-400 mt-0.5">Entiende en qué gastas y detecta oportunidades de ahorro.</p>
        </div>
        <MonthNav month={month} year={year} basePath="/analisis" extraParams={isBilling ? { view: 'billing' } : {}} />
      </div>

      {/* Toggle */}
      <div className="flex items-center gap-1.5 bg-gray-100 rounded-xl p-1 mb-5">
        <Link
          href={`/analisis?month=${month}&year=${year}`}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            !isBilling ? 'tab-active text-gray-800 shadow-sm' : 'text-gray-500'
          }`}
        >
          <ShoppingCart className="w-3.5 h-3.5" />
          Por compra
        </Link>
        <Link
          href={`/analisis?month=${month}&year=${year}&view=billing`}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            isBilling ? 'tab-active shadow-sm' : 'text-gray-500'
          }`}
          style={isBilling ? { color: '#1B6DD4' } : undefined}
        >
          <CreditCard className="w-3.5 h-3.5" />
          Por facturación
        </Link>
      </div>

      {/* ── KPI strip ──────────────────────────────────────────────────────────── */}
      {totalSelected > 0 && (() => {
        const topExpenseData = topExpense
          ? getExpenseIcon(topExpense.description ?? null, topExpense.category?.name ?? null)
          : null

        return (
          /* Mobile: 2x2 grid of cards / Desktop: single unified strip */
          <>
            {/* Mobile 2x2 */}
            <div className="grid grid-cols-2 gap-2.5 mb-5 lg:hidden">
              <div className="card p-3 flex items-center gap-3">
                <div className="cat-icon-bg w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ '--cat-bg': '#EEF4FF', '--cat-color': '#1B6DD4' } as React.CSSProperties}>
                  <Wallet className="w-4 h-4" style={{ color: '#1B6DD4' }} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-gray-400 font-medium leading-tight">Total del mes</p>
                  <p className="text-sm font-extrabold text-gray-900 tabular-nums leading-tight">{formatCLP(totalSelected)}</p>
                </div>
              </div>
              <div className="card p-3 flex items-center gap-3">
                <div className="cat-icon-bg w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ '--cat-bg': '#F0FDF4', '--cat-color': '#16A34A' } as React.CSSProperties}>
                  <BarChart2 className="w-4 h-4" style={{ color: '#16A34A' }} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-gray-400 font-medium leading-tight">Por día</p>
                  <p className="text-sm font-extrabold text-gray-900 tabular-nums leading-tight">{formatCLP(dailyAvg)}</p>
                </div>
              </div>
              <div className="card p-3 flex items-center gap-3">
                <div className="cat-icon-bg w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ '--cat-bg': delta === null ? '#F5F5F5' : delta > 0 ? '#FEF2F2' : '#F0FDF4', '--cat-color': delta === null ? '#9CA3AF' : delta > 0 ? '#EF4444' : '#16A34A' } as React.CSSProperties}>
                  {delta === null || delta === 0 ? <Minus className="w-4 h-4 text-gray-400" /> : delta > 0 ? <TrendingUp className="w-4 h-4" style={{ color: '#EF4444' }} /> : <TrendingDown className="w-4 h-4" style={{ color: '#16A34A' }} />}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-gray-400 font-medium leading-tight">vs anterior{isCurrentMonth && !isBilling ? ` · día ${cutoffDay}` : ''}</p>
                  {delta === null ? <p className="text-sm font-extrabold text-gray-400">—</p> : <p className={`text-sm font-extrabold tabular-nums ${delta > 0 ? 'text-red-500' : 'text-emerald-600'}`}>{delta > 0 ? '+' : ''}{delta}%</p>}
                </div>
              </div>
              <div className="card p-3 flex items-center gap-3">
                {topExpenseData ? (
                  <>
                    <div className="cat-icon-bg w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ '--cat-bg': topExpenseData.bg, '--cat-color': topExpenseData.color } as React.CSSProperties}>
                      <topExpenseData.icon className="w-4 h-4" style={{ color: topExpenseData.color }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-gray-400 font-medium leading-tight">Mayor gasto</p>
                      <p className="text-sm font-extrabold text-gray-900 tabular-nums">{formatCLP(topExpense!.amount)}</p>
                    </div>
                  </>
                ) : (
                  <div className="min-w-0"><p className="text-[10px] text-gray-400 font-medium">Mayor gasto</p><p className="text-sm font-extrabold text-gray-400">—</p></div>
                )}
              </div>
            </div>

            {/* Desktop strip — single card, 4 sections */}
            <div className="hidden lg:grid lg:grid-cols-4 card overflow-hidden divide-x divide-gray-100 mb-6 !rounded-2xl">
              {/* Total */}
              <div className="p-4 xl:p-5 flex items-center gap-3">
                <div className="cat-icon-bg w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ '--cat-bg': '#EEF4FF', '--cat-color': '#1B6DD4' } as React.CSSProperties}>
                  <Wallet className="w-5 h-5" style={{ color: '#1B6DD4' }} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-gray-400 font-medium">Total del mes</p>
                  <p className="text-lg font-extrabold text-gray-900 tabular-nums leading-tight">{formatCLP(totalSelected)}</p>
                  <p className="text-[10px] text-gray-400">{selectedExpenses.length} gastos</p>
                </div>
              </div>
              {/* Por día */}
              <div className="p-4 xl:p-5 flex items-center gap-3">
                <div className="cat-icon-bg w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ '--cat-bg': '#F0FDF4', '--cat-color': '#16A34A' } as React.CSSProperties}>
                  <BarChart2 className="w-5 h-5" style={{ color: '#16A34A' }} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-gray-400 font-medium">Por día</p>
                  <p className="text-lg font-extrabold text-gray-900 tabular-nums leading-tight">{formatCLP(dailyAvg)}</p>
                  <p className="text-[10px] text-gray-400">{daysElapsed} días</p>
                </div>
              </div>
              {/* vs anterior */}
              <div className="p-4 xl:p-5 flex items-center gap-3">
                <div className="cat-icon-bg w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ '--cat-bg': delta === null ? '#F5F5F5' : delta > 0 ? '#FEF2F2' : '#F0FDF4', '--cat-color': delta === null ? '#9CA3AF' : delta > 0 ? '#EF4444' : '#16A34A' } as React.CSSProperties}>
                  {delta === null || delta === 0 ? <Minus className="w-5 h-5 text-gray-400" /> : delta > 0 ? <TrendingUp className="w-5 h-5" style={{ color: '#EF4444' }} /> : <TrendingDown className="w-5 h-5" style={{ color: '#16A34A' }} />}
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-gray-400 font-medium">vs anterior{isCurrentMonth && !isBilling ? ` · día ${cutoffDay}` : ''}</p>
                  {delta === null ? (
                    <p className="text-lg font-extrabold text-gray-400">—</p>
                  ) : (
                    <>
                      <p className={`text-lg font-extrabold tabular-nums leading-tight ${delta > 0 ? 'text-red-500' : 'text-emerald-600'}`}>{delta > 0 ? '+' : ''}{delta}%</p>
                      <p className={`text-[10px] tabular-nums ${absoluteDelta > 0 ? 'text-red-400' : 'text-emerald-500'}`}>{absoluteDelta > 0 ? '+' : ''}{formatCLP(absoluteDelta)}</p>
                    </>
                  )}
                </div>
              </div>
              {/* Mayor gasto */}
              <div className="p-4 xl:p-5 flex items-center gap-3">
                {topExpenseData ? (
                  <>
                    <div className="cat-icon-bg w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ '--cat-bg': topExpenseData.bg, '--cat-color': topExpenseData.color } as React.CSSProperties}>
                      <topExpenseData.icon className="w-5 h-5" style={{ color: topExpenseData.color }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] text-gray-400 font-medium">Mayor gasto</p>
                      <p className="text-lg font-extrabold text-gray-900 tabular-nums leading-tight">{formatCLP(topExpense!.amount)}</p>
                      <p className="text-[10px] text-gray-400 truncate">{topExpense!.description ?? topExpense!.category?.name ?? 'Gasto'}</p>
                    </div>
                  </>
                ) : (
                  <div className="min-w-0"><p className="text-[11px] text-gray-400 font-medium">Mayor gasto</p><p className="text-lg font-extrabold text-gray-400">—</p></div>
                )}
              </div>
            </div>
          </>
        )
      })()}

      {/* ── Insight — full width, visible without scroll ─────────────────────── */}
      {insight && (
        <div className="card insight-card p-4 flex items-start gap-3 mb-5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#FEF3C7' }}>
            <Lightbulb className="w-4 h-4" style={{ color: '#D97706' }} />
          </div>
          <div>
            <p className="text-xs font-bold text-amber-800 mb-0.5">Insight del mes</p>
            <p className="text-xs text-amber-700 leading-relaxed">{insight}</p>
          </div>
        </div>
      )}

      {/* ── Responsive 2-col on desktop (asymmetric) ─────────────────────────── */}
      <div className="lg:grid lg:gap-6 lg:items-start space-y-5 lg:space-y-0" style={{ gridTemplateColumns: '2fr 3fr' }}>

        {/* ══ LEFT: tendencia + distribución + insight ═════════════════════════ */}
        <div className="space-y-5">

          {/* ── Tendencia 6 meses ────────────────────────────────────────────── */}
          <div className="card p-4">
            <p className="text-sm font-bold text-gray-700 mb-3">
              Tendencia 6 meses
              {isBilling && <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ color: '#1B6DD4', background: '#EEF4FF' }}>facturación</span>}
            </p>
            {/* Y-axis max label */}
            {maxMonth > 1 && (
              <p className="text-[9px] text-gray-300 font-medium tabular-nums mb-1">
                {maxMonth >= 1000000 ? `${(maxMonth/1000000).toFixed(1)}M` : `${Math.round(maxMonth/1000)}k`}
              </p>
            )}
            <div className="flex items-end gap-2 h-28 lg:h-48">
              {monthData.map((m) => {
                const isSelected = m.key === selectedKey
                const isCurrent  = m.key === currentKey
                const h = m.total > 0 ? Math.max(8, Math.round((m.total / maxMonth) * 100)) : 3
                const barClass  = isSelected ? '' : isCurrent ? 'bar-current' : 'bar-inactive'
                const textColor = isSelected ? '#1B6DD4' : isCurrent ? '#4D8FFF' : '#9CA3AF'
                const [mYear, mMonth] = m.key.split('-').map(Number)
                const href = `/analisis?month=${mMonth}&year=${mYear}${viewParam}`
                return (
                  <Link key={m.key} href={href} className="flex-1 flex flex-col items-center gap-1 group">
                    <span className={`text-[9px] tabular-nums leading-none font-semibold transition-colors ${isSelected ? 'text-brand-700' : 'text-gray-400'}`}>
                      {m.total > 0 ? (m.total >= 1000000 ? `${(m.total/1000000).toFixed(1)}M` : `${Math.round(m.total/1000)}k`) : ''}
                    </span>
                    <div className="w-full flex-1 flex items-end">
                      <div
                        className={`w-full rounded-t-lg transition-all group-active:opacity-70 ${isSelected ? 'shadow-[0_4px_12px_rgba(27,109,212,0.35)]' : ''} ${barClass}`}
                        style={{ height: `${h}px`, ...(isSelected ? { backgroundColor: '#1B6DD4' } : {}), opacity: m.total === 0 ? 0.3 : 1 }}
                      />
                    </div>
                    <span className="text-[10px] capitalize leading-none font-semibold transition-colors" style={{ color: textColor }}>
                      {m.label}
                      {isCurrent && !isSelected && <span className="block w-1 h-1 rounded-full mx-auto mt-0.5" style={{ backgroundColor: '#75A8FF' }} />}
                    </span>
                  </Link>
                )
              })}
            </div>
          </div>

          {/* ── Distribución por semana ──────────────────────────────────────── */}
          {totalSelected > 0 && (
            <div className="card p-4">
              <p className="text-sm font-bold text-gray-700 mb-3">Distribución por día</p>
              <div className="flex items-end gap-1.5 h-24 lg:h-40">
                {byWeekday.map((day, i) => {
                  const h = day.total > 0 ? Math.max(6, Math.round((day.total / maxWeekday) * 80)) : 3
                  const isPeak = i === peakDowIdx && day.total > 0
                  const isWeekend = i >= 5
                  const barClass = isPeak ? '' : isWeekend ? 'bar-weekend' : 'bar-inactive'
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      {isPeak && (
                        <span className="text-[8px] font-bold leading-none" style={{ color: '#1B6DD4' }}>
                          {day.total >= 1000000 ? `${(day.total/1000000).toFixed(1)}M` : `${Math.round(day.total/1000)}k`}
                        </span>
                      )}
                      <div className="w-full flex-1 flex items-end">
                        <div
                          className={`w-full rounded-t-md transition-all ${barClass}`}
                          style={{ height: `${h}px`, ...(isPeak ? { backgroundColor: '#1B6DD4' } : {}), opacity: day.total === 0 ? 0.25 : 1 }}
                        />
                      </div>
                      <span className="text-[9px] font-semibold text-gray-400 leading-none">{weekdayLabels[i]}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Empty state */}
          {totalSelected === 0 && (
            <div className="card text-center py-14 flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-3xl bg-brand-50 flex items-center justify-center">
                <BarChart2 className="w-7 h-7 text-brand-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-600">
                  Sin gastos {isBilling ? `en estado de cuenta de ${monthName(month)}` : `en ${monthName(month)}`}
                </p>
                <p className="text-xs text-gray-400 mt-1">Registra gastos para ver tu análisis</p>
              </div>
            </div>
          )}

        </div>
        {/* ══ END LEFT ═══════════════════════════════════════════════════════ */}

        {/* ══ RIGHT: top categorías + cómo pagaste ══════════════════════════ */}
        {totalSelected > 0 && (
          <div className="space-y-5">

            {/* Top categorías */}
            <div>
              <h2 className="text-sm font-bold text-gray-600 mb-2.5">
                Top categorías · {isBilling ? `Facturación ${monthName(month)}` : monthName(month)}
              </h2>
              <div className="card divide-y divide-gray-50 overflow-hidden">
                {catSummary.map((c, idx) => {
                  const limit      = catBudgetMap.get(c.id) ?? null
                  const over       = limit ? c.total > limit : false
                  const budgetPct  = limit ? Math.min(100, Math.round((c.total / limit) * 100)) : null
                  const barColor   = over ? '#EF4444' : budgetPct !== null && budgetPct >= 80 ? '#F59E0B' : c.color
                  const barWidth   = limit ? budgetPct! : pct(c.total, totalSelected)
                  const sharePct   = pct(c.total, totalSelected)



                  // Use actual category icon
                  const CatIcon = isEmoji(c.icon) ? null : getCategoryIcon(c.icon)

                  return (
                    <Link
                      key={c.id}
                      href={`/analisis/${c.id}?month=${month}&year=${year}${viewParam}`}
                      className="block px-4 py-3 hover:bg-gray-50/60 transition-colors active:bg-brand-50"
                    >
                      <div className="flex items-center gap-3 mb-1.5">
                        {/* Rank badge */}
                        <div
                          className={`w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${
                            idx === 0 ? 'rank-gold' : idx === 1 ? 'rank-silver' : idx === 2 ? 'rank-bronze' : 'rank-default'
                          }`}
                        >
                          {idx + 1}
                        </div>

                        {/* Category icon */}
                        <div
                          className="cat-icon-bg w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ '--cat-bg': c.bg_color, '--cat-color': c.color } as React.CSSProperties}
                        >
                          {isEmoji(c.icon)
                            ? <span className="text-sm leading-none">{c.icon}</span>
                            : CatIcon
                              ? <CatIcon className="w-4 h-4" style={{ color: c.color }} />
                              : null
                          }
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 leading-tight truncate">{c.name}</p>
                          {limit ? (
                            <p className={`text-xs ${over ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
                              {over ? `+${formatCLP(c.total - limit)} sobre el límite` : `${formatCLP(limit - c.total)} restante`}
                            </p>
                          ) : (
                            <p className="text-xs text-gray-400">{sharePct}% del total</p>
                          )}
                        </div>

                        <div className="text-right flex-shrink-0 flex items-center gap-1.5">
                          <div>
                            <p className="text-sm font-bold text-gray-900 tabular-nums">{formatCLP(c.total)}</p>
                            {limit && <p className="text-[10px] text-gray-400 tabular-nums">de {formatCLP(limit)}</p>}
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                        </div>
                      </div>

                      {/* Progress bar with category color */}
                      <div className="progress-track h-1.5 rounded-full overflow-hidden ml-8" style={{ '--bar-color': barColor } as React.CSSProperties}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${barWidth}%`, backgroundColor: barColor }} />
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>

            {/* Cómo pagaste */}
            {pmSummary.length > 0 && (
              <div>
                <h2 className="text-sm font-bold text-gray-600 mb-2.5">Cómo pagaste</h2>
                <div className="card divide-y divide-gray-50 overflow-hidden">
                  {pmSummary.map(pm => {
                    const pmPct = pct(pm.total, totalSelected)
                    return (
                      <div key={pm.name} className="px-4 py-3">
                        <div className="flex items-center gap-3 mb-1.5">
                          {pm.domain ? (
                            <ServiceLogo domain={pm.domain} name={pm.name} size={28} />
                          ) : (
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: '#EEF4FF' }}>
                              <CreditCard className="w-3.5 h-3.5" style={{ color: '#1B6DD4' }} />
                            </div>
                          )}
                          <p className="flex-1 text-sm font-semibold text-gray-800">{pm.name}</p>
                          <p className="text-sm font-bold text-gray-900 tabular-nums">{formatCLP(pm.total)}</p>
                          <p className="text-xs text-gray-400 w-8 text-right tabular-nums">{pmPct}%</p>
                        </div>
                        <div className="progress-track h-1.5 rounded-full overflow-hidden ml-10" style={{ '--bar-color': '#1B6DD4' } as React.CSSProperties}>
                          <div className="h-full rounded-full transition-all" style={{ width: `${pmPct}%`, backgroundColor: '#1B6DD4' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

          </div>
        )}
        {/* ══ END RIGHT ══════════════════════════════════════════════════════ */}

      </div>
    </div>
  )
}
