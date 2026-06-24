import { createClient, getServerSession } from '@/lib/supabase/server'
import { billingPeriod, formatCLP, monthName, pct, isEmoji } from '@/lib/utils'
import { getExpenseIcon } from '@/lib/expense-icons'
import { getCategoryIcon } from '@/lib/category-icons'
import MonthNav from '@/components/MonthNav'
import Link from 'next/link'
import type { ExpenseWithRelations, CategoryBudget } from '@/types'
import { TrendingUp, TrendingDown, Minus, CreditCard, BarChart2, ChevronRight, ShoppingCart, Wallet, Lightbulb, CalendarDays, Trophy, Zap, ArrowUp, ArrowDown } from 'lucide-react'
import ServiceLogo from '@/components/ServiceLogo'

export const revalidate = 0

export default async function AnalisisPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string; view?: string; bm?: string }>
}) {
  const { month: monthStr, year: yearStr, view, bm } = await searchParams
  const now   = new Date()
  const month = monthStr ? parseInt(monthStr) : now.getMonth() + 1
  const year  = yearStr  ? parseInt(yearStr)  : now.getFullYear()
  const isBilling = view === 'billing'
  const isAnual   = view === 'anual'

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

  const [{ data: expenses }, { data: categoryBudgets }, { data: anualExpensesRaw }, { data: prevYearExpensesRaw }] = await Promise.all([
    supabase
      .from('expenses')
      .select('*, category:categories(*), payment_method:payment_methods(*)')
      .eq('user_id', user!.id)
      .gte('date', fetchStart)
      .lt('date', endDate)
      .order('date', { ascending: false }),
    supabase.from('category_budgets').select('*').eq('user_id', user!.id),
    // Fetch anual solo cuando se necesita
    isAnual
      ? supabase
          .from('expenses')
          .select('amount, date, category:categories(id, name, color, bg_color, icon)')
          .eq('user_id', user!.id)
          .gte('date', `${year}-01-01`)
          .lte('date', `${year}-12-31`)
      : Promise.resolve({ data: null }),
    // Año anterior para comparación
    isAnual
      ? supabase
          .from('expenses')
          .select('amount')
          .eq('user_id', user!.id)
          .gte('date', `${year - 1}-01-01`)
          .lte('date', `${year - 1}-12-31`)
      : Promise.resolve({ data: null }),
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

  // ── Recurring amount per category (from selected month expenses) ───────────
  // Used to avoid false alarms when "over budget" is entirely from fixed recurring costs
  const recurringByCat: Record<string, number> = {}
  selectedExpenses.forEach(e => {
    if (!e.category || !e.recurring_expense_id) return
    recurringByCat[e.category.id] = (recurringByCat[e.category.id] ?? 0) + e.amount
  })

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

    // Solo destacar la categoría principal si no es mayormente recurrente (≥70% fijo = no útil como insight)
    const topCatRecurring = topCat ? (recurringByCat[topCat.id] ?? 0) : 0
    const topCatIsAllRecurring = topCat && topCat.total > 0 && (topCatRecurring / topCat.total) >= 0.7
    if (topCat && !topCatIsAllRecurring) {
      parts.push(`${topCat.name} fue tu categoría principal (${topCatPct}% del total).`)
    } else if (catSummary.length > 1) {
      // Destacar la primera categoría no-100%-recurrente
      const firstDiscretionary = catSummary.slice(1).find(c => (recurringByCat[c.id] ?? 0) < c.total)
      if (firstDiscretionary) {
        const discretionaryPct = pct(firstDiscretionary.total, totalSelected)
        parts.push(`${firstDiscretionary.name} fue tu mayor gasto discrecional (${discretionaryPct}% del total).`)
      }
    }

    if (delta !== null && delta < -10) parts.push(`Redujiste tus gastos un ${Math.abs(delta)}% vs el mes anterior. ¡Bien hecho!`)
    else if (delta !== null && delta > 20) parts.push(`Tus gastos subieron un ${delta}% vs el mes anterior.`)
    if (parts.length < 2 && byWeekday[peakDowIdx].total > 0) parts.push(`Gastaste más los ${weekdayLabels[peakDowIdx]}.`)
    if (parts.length < 2 && weekendPct >= 30) parts.push(`El fin de semana representó el ${weekendPct}% de tus gastos.`)

    return parts.slice(0, 2).join(' ')
  }
  const insight = buildInsight()

  // ── Vista anual: procesamiento ────────────────────────────────────────────
  type AnualCat = { id: string; name: string; color: string; bg_color: string; icon: string; total: number }
  type AnualRow = { monthNum: number; label: string; byCategory: Record<string, number>; total: number }

  let anualCats: AnualCat[] = []
  let anualRows: AnualRow[] = []
  let anualGrandTotal = 0
  let anualCatTotals: Record<string, number> = {}

  if (isAnual && anualExpensesRaw) {
    // Acumular por categoría × mes
    const catMeta: Record<string, AnualCat> = {}
    const monthByCat: Record<number, Record<string, number>> = {}

    for (let m = 1; m <= 12; m++) monthByCat[m] = {}

    for (const e of anualExpensesRaw) {
      const cat = e.category as unknown as { id: string; name: string; color: string; bg_color: string; icon: string } | null
      if (!cat) continue
      const m = parseInt(e.date.split('-')[1])
      if (!catMeta[cat.id]) catMeta[cat.id] = { ...cat, total: 0 }
      catMeta[cat.id].total += e.amount
      monthByCat[m][cat.id] = (monthByCat[m][cat.id] ?? 0) + e.amount
      anualGrandTotal += e.amount
    }

    anualCats = Object.values(catMeta).sort((a, b) => b.total - a.total).slice(0, 6)
    anualCats.forEach(c => { anualCatTotals[c.id] = c.total })

    const monthLabels = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
    anualRows = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1
      const rowTotal = Object.values(monthByCat[m]).reduce((s, v) => s + v, 0)
      return { monthNum: m, label: monthLabels[i], byCategory: monthByCat[m], total: rowTotal }
    })
  }

  // Max por columna para el heatmap
  const anualColMax: Record<string, number> = {}
  if (isAnual) {
    anualCats.forEach(c => {
      anualColMax[c.id] = Math.max(...anualRows.map(r => r.byCategory[c.id] ?? 0), 1)
    })
  }

  // Insights anuales
  const pastRows = isAnual ? anualRows.filter(r => r.total > 0) : []
  const peakRow  = pastRows.length > 0 ? pastRows.reduce((a, b) => b.total > a.total ? b : a, pastRows[0]) : null
  const lowRow   = pastRows.length > 1 ? pastRows.reduce((a, b) => b.total < a.total ? b : a, pastRows[0]) : null
  const anualMonthLabels = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  const anualShortLabels = ['E','F','M','A','M','J','J','A','S','O','N','D']

  // Spike detection: mes donde la categoría gastó ≥2.2× su propio promedio mensual
  const catSpikes: Record<string, { monthNum: number; val: number; multiple: number }> = {}
  if (isAnual && anualCats.length > 0) {
    anualCats.forEach(c => {
      const activePast = anualRows.filter(r => {
        const isFut = year === now.getFullYear() && r.monthNum > now.getMonth() + 1
        return !isFut && (r.byCategory[c.id] ?? 0) > 0
      })
      if (activePast.length < 2) return
      const avg = activePast.reduce((s, r) => s + (r.byCategory[c.id] ?? 0), 0) / activePast.length
      const top = [...activePast].sort((a, b) => (b.byCategory[c.id] ?? 0) - (a.byCategory[c.id] ?? 0))[0]
      if (top && (top.byCategory[c.id] ?? 0) > avg * 2.2) {
        catSpikes[c.id] = {
          monthNum: top.monthNum,
          val: top.byCategory[c.id] ?? 0,
          multiple: Math.round((top.byCategory[c.id] ?? 0) / avg),
        }
      }
    })
  }

  // ¿Hay gastos en categorías fuera del top-6?
  const hasOtros = isAnual && anualRows.some(row => {
    const catTotal = anualCats.reduce((s, c) => s + (row.byCategory[c.id] ?? 0), 0)
    return row.total > catTotal
  })

  // ── Métricas móvil ───────────────────────────────────────────────────────
  const barMode = bm === 'pct' ? 'pct' : 'amt'
  const prevYearTotal = isAnual ? ((prevYearExpensesRaw ?? []) as { amount: number }[]).reduce((s, e) => s + e.amount, 0) : 0
  const yearElapsedPct = year === now.getFullYear()
    ? Math.round(((now.getMonth() + 1) / 12) * 100)
    : 100
  const yearDelta = prevYearTotal > 0 ? Math.round(((anualGrandTotal - prevYearTotal) / prevYearTotal) * 100) : null
  const anualProjection = year === now.getFullYear() && now.getMonth() > 0
    ? Math.round((anualGrandTotal / (now.getMonth() + 1)) * 12)
    : null
  const firstPastMonth = pastRows.length > 0 ? anualMonthLabels[pastRows[0].monthNum - 1] : null
  const lastPastMonth  = pastRows.length > 0 ? anualMonthLabels[pastRows[pastRows.length - 1].monthNum - 1] : null

  // Formato compacto para celdas de tabla
  function fmtCell(v: number): string {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
    if (v >= 10_000) return `$${Math.round(v / 1_000)}k`
    if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}k`
    return `$${v.toLocaleString('es-CL')}`
  }

  const viewParam = isBilling ? '&view=billing' : ''

  return (
    <div className="px-4 lg:px-8 pt-2 lg:pt-8 pb-8">

      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-brand-900">Análisis</h1>
          <p className="text-sm text-gray-400 mt-0.5">Entiende en qué gastas y detecta oportunidades de ahorro.</p>
        </div>
        {isAnual ? (
          /* Year nav para vista anual */
          <div className="flex items-center gap-0.5 bg-white dark:bg-[#1a2744] border border-gray-200 dark:border-[#2d4f7a] rounded-xl shadow-sm dark:shadow-none p-0.5">
            <Link
              href={`/analisis?year=${year - 1}&view=anual`}
              className="p-1.5 rounded-lg text-brand-600 dark:text-blue-300 hover:bg-brand-50 dark:hover:bg-[#0d1b2e] transition-colors"
              aria-label="Año anterior"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </Link>
            <span className="text-xs font-bold text-brand-700 dark:text-blue-300 min-w-[48px] text-center px-1">
              {year}
            </span>
            <Link
              href={`/analisis?year=${year + 1}&view=anual`}
              className={`p-1.5 rounded-lg text-brand-600 dark:text-blue-300 hover:bg-brand-50 dark:hover:bg-[#0d1b2e] transition-colors ${year >= now.getFullYear() ? 'opacity-30 pointer-events-none' : ''}`}
              aria-label="Año siguiente"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </Link>
          </div>
        ) : (
          <MonthNav month={month} year={year} basePath="/analisis" extraParams={isBilling ? { view: 'billing' } : {}} />
        )}
      </div>

      {/* Toggle */}
      <div className="view-toggle-wrap flex items-center gap-1.5 rounded-xl p-1 mb-5">
        <Link
          href={`/analisis?month=${month}&year=${year}`}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            !isBilling && !isAnual ? 'view-toggle-active-purchase' : 'view-toggle-btn'
          }`}
        >
          <ShoppingCart className="w-3.5 h-3.5" />
          Por compra
        </Link>
        <Link
          href={`/analisis?month=${month}&year=${year}&view=billing`}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            isBilling ? 'view-toggle-active-billing' : 'view-toggle-btn'
          }`}
        >
          <CreditCard className="w-3.5 h-3.5" />
          Por facturación
        </Link>
        <Link
          href={`/analisis?year=${year}&view=anual`}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            isAnual ? 'view-toggle-active-purchase' : 'view-toggle-btn'
          }`}
        >
          <CalendarDays className="w-3.5 h-3.5" />
          Anual
        </Link>
      </div>

      {/* ── Vista anual ────────────────────────────────────────────────────────── */}
      {isAnual && (
        <div className="space-y-4">
          {anualGrandTotal === 0 ? (
            <div className="card text-center py-14 flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-3xl bg-brand-50 flex items-center justify-center">
                <CalendarDays className="w-7 h-7 text-brand-400" />
              </div>
              <p className="text-sm font-bold text-gray-600">Sin gastos en {year}</p>
              <p className="text-xs text-gray-400">Registra gastos para ver el resumen anual</p>
            </div>
          ) : (
            <>
              {/* ══════════════════════ MOBILE (< lg) ══════════════════════ */}

              {/* M1 — Hero: total + año anterior + círculo de progreso */}
              <div className="lg:hidden hero-gradient rounded-3xl px-5 pt-5 pb-5 text-white">
                <p className="text-[9px] text-white/50 font-bold uppercase tracking-widest mb-3">Total gastado en {year}</p>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-4xl font-extrabold tabular-nums leading-none tracking-tight">{formatCLP(anualGrandTotal)}</p>
                    {yearDelta !== null && (
                      <div className={`mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${yearDelta < 0 ? 'bg-emerald-400/20 text-emerald-300' : 'bg-red-400/20 text-red-300'}`}>
                        {yearDelta < 0
                          ? <TrendingDown className="w-3.5 h-3.5 flex-shrink-0" />
                          : <TrendingUp   className="w-3.5 h-3.5 flex-shrink-0" />}
                        <span>{Math.abs(yearDelta)}% {yearDelta < 0 ? 'menos' : 'más'} que en {year - 1}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-shrink-0">
                    <div className="relative w-[76px] h-[76px]">
                      <svg width="76" height="76" viewBox="0 0 76 76">
                        <circle cx="38" cy="38" r="30" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="7" />
                        <circle cx="38" cy="38" r="30" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="7"
                          strokeDasharray={`${(yearElapsedPct / 100) * 188.5} 188.5`}
                          strokeLinecap="round" transform="rotate(-90 38 38)" />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-lg font-extrabold leading-none">{yearElapsedPct}%</span>
                        <span className="text-[8px] text-white/50 leading-tight text-center mt-0.5">del año<br/>transcurrido</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* M2 — Stats: 2×2 grid */}
              <div className="lg:hidden card p-4">
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="bg-purple-50 dark:bg-purple-900/20 rounded-2xl p-3 flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center flex-shrink-0">
                      <TrendingUp className="w-3.5 h-3.5 text-purple-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[9px] uppercase font-bold text-gray-400 dark:text-gray-500 tracking-wide leading-none mb-1">Promedio mensual</p>
                      <p className="text-[13px] font-extrabold text-gray-900 dark:text-gray-100 tabular-nums leading-tight">{formatCLP(Math.round(anualGrandTotal / Math.max(pastRows.length, 1)))}</p>
                      <p className="text-[9px] text-gray-400 mt-0.5">por mes</p>
                    </div>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-3 flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
                      <CalendarDays className="w-3.5 h-3.5 text-blue-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[9px] uppercase font-bold text-gray-400 dark:text-gray-500 tracking-wide leading-none mb-1">Meses con datos</p>
                      <p className="text-[13px] font-extrabold text-gray-900 dark:text-gray-100 leading-tight">
                        {pastRows.length} <span className="text-gray-400 dark:text-gray-500 text-xs font-medium">/ 12</span>
                      </p>
                      {firstPastMonth && lastPastMonth && pastRows.length > 1 && (
                        <p className="text-[9px] text-gray-400 mt-0.5">{firstPastMonth.slice(0,3)} – {lastPastMonth.slice(0,3)}</p>
                      )}
                    </div>
                  </div>
                  {peakRow && (
                    <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl p-3 flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-red-100 dark:bg-red-900/40 flex items-center justify-center flex-shrink-0">
                        <TrendingUp className="w-3.5 h-3.5 text-red-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[9px] uppercase font-bold text-gray-400 dark:text-gray-500 tracking-wide leading-none mb-1">Mes más alto</p>
                        <p className="text-[13px] font-extrabold text-gray-900 dark:text-gray-100 leading-tight">{anualMonthLabels[peakRow.monthNum - 1]}</p>
                        <p className="text-[9px] text-gray-400 tabular-nums mt-0.5">{formatCLP(peakRow.total)}</p>
                      </div>
                    </div>
                  )}
                  {anualProjection && (
                    <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl p-3 flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
                        <BarChart2 className="w-3.5 h-3.5 text-amber-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[9px] uppercase font-bold text-gray-400 dark:text-gray-500 tracking-wide leading-none mb-1">Proyección {year}</p>
                        <p className="text-[13px] font-extrabold text-gray-900 dark:text-gray-100 tabular-nums leading-tight">{formatCLP(anualProjection)}</p>
                        <p className="text-[9px] text-gray-400 mt-0.5">estimado</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* M3 — Gráfico de barras con toggle $ / % */}
              <div className="lg:hidden card p-4">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-bold text-gray-800 dark:text-gray-100">Gasto por mes</p>
                  <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-[#1a2744] rounded-lg p-0.5">
                    <Link href={`/analisis?year=${year}&view=anual`}
                      className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${barMode === 'amt' ? 'bg-white dark:bg-[#0d1b2e] text-brand-600 shadow-sm' : 'text-gray-400'}`}>
                      $
                    </Link>
                    <Link href={`/analisis?year=${year}&view=anual&bm=pct`}
                      className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${barMode === 'pct' ? 'bg-white dark:bg-[#0d1b2e] text-brand-600 shadow-sm' : 'text-gray-400'}`}>
                      %
                    </Link>
                  </div>
                </div>
                <div className="flex items-end justify-between gap-1">
                  {anualRows.map(row => {
                    const isFutureBar  = year === now.getFullYear() && row.monthNum > now.getMonth() + 1
                    const isCurrentBar = row.monthNum === now.getMonth() + 1 && year === now.getFullYear()
                    const isPeakBar    = peakRow?.monthNum === row.monthNum
                    const maxBarH = 80
                    const barH = row.total > 0 ? Math.max(6, Math.round((row.total / (peakRow?.total ?? 1)) * maxBarH)) : 0
                    const valLabel = barMode === 'pct'
                      ? `${Math.round((row.total / anualGrandTotal) * 100)}%`
                      : formatCLP(row.total)
                    return (
                      <div key={row.monthNum} className="flex-1 flex flex-col items-center gap-1">
                        <div style={{ height: `${maxBarH}px`, display: 'flex', alignItems: 'flex-end', width: '100%', position: 'relative' }}>
                          {!isFutureBar ? (
                            <div style={{
                              width: 'min(18px, 100%)', height: barH > 0 ? `${barH}px` : '3px',
                              margin: '0 auto', borderRadius: '4px 4px 2px 2px',
                              backgroundColor: isPeakBar ? '#1B6DD4' : isCurrentBar ? '#4D8FFF' : '#D5E6FF',
                              transition: 'height 0.2s ease', position: 'relative',
                            }}>
                              {isPeakBar && row.total > 0 && (
                                <div style={{
                                  position: 'absolute', bottom: '100%', left: '50%',
                                  transform: 'translateX(-50%)', marginBottom: '6px',
                                  backgroundColor: '#0A1F44', color: 'white',
                                  borderRadius: '8px', padding: '3px 7px',
                                  fontSize: '10px', fontWeight: 700,
                                  whiteSpace: 'nowrap', zIndex: 10,
                                }}>{valLabel}</div>
                              )}
                            </div>
                          ) : (
                            <div style={{
                              width: 'min(18px, 100%)', height: '30px', margin: '0 auto',
                              borderRadius: '4px', border: '1.5px dashed #D5E6FF',
                            }} />
                          )}
                        </div>
                        <span style={{
                          fontSize: '9px', fontWeight: isCurrentBar ? 700 : 400,
                          color: isCurrentBar ? '#1B6DD4' : '#94a3b8',
                          textAlign: 'center', display: 'block', width: '100%',
                        }}>{row.label}</span>
                      </div>
                    )
                  })}
                </div>
                <div className="flex items-center gap-4 mt-3 justify-center">
                  <div className="flex items-center gap-1.5">
                    <div className="w-6 h-1.5 rounded-full bg-[#D5E6FF] dark:bg-[#2d4f7a]" />
                    <span className="text-[9px] text-gray-400">Real</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-0 border border-dashed border-[#D5E6FF] dark:border-[#2d4f7a]" />
                    <span className="text-[9px] text-gray-400">Proyectado</span>
                  </div>
                </div>
              </div>

              {/* M4 — Gasto por categoría */}
              {anualCats.length > 0 && (
                <div className="lg:hidden card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-bold text-gray-800 dark:text-gray-100">Gasto por categoría</p>
                    <Link href={`/analisis?year=${year}&view=anual`} className="text-xs font-semibold text-brand-600 flex items-center gap-0.5">
                      Ver detalle <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                  <div className="flex h-2.5 rounded-full overflow-hidden mb-3" style={{ gap: '2px' }}>
                    {anualCats.map(c => {
                      const pctVal = Math.round((c.total / anualGrandTotal) * 100)
                      return pctVal > 0 ? <div key={c.id} style={{ flex: pctVal, backgroundColor: c.color }} /> : null
                    })}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {anualCats.map(c => {
                      const pctVal = Math.round((c.total / anualGrandTotal) * 100)
                      return (
                        <Link key={c.id} href={`/analisis/${c.id}?year=${year}`}
                          className="flex items-center gap-1.5 bg-gray-50 dark:bg-white/5 rounded-xl px-2.5 py-1.5">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
                          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{c.name}</span>
                          <span className="text-[10px] text-gray-400">{pctVal}%</span>
                          <span className="text-[10px] text-gray-500 dark:text-gray-400 tabular-nums">{formatCLP(c.total)}</span>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* M5 — Ranking colapsado con top 3 preview */}
              <div className="lg:hidden card p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center flex-shrink-0">
                    <Trophy className="w-5 h-5 text-amber-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-800 dark:text-gray-100">Ranking del año</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Toca una categoría para ver su historial mes a mes</p>
                  </div>
                  {Object.keys(catSpikes).length > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 whitespace-nowrap flex-shrink-0">
                      <Zap className="w-3 h-3 flex-shrink-0" />{Object.keys(catSpikes).length} pico{Object.keys(catSpikes).length > 1 ? 's' : ''} detectado{Object.keys(catSpikes).length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <div className="space-y-0.5">
                  {anualCats.slice(0, 3).map((c, idx) => {
                    const CatIcon = isEmoji(c.icon) ? null : getCategoryIcon(c.icon)
                    const pctVal  = anualGrandTotal > 0 ? Math.round((c.total / anualGrandTotal) * 100) : 0
                    const spike   = catSpikes[c.id]
                    const rankColors = ['text-amber-500', 'text-slate-400', 'text-orange-400']
                    return (
                      <Link key={c.id}
                        href={spike ? `/analisis/${c.id}?month=${spike.monthNum}&year=${year}` : `/analisis/${c.id}?year=${year}`}
                        className="flex items-center gap-2.5 px-2 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                        <span className={`w-4 text-center text-[11px] font-extrabold flex-shrink-0 ${rankColors[idx]}`}>{idx + 1}</span>
                        <div className="cat-icon-bg w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ '--cat-bg': c.bg_color, '--cat-color': c.color } as React.CSSProperties}>
                          {isEmoji(c.icon) ? <span className="text-sm leading-none">{c.icon}</span>
                            : CatIcon ? <CatIcon className="w-3.5 h-3.5" style={{ color: c.color }} /> : null}
                        </div>
                        <span className="flex-1 text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{c.name}</span>
                        {spike && <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-500 flex-shrink-0"><Zap className="w-2.5 h-2.5" />×{spike.multiple}</span>}
                        <span className="text-[10px] text-gray-400 flex-shrink-0">{pctVal}%</span>
                        <span className="text-sm font-bold text-gray-900 dark:text-gray-100 tabular-nums flex-shrink-0">{formatCLP(c.total)}</span>
                      </Link>
                    )
                  })}
                </div>
                {anualCats.length > 3 && (
                  <p className="text-center text-xs text-gray-400 mt-2 pt-2 border-t border-gray-50 dark:border-[#1a2744]">
                    +{anualCats.length - 3} categorías más
                  </p>
                )}
              </div>

              {/* ══════════════════════ DESKTOP (≥ lg) ══════════════════════ */}

              {/* D1 — Hero completo */}
              <div className="hidden lg:block hero-gradient rounded-3xl px-6 pt-6 pb-5 text-white">
                <div className="mb-5">
                  <p className="text-[9px] text-white/50 font-bold uppercase tracking-widest mb-1.5">Total gastado en {year}</p>
                  <p className="text-4xl font-extrabold text-white tabular-nums leading-none tracking-tight">{formatCLP(anualGrandTotal)}</p>
                </div>
                <div className="flex gap-2 overflow-x-auto scrollbar-none mb-5">
                  <div className="flex-shrink-0 bg-white/12 rounded-xl px-3.5 py-2.5">
                    <p className="text-[9px] text-white/45 font-bold uppercase tracking-wide mb-0.5">Promedio</p>
                    <p className="text-sm font-extrabold text-white tabular-nums">{formatCLP(Math.round(anualGrandTotal / Math.max(pastRows.length, 1)))}</p>
                    <p className="text-[9px] text-white/35 mt-0.5">por mes</p>
                  </div>
                  <div className="flex-shrink-0 bg-white/12 rounded-xl px-3.5 py-2.5">
                    <p className="text-[9px] text-white/45 font-bold uppercase tracking-wide mb-0.5">Meses</p>
                    <p className="text-sm font-extrabold text-white">{pastRows.length} <span className="text-white/35 text-xs font-medium">/ 12</span></p>
                    <p className="text-[9px] text-white/35 mt-0.5">con datos</p>
                  </div>
                  {peakRow && (
                    <div className="flex-shrink-0 bg-white/12 rounded-xl px-3.5 py-2.5">
                      <p className="text-[9px] text-white/45 font-bold uppercase tracking-wide mb-0.5 flex items-center gap-1">Más alto <ArrowUp className="w-2.5 h-2.5" /></p>
                      <p className="text-sm font-extrabold text-white leading-tight">{anualMonthLabels[peakRow.monthNum - 1]}</p>
                      <p className="text-[9px] text-white/50 tabular-nums mt-0.5">{formatCLP(peakRow.total)}</p>
                    </div>
                  )}
                  {lowRow && lowRow.monthNum !== peakRow?.monthNum && (
                    <div className="flex-shrink-0 bg-white/12 rounded-xl px-3.5 py-2.5">
                      <p className="text-[9px] text-white/45 font-bold uppercase tracking-wide mb-0.5">Más bajo</p>
                      <p className="text-sm font-extrabold text-emerald-300 leading-tight">{anualMonthLabels[lowRow.monthNum - 1]}</p>
                      <p className="text-[9px] text-white/50 tabular-nums mt-0.5">{formatCLP(lowRow.total)}</p>
                    </div>
                  )}
                </div>
                <div className="flex items-end justify-between" style={{ gap: '3px' }}>
                  {anualRows.map(row => {
                    const isFutureBar  = year === now.getFullYear() && row.monthNum > now.getMonth() + 1
                    const isCurrentBar = row.monthNum === now.getMonth() + 1 && year === now.getFullYear()
                    const isPeakBar    = peakRow?.monthNum === row.monthNum
                    const maxBarH = 60
                    const barH = row.total > 0 ? Math.max(5, Math.round((row.total / (peakRow?.total ?? 1)) * maxBarH)) : 0
                    const showVal = (isPeakBar || isCurrentBar) && row.total > 0
                    const labelColor = isCurrentBar ? 'rgba(255,255,255,1)' : isPeakBar ? 'rgba(255,255,255,0.75)' : isFutureBar ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.40)'
                    return (
                      <div key={row.monthNum} className="flex-1 flex flex-col items-center" style={{ gap: '3px' }}>
                        <span className="text-[8px] tabular-nums font-bold leading-none" style={{ color: showVal ? 'rgba(255,255,255,0.72)' : 'transparent', userSelect: 'none', height: '10px' }}>
                          {formatCLP(row.total)}
                        </span>
                        <div style={{ height: `${maxBarH}px`, display: 'flex', alignItems: 'flex-end', width: '100%' }}>
                          {!isFutureBar ? (
                            <div style={{
                              width: 'min(20px, 100%)', height: barH > 0 ? `${barH}px` : '2px', margin: '0 auto',
                              borderRadius: '4px 4px 2px 2px', transition: 'height 0.2s ease',
                              backgroundColor: isPeakBar ? 'rgba(255,255,255,0.88)' : isCurrentBar ? 'rgba(255,255,255,0.60)' : barH === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.32)',
                            }} />
                          ) : (
                            <div style={{ width: 'min(20px, 100%)', height: '2px', margin: '0 auto', borderRadius: '2px', backgroundColor: 'rgba(255,255,255,0.07)' }} />
                          )}
                        </div>
                        <span className="bar-month-label" style={{ fontWeight: isCurrentBar ? 700 : 500, color: labelColor }}>
                          {anualMonthLabels[row.monthNum - 1]}
                        </span>
                      </div>
                    )
                  })}
                </div>
                {anualCats.length > 0 && (
                  <div className="mt-5 pt-4 border-t border-white/10">
                    <div className="flex h-3 rounded-full overflow-hidden" style={{ gap: '2px' }}>
                      {anualCats.map(c => {
                        const pctVal = Math.round((c.total / anualGrandTotal) * 100)
                        return pctVal > 0 ? <div key={c.id} style={{ flex: pctVal, backgroundColor: c.color }} title={`${c.name}: ${pctVal}%`} /> : null
                      })}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5">
                      {anualCats.map(c => {
                        const pctVal = Math.round((c.total / anualGrandTotal) * 100)
                        return (
                          <div key={c.id} className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
                            <span className="text-[10px] text-white/65 font-semibold">{c.name} <span className="text-white/40">{pctVal}%</span></span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* D2 — Ranking completo */}
              <div className="hidden lg:block card p-5">
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <p className="text-sm font-bold text-gray-800 dark:text-gray-100">Ranking del año</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Toca una categoría para ver su historial mes a mes</p>
                  </div>
                  {Object.keys(catSpikes).length > 0 && (
                    <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 flex-shrink-0">
                      <Zap className="w-3 h-3 flex-shrink-0" />{Object.keys(catSpikes).length} pico{Object.keys(catSpikes).length > 1 ? 's' : ''} detectado{Object.keys(catSpikes).length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <div className="mt-3 space-y-0.5">
                  {anualCats.map((c, idx) => {
                    const pctVal  = anualGrandTotal > 0 ? Math.round((c.total / anualGrandTotal) * 100) : 0
                    const barW    = anualCats[0].total > 0 ? Math.round((c.total / anualCats[0].total) * 100) : 0
                    const spike   = catSpikes[c.id]
                    const CatIcon = isEmoji(c.icon) ? null : getCategoryIcon(c.icon)
                    const rankColors = ['text-amber-500', 'text-slate-400', 'text-orange-400', 'text-gray-300 dark:text-gray-600', 'text-gray-300 dark:text-gray-600', 'text-gray-300 dark:text-gray-600']
                    return (
                      <Link key={c.id}
                        href={spike ? `/analisis/${c.id}?month=${spike.monthNum}&year=${year}` : `/analisis/${c.id}?year=${year}`}
                        className="flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-gray-50 dark:hover:bg-white/5 transition-colors group">
                        <span className={`w-4 text-center text-[11px] font-extrabold flex-shrink-0 ${rankColors[idx] ?? 'text-gray-300 dark:text-gray-600'}`}>{idx + 1}</span>
                        <div className="cat-icon-bg w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ '--cat-bg': c.bg_color, '--cat-color': c.color } as React.CSSProperties}>
                          {isEmoji(c.icon) ? <span className="text-base leading-none">{c.icon}</span>
                            : CatIcon ? <CatIcon className="w-4 h-4" style={{ color: c.color }} /> : null}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{c.name}</span>
                            {spike && (
                              <span className="inline-flex items-center gap-0.5 flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400">
                                <Zap className="w-2.5 h-2.5" />×{spike.multiple} en {anualMonthLabels[spike.monthNum - 1].slice(0, 3)}
                              </span>
                            )}
                          </div>
                          <div className="h-2 rounded-full overflow-hidden bg-gray-100 dark:bg-white/10">
                            <div className="h-full rounded-full transition-all" style={{ width: `${barW}%`, backgroundColor: c.color }} />
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 pl-2 min-w-[100px]">
                          <p className="text-sm font-bold text-gray-900 dark:text-gray-100 tabular-nums">{formatCLP(c.total)}</p>
                          <p className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">{pctVal}% del año</p>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 group-hover:text-gray-400 transition-colors flex-shrink-0" />
                      </Link>
                    )
                  })}
                </div>
              </div>

              {/* D3 — Tabla mes × categoría — solo desktop */}
              <div className="hidden lg:block card overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-50 dark:border-[#1a2744]">
                  <p className="text-sm font-bold text-gray-800 dark:text-gray-100">Desglose mensual</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Toca un mes para ver el detalle · La intensidad del color indica el peso relativo en cada categoría</p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b-2 border-gray-100 dark:border-[#2d4f7a] bg-gray-50/50 dark:bg-[#0d1b2e]">
                        <th className="text-left px-4 py-3 font-bold text-gray-500 dark:text-gray-400 sticky left-0 bg-gray-50/80 dark:bg-[#0d1b2e] min-w-[104px]">Mes</th>
                        {anualCats.map(c => (
                          <th key={c.id} className="px-3 py-3 text-right min-w-[88px]">
                            <div className="flex items-center justify-end gap-1.5">
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
                              <span className="font-bold text-gray-700 dark:text-gray-300 truncate max-w-[68px]" title={c.name}>{c.name}</span>
                            </div>
                          </th>
                        ))}
                        {hasOtros && (
                          <th className="px-3 py-3 text-right min-w-[72px]">
                            <span className="font-bold text-gray-400 dark:text-gray-500">Otros</span>
                          </th>
                        )}
                        <th className="px-4 py-3 font-bold text-gray-700 dark:text-gray-300 text-right min-w-[120px] border-l border-gray-100 dark:border-[#2d4f7a]">Total mes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {anualRows.map(row => {
                        const isCurrentM = row.monthNum === now.getMonth() + 1 && year === now.getFullYear()
                        const isFuture   = year === now.getFullYear() && row.monthNum > now.getMonth() + 1
                        const isPeak     = peakRow?.monthNum === row.monthNum
                        const isEmpty    = row.total === 0
                        const catTotal   = anualCats.reduce((s, c) => s + (row.byCategory[c.id] ?? 0), 0)
                        const otros      = row.total - catTotal
                        const barPct     = peakRow && peakRow.total > 0 ? Math.round((row.total / peakRow.total) * 100) : 0
                        const yearPct    = anualGrandTotal > 0 ? Math.round((row.total / anualGrandTotal) * 100) : 0

                        if (isFuture) return null

                        return (
                          <tr
                            key={row.monthNum}
                            className={`border-b border-gray-50 dark:border-[#1a2744] last:border-0 transition-colors ${isCurrentM ? 'bg-blue-50/60 dark:bg-blue-950/30' : 'hover:bg-gray-50/50 dark:hover:bg-white/5'}`}
                          >
                            {/* Mes — clickable */}
                            <td className={`px-4 py-3 sticky left-0 text-[13px] ${
                              isCurrentM ? 'bg-blue-50/80 dark:bg-blue-950/50' : 'bg-white dark:bg-[#0d1b2e]'
                            }`}>
                              <Link
                                href={`/analisis?month=${row.monthNum}&year=${year}`}
                                className={`flex items-center gap-1.5 font-semibold hover:underline underline-offset-2 ${
                                  isCurrentM ? 'text-brand-700 dark:text-blue-300' : isEmpty ? 'text-gray-300 dark:text-gray-600' : 'text-gray-700 dark:text-gray-200'
                                }`}
                              >
                                {anualMonthLabels[row.monthNum - 1]}
                                {isCurrentM && <span className="text-[10px] font-bold text-brand-600 dark:text-blue-300 bg-brand-100 dark:bg-blue-900/60 px-1.5 py-0.5 rounded-full">Actual</span>}
                                {isPeak && !isCurrentM && <ArrowUp className="w-3 h-3 text-red-400 flex-shrink-0" />}
                              </Link>
                            </td>

                            {/* Celdas por categoría — clicables */}
                            {anualCats.map(c => {
                              const val       = row.byCategory[c.id] ?? 0
                              const opacity   = val > 0 ? 0.12 + (val / anualColMax[c.id]) * 0.7 : 0
                              const isColPeak = val > 0 && val === anualColMax[c.id] && pastRows.length > 1
                              return (
                                <td key={c.id} className="p-1.5">
                                  {val > 0 ? (
                                    <Link
                                      href={`/analisis/${c.id}?month=${row.monthNum}&year=${year}`}
                                      className="relative flex items-center justify-end px-2.5 py-2.5 rounded-lg overflow-hidden group min-h-[36px]"
                                    >
                                      <span
                                        className="absolute inset-0 rounded-lg transition-opacity group-hover:opacity-80"
                                        style={{ backgroundColor: c.color, opacity }}
                                      />
                                      {/* Spike indicator: ring naranja inset */}
                                      {catSpikes[c.id]?.monthNum === row.monthNum && (
                                        <span className="absolute inset-0 rounded-lg ring-2 ring-inset ring-orange-400 z-10 pointer-events-none" />
                                      )}
                                      {catSpikes[c.id]?.monthNum === row.monthNum && (
                                        <Zap className="absolute top-1 left-1 w-3 h-3 z-10 text-orange-400" />
                                      )}
                                      <span className={`relative font-semibold text-xs tabular-nums ${
                                        isColPeak ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-100'
                                      }`}>
                                        {formatCLP(val)}
                                      </span>
                                    </Link>
                                  ) : (
                                    <div className="min-h-[36px]" />
                                  )}
                                </td>
                              )
                            })}

                            {/* Otros */}
                            {hasOtros && (
                              <td className="px-3 py-3 text-right tabular-nums text-gray-400 dark:text-gray-500 font-medium">
                                {otros > 0 ? formatCLP(otros) : ''}
                              </td>
                            )}

                            {/* Total fila + mini barra + % */}
                            <td className="px-4 py-3 text-right border-l border-gray-100 dark:border-[#2d4f7a]">
                              {row.total > 0 ? (
                                <div className="flex flex-col items-end gap-1">
                                  <span className={`tabular-nums font-bold ${isPeak ? 'text-red-500' : 'text-gray-900 dark:text-gray-100'}`}>
                                    {formatCLP(row.total)}
                                  </span>
                                  <div className="w-full h-1.5 rounded-full overflow-hidden bg-black/5 dark:bg-white/10">
                                    <div
                                      className="h-full rounded-full"
                                      style={{ width: `${barPct}%`, backgroundColor: isPeak ? '#EF4444' : '#1B6DD4' }}
                                    />
                                  </div>
                                  <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">{yearPct}% del año</span>
                                </div>
                              ) : (
                                <span className="text-gray-300 dark:text-gray-600">—</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>

                    {/* Footer — totales anuales */}
                    <tfoot>
                      <tr className="border-t-2 border-gray-200 dark:border-[#2d4f7a] bg-gray-50 dark:bg-[#0d1b2e]">
                        <td className="px-4 py-3 font-extrabold text-gray-700 dark:text-gray-200 sticky left-0 bg-gray-50 dark:bg-[#0d1b2e] text-[13px]">Total año</td>
                        {anualCats.map(c => (
                          <td key={c.id} className="px-3 py-3 text-right font-bold tabular-nums text-gray-900 dark:text-gray-100">
                            {formatCLP(anualCatTotals[c.id])}
                          </td>
                        ))}
                        {hasOtros && (
                          <td className="px-3 py-3 text-right font-bold tabular-nums text-gray-500 dark:text-gray-400">
                            {(() => {
                              const tot = anualRows.reduce((s, r) => {
                                const ct = anualCats.reduce((cs, c) => cs + (r.byCategory[c.id] ?? 0), 0)
                                return s + Math.max(0, r.total - ct)
                              }, 0)
                              return tot > 0 ? formatCLP(tot) : '—'
                            })()}
                          </td>
                        )}
                        <td className="px-4 py-3 text-right font-extrabold tabular-nums text-base border-l border-gray-200 dark:border-[#2d4f7a]" style={{ color: '#1B6DD4' }}>
                          {formatCLP(anualGrandTotal)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {year === now.getFullYear() && now.getMonth() < 11 && (
                  <div className="px-4 py-2.5 border-t border-gray-50 dark:border-[#1a2744] bg-gray-50/40 dark:bg-transparent">
                    <p className="text-[11px] text-gray-400 dark:text-gray-500">
                      Se muestran solo los meses con datos. Los meses restantes de {year} aparecerán cuando los registres.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── KPI strip ──────────────────────────────────────────────────────────── */}
      {!isAnual && totalSelected > 0 && (() => {
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
      {!isAnual && insight && (
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
      {!isAnual && <div className="lg:grid lg:gap-6 lg:items-start space-y-5 lg:space-y-0" style={{ gridTemplateColumns: '2fr 3fr' }}>

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
                {(() => {
                  const maxCatTotal = catSummary[0]?.total ?? 1
                  return catSummary.map((c, idx) => {
                  const limit        = catBudgetMap.get(c.id) ?? null
                  const over         = limit ? c.total > limit : false
                  const budgetPct    = limit ? Math.min(100, Math.round((c.total / limit) * 100)) : null
                  const sharePct     = pct(c.total, totalSelected)
                  const barWidth     = limit ? budgetPct! : Math.round((c.total / maxCatTotal) * 100)

                  // Recurring context: don't alarm if overage is entirely from fixed costs
                  const recurringAmt  = recurringByCat[c.id] ?? 0
                  const isAllRecurring = recurringAmt > 0 && recurringAmt >= c.total
                  const hasRecurring   = recurringAmt > 0 && !isAllRecurring

                  // Bar color: suppress red alarm when all spending is fixed/recurring
                  const barColor = (over && isAllRecurring)
                    ? c.color
                    : over ? '#EF4444'
                    : budgetPct !== null && budgetPct >= 80 ? '#F59E0B'
                    : c.color

                  // Status label
                  const statusLabel = isAllRecurring && over
                    ? '↻ Gasto fijo'
                    : over
                      ? `+${formatCLP(c.total - limit!)} sobre el límite`
                      : limit
                        ? `${formatCLP(limit - c.total)} restante`
                        : 'Sin límite'

                  const statusColor = isAllRecurring && over
                    ? 'text-gray-400'
                    : over ? 'text-red-500 font-semibold'
                    : 'text-gray-400'

                  const CatIcon = isEmoji(c.icon) ? null : getCategoryIcon(c.icon)

                  return (
                    <Link
                      key={c.id}
                      href={`/analisis/${c.id}?month=${month}&year=${year}${viewParam}`}
                      className="block px-4 py-3 hover:bg-gray-50/60 transition-colors active:bg-brand-50"
                    >
                      <div className="flex items-center gap-3 mb-1.5">
                        {/* Rank badge */}
                        <div className={`w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${
                          idx === 0 ? 'rank-gold' : idx === 1 ? 'rank-silver' : idx === 2 ? 'rank-bronze' : 'rank-default'
                        }`}>
                          {idx + 1}
                        </div>

                        {/* Category icon */}
                        <div
                          className="cat-icon-bg w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ '--cat-bg': c.bg_color, '--cat-color': c.color } as React.CSSProperties}
                        >
                          {isEmoji(c.icon)
                            ? <span className="text-sm leading-none">{c.icon}</span>
                            : CatIcon ? <CatIcon className="w-4 h-4" style={{ color: c.color }} /> : null
                          }
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-semibold text-gray-800 leading-tight truncate">{c.name}</p>
                            {isAllRecurring && (
                              <span className="text-[9px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full flex-shrink-0">↻ fijo</span>
                            )}
                            {hasRecurring && (
                              <span className="text-[9px] font-semibold text-gray-400 flex-shrink-0">↻ {formatCLP(recurringAmt)}</span>
                            )}
                          </div>
                          <p className={`text-xs ${statusColor}`}>{statusLabel}</p>
                        </div>

                        <div className="text-right flex-shrink-0 flex items-center gap-1.5">
                          <div>
                            <p className="text-sm font-bold text-gray-900 tabular-nums">{formatCLP(c.total)}</p>
                            {limit && <p className="text-[10px] text-gray-400 tabular-nums">de {formatCLP(limit)}</p>}
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="progress-track h-1.5 rounded-full overflow-hidden ml-8" style={{ '--bar-color': barColor } as React.CSSProperties}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${barWidth}%`, backgroundColor: barColor }} />
                      </div>
                    </Link>
                  )
                  })
                })()}
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

      </div>}
    </div>
  )
}
