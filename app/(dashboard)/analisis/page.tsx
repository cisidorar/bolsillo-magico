import { createClient, getServerSession } from '@/lib/supabase/server'
import { formatCLP, monthName, pct, isEmoji, getNowChile, billingPeriod } from '@/lib/utils'
import { computeAndSnapshotNetWorth } from '@/lib/net-worth'
import { getExpenseIcon } from '@/lib/expense-icons'
import { getCategoryIcon } from '@/lib/category-icons'
import MonthNav from '@/components/MonthNav'
import Link from 'next/link'
import type { ExpenseWithRelations, CategoryBudget } from '@/types'
import { TrendingUp, TrendingDown, Minus, CreditCard, BarChart2, ChevronRight, ChevronLeft, ShoppingCart, Wallet, CalendarDays, Trophy, Zap, ArrowUp, ArrowDown, Sparkles, AlertTriangle, Check, Clock, Package, ArrowRight, Target, PiggyBank, ShieldCheck, CalendarClock } from 'lucide-react'
import ServiceLogo from '@/components/ServiceLogo'
import AnalyzeTrigger from '@/components/AnalyzeTrigger'
import IncomeEditor from '@/components/IncomeEditor'
import PatrimonioCards, { type RatePoint } from '@/components/PatrimonioCards'

export const revalidate = 0

export default async function AnalisisPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string; view?: string; bm?: string }>
}) {
  const { month: monthStr, year: yearStr, view, bm } = await searchParams
  const { now } = getNowChile()
  const isAnual = view === 'anual'

  const [user, supabase] = await Promise.all([getServerSession(), createClient()])

  const month = monthStr ? parseInt(monthStr) : now.getMonth() + 1
  const year  = yearStr  ? parseInt(yearStr)  : now.getFullYear()

  // El gráfico siempre muestra los últimos 6 meses hasta HOY
  const chartAnchor = new Date(now.getFullYear(), now.getMonth(), 1)
  const sixAgo      = new Date(chartAnchor); sixAgo.setMonth(sixAgo.getMonth() - 5)
  const chartStart  = `${sixAgo.getFullYear()}-${String(sixAgo.getMonth() + 1).padStart(2, '0')}-01`

  const prevMonth   = month === 1 ? 12 : month - 1
  const prevYear    = month === 1 ? year - 1 : year

  const selectedKey = `${year}-${String(month).padStart(2, '0')}`
  const currentKey  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const selEnd   = new Date(year, month + 1, 1)
  const curEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const fetchEnd = selEnd > curEnd ? selEnd : curEnd
  const nextYear  = fetchEnd.getFullYear()
  const nextMonth = fetchEnd.getMonth() + 1
  const endDate   = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`

  const fetchStartBase = selectedKey < chartStart.substring(0, 7) ? `${year}-${String(month).padStart(2, '0')}-01` : chartStart
  const fetchStartDate = new Date(fetchStartBase)
  const fetchStart = `${fetchStartDate.getFullYear()}-${String(fetchStartDate.getMonth() + 1).padStart(2, '0')}-01`

  // Ventana de 12 meses (anclada a HOY) para la tasa de ahorro histórica
  const rateStartD  = new Date(now.getFullYear(), now.getMonth() - 11, 1)
  const rateStart   = `${rateStartD.getFullYear()}-${String(rateStartD.getMonth() + 1).padStart(2, '0')}-01`
  const rateEndD    = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const rateEnd     = `${rateEndD.getFullYear()}-${String(rateEndD.getMonth() + 1).padStart(2, '0')}-01`

  const [{ data: expenses }, { data: categoryBudgets }, { data: anualExpensesRaw }, { data: prevYearExpensesRaw }, { data: incomeRow }, { data: prevIncomeRow }, { data: monthBudgetRow }, { data: aiInsightsRaw }, { data: incomes12Raw }, { data: expenses12Raw }, { data: savingsRaw }, { data: recurringRaw }] = await Promise.all([
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
    // Ingreso del mes seleccionado (lo que recibiste este mes, para mostrar en tarjeta)
    supabase.from('incomes').select('amount, description').eq('user_id', user!.id).eq('month', month).eq('year', year).maybeSingle(),
    // Ingreso del mes ANTERIOR (el que financió los gastos de este mes)
    supabase.from('incomes').select('amount').eq('user_id', user!.id).eq('month', prevMonth).eq('year', prevYear).maybeSingle(),
    // Presupuesto mensual global
    supabase.from('budgets').select('amount').eq('user_id', user!.id).eq('month', month).eq('year', year).maybeSingle(),
    // AI insights (may be empty — generated async by AnalyzeTrigger)
    supabase
      .from('monthly_insights')
      .select('type, title, description, impact_amount, severity, action_label, action')
      .eq('user_id', user!.id)
      .eq('month', month)
      .eq('year', year)
      .eq('status', 'active')
      .order('severity', { ascending: false })
      .limit(3),
    // Ingresos de los últimos ~13 meses (el sueldo de M-1 financia M)
    supabase
      .from('incomes')
      .select('month, year, amount')
      .eq('user_id', user!.id)
      .gte('year', rateStartD.getFullYear() - 1),
    // Totales de gasto liviano para la ventana de 12 meses (solo amount + date)
    supabase
      .from('expenses')
      .select('amount, date')
      .eq('user_id', user!.id)
      .gte('date', rateStart)
      .lt('date', rateEnd),
    // Saldos líquidos en cuentas de ahorro
    supabase
      .from('savings_accounts')
      .select('balance')
      .eq('user_id', user!.id),
    // Recurrentes activos para deuda comprometida a futuro (F3)
    supabase
      .from('recurring_expenses')
      .select('amount, billing_month, total_installments, paid_installments')
      .eq('user_id', user!.id)
      .eq('is_active', true),
  ])

  // F4: patrimonio neto — snapshot del mes actual + histórico (solo vista mensual)
  const netWorth = !isAnual
    ? await computeAndSnapshotNetWorth(supabase, user!.id, now)
    : null

  const catBudgetMap = new Map(
    ((categoryBudgets ?? []) as CategoryBudget[]).map(b => [b.category_id, b.amount])
  )

  const typedExpenses = (expenses ?? []) as ExpenseWithRelations[]

  function expenseMonthKey(e: ExpenseWithRelations): string {
    return e.date.substring(0, 7)
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

  const daysElapsed = isCurrentMonth ? now.getDate() : new Date(year, month, 0).getDate()
  const dailyAvg = daysElapsed > 0 && totalSelected > 0 ? Math.round(totalSelected / daysElapsed) : 0

  // vs previous month — comparación al mismo día cuando es el mes actual
  const prevMonthNum  = month === 1 ? 12 : month - 1
  const prevMonthYear = month === 1 ? year - 1 : year
  const prevMonthKey2 = `${prevMonthYear}-${String(prevMonthNum).padStart(2, '0')}`

  const rawPrevExpenses = typedExpenses.filter(e => expenseMonthKey(e) === prevMonthKey2)
  const cutoffDay       = now.getDate()
  // En modo compra y mes actual: solo hasta el mismo día del mes anterior
  const prevExpensesForDelta = isCurrentMonth
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
  const byPM: Record<string, { id: string | null; name: string; total: number; count: number; cardType: string | null; domain?: string | null }> = {}
  selectedExpenses.forEach(e => {
    const key  = e.payment_method?.id ?? 'efectivo'
    const name = e.payment_method?.name ?? 'Efectivo'
    if (!byPM[key]) byPM[key] = {
      id: e.payment_method?.id ?? null,
      name, total: 0, count: 0,
      cardType: e.payment_method?.card_type ?? null,
      domain: (e.payment_method as any)?.domain ?? null,
    }
    byPM[key].total += e.amount
    byPM[key].count++
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
  const prevYearMonthsWithData = isAnual ? ((prevYearExpensesRaw ?? []) as { amount: number }[]).length : 0
  const yearDeltaRaw = prevYearTotal > 0 ? Math.round(((anualGrandTotal - prevYearTotal) / prevYearTotal) * 100) : null
  // Solo mostrar comparación si hay datos suficientes del año anterior y el delta es razonable (no primer año)
  const yearDelta = yearDeltaRaw !== null && prevYearMonthsWithData >= 10 && Math.abs(yearDeltaRaw) <= 300 ? yearDeltaRaw : null
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

  // ── Income & surplus ──────────────────────────────────────────────────────
  // monthIncome = lo que llegó ESTE mes (mostrar en tarjeta, para referencia)
  // prevMonthIncome = lo que llegó el MES ANTERIOR (financió los gastos de este mes)
  const monthIncome      = (incomeRow as { amount?: number } | null)?.amount ?? 0
  const incomeDesc       = (incomeRow as { description?: string } | null)?.description ?? 'Entradas registradas'
  const prevMonthIncome  = (prevIncomeRow as { amount?: number } | null)?.amount ?? 0
  const surplus          = prevMonthIncome > 0 ? prevMonthIncome - totalSelected : null
  const surplusPct       = surplus !== null && prevMonthIncome > 0 ? Math.round((surplus / prevMonthIncome) * 100) : null
  const globalBudget     = (monthBudgetRow as { amount?: number } | null)?.amount ?? null

  // ── Insumos del health score ──────────────────────────────────────────────
  // Category budget compliance
  const catsOverBudget = catSummary.filter(c => {
    const limit = catBudgetMap.get(c.id) ?? null
    if (!limit) return false
    const recurringAmt = recurringByCat[c.id] ?? 0
    const allRecurring = recurringAmt > 0 && recurringAmt >= c.total
    return c.total > limit && !allRecurring
  })
  const numExcedidas = catsOverBudget.length

  // Proyección mensual vs presupuesto global
  const daysInMonth  = new Date(year, month, 0).getDate()
  const projection   = isCurrentMonth && now.getDate() > 3
    ? Math.round((totalSelected / now.getDate()) * daysInMonth)
    : null
  // Projection without the biggest single purchase (to detect one-off distortion)
  const projectionWithoutTop = isCurrentMonth && now.getDate() > 3 && topExpense
    ? Math.round(((totalSelected - topExpense.amount) / now.getDate()) * daysInMonth) + topExpense.amount
    : null
  const projInflatedByTop = projection !== null && projectionWithoutTop !== null && globalBudget !== null
    && projection > globalBudget && projectionWithoutTop <= globalBudget * 1.05

  // ── Construcción de patrimonio: tasa de ahorro + fondo de emergencia ─────
  // Convención de la app: el sueldo del mes ANTERIOR financia los gastos del mes.
  const incomeByKey: Record<string, number> = {}
  for (const inc of (incomes12Raw ?? []) as { month: number; year: number; amount: number }[]) {
    incomeByKey[`${inc.year}-${inc.month}`] = inc.amount
  }
  const expenseByKey: Record<string, number> = {}
  for (const e of (expenses12Raw ?? []) as { amount: number; date: string }[]) {
    const d = new Date(e.date + 'T12:00:00')
    const k = `${d.getFullYear()}-${d.getMonth() + 1}`
    expenseByKey[k] = (expenseByKey[k] ?? 0) + e.amount
  }

  // Serie de 12 meses anclada a HOY (más antiguo → más reciente)
  const ratePoints: RatePoint[] = []
  const completedRates: { rate: number; monthsAgo: number }[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const k = `${d.getFullYear()}-${d.getMonth() + 1}`
    const pd = new Date(d.getFullYear(), d.getMonth() - 1, 1)
    const prevIncomeAmt = incomeByKey[`${pd.getFullYear()}-${pd.getMonth() + 1}`] ?? 0
    const monthExpense  = expenseByKey[k] ?? 0
    const rate = prevIncomeAmt > 0
      ? Math.round(((prevIncomeAmt - monthExpense) / prevIncomeAmt) * 100)
      : null
    ratePoints.push({ label: d.toLocaleString('es-CL', { month: 'short' }).replace('.', ''), rate })
    if (rate !== null && i >= 1) completedRates.push({ rate, monthsAgo: i })  // excluye el mes en curso (parcial)
  }
  const ratesLast6  = completedRates.filter(r => r.monthsAgo <= 6).map(r => r.rate)
  const ratesLast12 = completedRates.map(r => r.rate)
  const rateAvg6  = ratesLast6.length  > 0 ? Math.round(ratesLast6.reduce((s, v) => s + v, 0) / ratesLast6.length)   : null
  const rateAvg12 = ratesLast12.length > 0 ? Math.round(ratesLast12.reduce((s, v) => s + v, 0) / ratesLast12.length) : null

  // Fondo de emergencia: ahorros líquidos / gasto promedio de meses completados
  const savingsBalances  = ((savingsRaw ?? []) as { balance: number }[]).map(s => s.balance)
  const totalSavings     = savingsBalances.reduce((s, v) => s + v, 0)
  const completedExpenses: number[] = []
  for (let i = 1; i <= 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const t = expenseByKey[`${d.getFullYear()}-${d.getMonth() + 1}`] ?? 0
    if (t > 0) completedExpenses.push(t)
  }
  const avgMonthlyExpense = completedExpenses.length > 0
    ? Math.round(completedExpenses.reduce((s, v) => s + v, 0) / completedExpenses.length)
    : null
  const monthsCovered = avgMonthlyExpense !== null && totalSavings > 0
    ? totalSavings / avgMonthlyExpense
    : null
  // UX: tasa de ahorro proyectada — al inicio de mes la tasa cruda es engañosa
  // (día 5 con pocos gastos ≈ 98%). Para el mes en curso proyectamos el gasto al cierre.
  const projectedRate = isCurrentMonth && prevMonthIncome > 0 && projection !== null
    ? Math.round(((prevMonthIncome - projection) / prevMonthIncome) * 100)
    : null
  // La barra del mes en curso también usa la proyección (la tasa cruda parcial engaña)
  if (ratePoints.length > 0) {
    ratePoints[ratePoints.length - 1] = { ...ratePoints[ratePoints.length - 1], rate: projectedRate }
  }

  // F3: deuda comprometida a futuro — cuotas + recurrentes + tarjetas por facturar
  type RecurringLite = { amount: number; billing_month: number | null; total_installments: number | null; paid_installments: number }
  const activeRecurring = (recurringRaw ?? []) as RecurringLite[]

  // Compras ya hechas con tarjeta de crédito cuyo estado de cuenta cae en meses futuros
  const nowMonthIdx = now.getFullYear() * 12 + now.getMonth()
  const cardByOffset: number[] = new Array(7).fill(0)
  typedExpenses.forEach(e => {
    const pm = e.payment_method
    if (!pm || pm.card_type !== 'credit' || !pm.billing_day) return
    const stmt = billingPeriod(e.date, pm.billing_day)
    const offset = (stmt.year * 12 + (stmt.month - 1)) - nowMonthIdx
    if (offset >= 1 && offset <= 6) cardByOffset[offset] += e.amount
  })

  const commitMonths: { label: string; fixed: number; card: number; total: number }[] = []
  for (let i = 1; i <= 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    let fixed = 0
    for (const r of activeRecurring) {
      if (r.total_installments !== null) {
        // Cuotas fijas: quedan N-P; caen en los próximos N-P meses
        const remaining = Math.max(0, r.total_installments - r.paid_installments)
        if (i <= remaining) fixed += r.amount
      } else if (r.billing_month !== null) {
        // Anual: solo en su mes de cobro
        if (d.getMonth() + 1 === r.billing_month) fixed += r.amount
      } else {
        // Indefinido mensual
        fixed += r.amount
      }
    }
    const card = cardByOffset[i]
    commitMonths.push({
      label: d.toLocaleString('es-CL', { month: 'short' }).replace('.', ''),
      fixed, card, total: fixed + card,
    })
  }
  const commitNext = commitMonths[0]?.total ?? 0
  const cardNextTotal = commitMonths[0]?.card ?? 0
  // Ingreso de referencia: el sueldo de ESTE mes financia el próximo (convención de la app);
  // fallback al ingreso más reciente registrado
  let refIncome = incomeByKey[`${now.getFullYear()}-${now.getMonth() + 1}`] ?? 0
  if (refIncome === 0) {
    for (let i = 1; i <= 12 && refIncome === 0; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      refIncome = incomeByKey[`${d.getFullYear()}-${d.getMonth() + 1}`] ?? 0
    }
  }
  const commitRatio = refIncome > 0 && commitNext > 0 ? Math.round((commitNext / refIncome) * 100) : null
  const cuotasPendingTotal = activeRecurring.reduce((s, r) => {
    if (r.total_installments === null) return s
    return s + Math.max(0, r.total_installments - r.paid_installments) * r.amount
  }, 0)
  const fixedMonthlyTotal = activeRecurring
    .filter(r => r.total_installments === null && r.billing_month === null)
    .reduce((s, r) => s + r.amount, 0)
  // Primer mes futuro donde bajan los fijos (terminan cuotas → se libera plata).
  // Se compara solo la parte fija: la tarjeta varía mes a mes y no es "liberación".
  let freeMonthLabel: string | null = null
  for (let i = 1; i < commitMonths.length; i++) {
    if (commitMonths[i].fixed < commitMonths[i - 1].fixed) { freeMonthLabel = commitMonths[i].label; break }
  }

  const showPatrimonio = ratePoints.some(p => p.rate !== null) || surplusPct !== null || savingsBalances.length > 0
    || activeRecurring.length > 0 || (netWorth !== null && netWorth.current.total_clp > 0)

  // UX: no mostrar meses vacíos al inicio del gráfico — con poca historia el chart
  // se veía "roto". Se recorta al primer mes con datos, manteniendo mínimo 6 barras.
  const firstDataIdx = ratePoints.findIndex(p => p.rate !== null)
  const trimmedRatePoints = firstDataIdx === -1
    ? ratePoints.slice(-6)
    : ratePoints.slice(Math.min(firstDataIdx, ratePoints.length - 6))

  // ── F5: Health score (0–100) — ahora premia construir patrimonio ─────────
  // Mix: tasa de ahorro (30) · fondo de emergencia (25) · disciplina de presupuesto (25) · deuda comprometida (20)
  // "Neutral" cuando falta el dato: no castigamos por no haber registrado aún.
  const scoreRate = isCurrentMonth ? projectedRate : surplusPct
  const sAhorro = scoreRate === null ? 18
    : scoreRate >= 20 ? 30
    : scoreRate >= 10 ? 23
    : scoreRate >= 0 ? 14
    : scoreRate >= -10 ? 6 : 0
  const sFondo = monthsCovered === null ? 12
    : monthsCovered >= 6 ? 25
    : monthsCovered >= 3 ? 20
    : monthsCovered >= 1 ? 12 : 6
  const sCompromiso = commitRatio === null ? 10
    : commitRatio < 20 ? 20
    : commitRatio <= 35 ? 12 : 4
  let sDisciplina = numExcedidas === 0 ? 25 : numExcedidas === 1 ? 17 : numExcedidas === 2 ? 10 : 3
  if (projection !== null && globalBudget !== null && projection > globalBudget * 1.1 && !projInflatedByTop) {
    sDisciplina = Math.max(0, sDisciplina - 7)
  }
  const healthScore = sAhorro + sFondo + sCompromiso + sDisciplina
  const healthLabel = healthScore >= 80 ? 'Buena salud'
    : healthScore >= 60 ? 'En camino'
    : healthScore >= 40 ? 'Atención'
    : 'Alerta'
  const healthColor = healthScore >= 80 ? '#1FBE8D'
    : healthScore >= 60 ? '#4D93FF'
    : healthScore >= 40 ? '#FFC23C' : '#FF6F61'
  const healthSummary = healthScore >= 80
    ? 'Vas muy bien: ahorras, tienes respaldo y tus compromisos están bajo control.'
    : healthScore >= 60
    ? 'Vas en buen camino. Revisa las señales en amarillo para subir tu puntaje.'
    : healthScore >= 40
    ? 'Atención: hay señales que necesitan cuidado. Parte por la más roja.'
    : 'Alerta: tus finanzas necesitan un ajuste este mes. Una señal a la vez.'

  // ── Oportunidades de mejora ───────────────────────────────────────────────
  type Oportunidad = {
    icon: React.ElementType
    iconBg: string
    iconColor: string
    title: string
    body: React.ReactNode
    cta: string
    href: string
    isAi?: boolean
  }
  const oportunidades: Oportunidad[] = []

  // 1: Límites excedidos
  if (numExcedidas > 0) {
    const catNames = catsOverBudget.map(c => c.name)
    const extra    = catsOverBudget.reduce((s, c) => s + (c.total - (catBudgetMap.get(c.id) ?? 0)), 0)
    oportunidades.push({
      icon: AlertTriangle,
      iconBg: 'rgba(255,111,97,0.15)',
      iconColor: '#FF6F61',
      title: `Revisa ${numExcedidas} límite${numExcedidas > 1 ? 's' : ''}`,
      body: (
        <>
          {catNames.slice(0, 3).join(', ')} {catNames.length > 3 ? `y ${catNames.length - 3} más` : ''} sumaron{' '}
          <span style={{ color: '#FF6F61', fontWeight: 700 }}>+{formatCLP(extra)}</span> por encima del límite.
          Si el gasto era esperable, sube el límite; si no, ajústalo el próximo mes.
        </>
      ),
      cta: 'Ajustar límites',
      href: '/presupuesto',
    })
  }

  // 2: Mayor categoría sin presupuesto
  const bigCatNoBudget = catSummary.find(c => !catBudgetMap.has(c.id))
  if (bigCatNoBudget && totalSelected > 0) {
    const sharePct2 = Math.round((bigCatNoBudget.total / totalSelected) * 100)
    oportunidades.push({
      icon: Target,
      iconBg: 'rgba(77,147,255,0.15)',
      iconColor: '#4D93FF',
      title: `Controla ${bigCatNoBudget.name}`,
      body: (
        <>
          Gastaste <span style={{ fontWeight: 700 }}>{formatCLP(bigCatNoBudget.total)}</span> en {bigCatNoBudget.name}{' '}
          ({sharePct2}% del mes) sin un límite definido. Ponle un tope y revísalo.
        </>
      ),
      cta: 'Definir presupuesto',
      href: '/presupuesto',
    })
  }

  // 3: Compra única que infla el mes
  const topExpensePct = topExpense && totalSelected > 0
    ? Math.round((topExpense.amount / totalSelected) * 100)
    : 0
  if (topExpense && topExpensePct >= 12) {
    const withoutTop = totalSelected - topExpense.amount
    oportunidades.push({
      icon: Package,
      iconBg: 'rgba(31,190,141,0.15)',
      iconColor: '#1FBE8D',
      title: 'Separa compras únicas',
      body: (
        <>
          {topExpense.description ?? 'Esta compra'} ({formatCLP(topExpense.amount)}) infló tu mes.{' '}
          Sin esa compra puntual gastarías{' '}
          <span style={{ fontWeight: 700 }}>{formatCLP(withoutTop)}</span>.
        </>
      ),
      cta: 'Ver gasto',
      href: '/historial',
    })
  }

  // ── Map AI insights → Oportunidad ────────────────────────────────────────
  type AiInsightRow = {
    type: string; title: string; description: string
    impact_amount: number | null; severity: string
    action_label: string | null; action: string | null
  }
  const aiInsights = (aiInsightsRaw ?? []) as AiInsightRow[]

  function aiInsightToOportunidad(ai: AiInsightRow): Oportunidad {
    const severityColor = ai.severity === 'high' ? '#FF6F61' : ai.severity === 'medium' ? '#FFC23C' : '#4D93FF'
    const severityBg    = ai.severity === 'high' ? 'rgba(255,111,97,0.15)' : ai.severity === 'medium' ? 'rgba(255,194,60,0.15)' : 'rgba(77,147,255,0.15)'
    const icon: React.ElementType =
      ai.type === 'one_time_purchase'       ? Package
      : ai.type === 'subscription_review'  ? Clock
      : ai.type === 'category_over_budget' ? AlertTriangle
      : ai.type === 'budget_missing'       ? Target
      : ai.type === 'habit_increase'       ? TrendingUp
      : ai.type === 'frequent_small_expenses' ? ShoppingCart
      : Sparkles
    const actionHref =
      ai.action === 'create_budget' || ai.action === 'adjust_budget' ? '/presupuesto'
      : ai.action === 'view_category' ? '/historial'
      : ai.action === 'review_expenses' ? '/historial'
      : '/historial'

    return {
      icon,
      iconBg: severityBg,
      iconColor: severityColor,
      title: ai.title,
      body: (
        <>
          {ai.description}
          {ai.impact_amount ? (
            <> Impacto estimado: <span style={{ fontWeight: 700, color: severityColor }}>{formatCLP(ai.impact_amount)}</span>.</>
          ) : null}
        </>
      ),
      cta: ai.action_label ?? 'Ver detalle',
      href: actionHref,
      isAi: true,
    }
  }

  // Solo mostrar insights de IA — si no hay, no mostrar nada (no fallback rule-based)
  const aiOportunidades = aiInsights.map(aiInsightToOportunidad)
  const finalOportunidades: Oportunidad[] = aiOportunidades.slice(0, 3)
  const hasAiInsights = aiOportunidades.length > 0

  const prevMonthName = monthName(month === 1 ? 12 : month - 1)

  return (
    <div className="px-4 lg:px-8 pt-2 lg:pt-8 pb-8">

      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          {/* Desktop: "Resumen anual" cuando isAnual, "Análisis" siempre en mobile */}
          <h1 className="text-3xl font-semibold leading-tight" style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--ink)' }}>
            {isAnual ? (
              <>
                <span className="hidden lg:inline">Resumen anual</span>
                <span className="lg:hidden">Análisis</span>
              </>
            ) : 'Análisis'}
          </h1>
          {isAnual && pastRows.length > 0 && (
            <p className="text-xs text-gray-400 mt-0.5 hidden lg:block">
              {pastRows.length} de 12 meses con registros
            </p>
          )}
          {!isAnual && totalSelected > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">{selectedExpenses.length} gasto{selectedExpenses.length !== 1 ? 's' : ''} · {daysElapsed} días registrados</p>
          )}
        </div>
        {isAnual ? (
          /* Year nav para vista anual — dark pill en desktop, light en mobile */
          <div className="flex items-center gap-0.5 rounded-xl p-0.5
            lg:border-0
            bg-white border border-gray-200 shadow-sm
            lg:bg-transparent lg:shadow-none"
            style={{ background: undefined }}
          >
            {/* Mobile: light pill */}
            <div className="flex items-center gap-0.5 lg:hidden bg-white border border-gray-200 rounded-xl shadow-sm p-0.5">
              <Link href={`/analisis?year=${year - 1}&view=anual`}
                className="p-1.5 rounded-lg text-brand-600 hover:bg-brand-50 transition-colors"
                aria-label="Año anterior">
                <ChevronLeft className="w-4 h-4" />
              </Link>
              <span className="text-xs font-bold text-brand-700 min-w-[44px] text-center px-1">{year}</span>
              <Link href={`/analisis?year=${year + 1}&view=anual`}
                className={`p-1.5 rounded-lg text-brand-600 hover:bg-brand-50 transition-colors ${year >= now.getFullYear() ? 'opacity-30 pointer-events-none' : ''}`}
                aria-label="Año siguiente">
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            {/* Desktop: pill */}
            <div className="hidden lg:flex items-center gap-0.5 rounded-xl p-0.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <Link href={`/analisis?year=${year - 1}&view=anual`}
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: 'var(--ink-3)' }}
                aria-label="Año anterior">
                <ChevronLeft className="w-4 h-4" />
              </Link>
              <span className="text-xs font-bold min-w-[44px] text-center px-1" style={{ color: 'var(--ink)' }}>{year}</span>
              <Link href={`/analisis?year=${year + 1}&view=anual`}
                className={`p-1.5 rounded-lg transition-colors ${year >= now.getFullYear() ? 'opacity-30 pointer-events-none' : ''}`}
                style={{ color: 'var(--ink-3)' }}
                aria-label="Año siguiente">
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        ) : (
          <MonthNav month={month} year={year} basePath="/analisis" />
        )}
      </div>

      {/* Toggle */}
      <div className="view-toggle-wrap flex items-center gap-1.5 rounded-xl p-1 mb-5">
        <Link
          href={`/analisis?month=${month}&year=${year}`}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            !isAnual ? 'view-toggle-active-purchase' : 'view-toggle-btn'
          }`}
        >
          <ShoppingCart className="w-3.5 h-3.5" />
          Mensual
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
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[clamp(28px,8vw,40px)] font-extrabold tabular-nums leading-none tracking-tight">{formatCLP(anualGrandTotal)}</p>
                    {yearDelta !== null && (
                      <div className={`mt-2.5 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold ${yearDelta < 0 ? 'bg-emerald-400/20 text-emerald-300' : 'bg-red-400/20 text-red-300'}`}>
                        {yearDelta < 0
                          ? <TrendingDown className="w-3 h-3 flex-shrink-0" />
                          : <TrendingUp   className="w-3 h-3 flex-shrink-0" />}
                        <span>{Math.abs(yearDelta)}% {yearDelta < 0 ? 'menos' : 'más'} que en {year - 1}</span>
                      </div>
                    )}
                  </div>
                  {/* Círculo de progreso del año */}
                  <div className="flex-shrink-0">
                    <div className="relative w-[100px] h-[100px]">
                      <svg width="100" height="100" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="42" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)" strokeWidth="7" />
                        <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="7"
                          strokeDasharray={`${(yearElapsedPct / 100) * 264} 264`}
                          strokeLinecap="round" transform="rotate(-90 50 50)" />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
                        <span className="text-[22px] font-extrabold leading-none">{yearElapsedPct}%</span>
                        <span className="text-[8px] text-white/45 leading-tight text-center">del año<br/>transcurrido</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* M2 — Stats: 2×2 grid */}
              <div className="lg:hidden card p-4">
                <div className="grid grid-cols-2 gap-2.5">
                  {/* Promedio mensual */}
                  <div className="rounded-2xl p-3.5 flex flex-col gap-2" style={{ backgroundColor: 'rgba(139,92,246,0.14)', border: '1px solid rgba(139,92,246,0.2)' }}>
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(139,92,246,0.22)' }}>
                      <TrendingUp className="w-4 h-4" style={{ color: '#a78bfa' }} />
                    </div>
                    <div>
                      <p className="text-[9px] uppercase font-bold tracking-wide leading-none mb-1.5" style={{ color: '#a78bfa' }}>Promedio mensual</p>
                      <p className="text-[15px] font-extrabold text-gray-900 dark:text-gray-100 tabular-nums leading-tight">{formatCLP(Math.round(anualGrandTotal / Math.max(pastRows.length, 1)))}</p>
                      <p className="text-[9px] text-gray-400 mt-0.5">por mes</p>
                    </div>
                  </div>
                  {/* Meses con datos */}
                  <div className="rounded-2xl p-3.5 flex flex-col gap-2" style={{ backgroundColor: 'rgba(59,130,246,0.14)', border: '1px solid rgba(59,130,246,0.2)' }}>
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(59,130,246,0.22)' }}>
                      <CalendarDays className="w-4 h-4" style={{ color: '#60a5fa' }} />
                    </div>
                    <div>
                      <p className="text-[9px] uppercase font-bold tracking-wide leading-none mb-1.5" style={{ color: '#60a5fa' }}>Meses con datos</p>
                      <p className="text-[15px] font-extrabold text-gray-900 dark:text-gray-100 leading-tight">
                        {pastRows.length}<span className="text-gray-400 text-xs font-medium"> / 12</span>
                      </p>
                      {firstPastMonth && lastPastMonth && pastRows.length > 1 && (
                        <p className="text-[9px] text-gray-400 mt-0.5">{firstPastMonth.slice(0,3)} – {lastPastMonth.slice(0,3)}</p>
                      )}
                    </div>
                  </div>
                  {/* Mes más alto */}
                  {peakRow && (
                    <div className="rounded-2xl p-3.5 flex flex-col gap-2" style={{ backgroundColor: 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.2)' }}>
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(239,68,68,0.22)' }}>
                        <ArrowUp className="w-4 h-4" style={{ color: '#f87171' }} />
                      </div>
                      <div>
                        <p className="text-[9px] uppercase font-bold tracking-wide leading-none mb-1.5" style={{ color: '#f87171' }}>Mes más alto</p>
                        <p className="text-[15px] font-extrabold text-gray-900 dark:text-gray-100 leading-tight">{anualMonthLabels[peakRow.monthNum - 1]}</p>
                        <p className="text-[9px] text-gray-400 tabular-nums mt-0.5">{formatCLP(peakRow.total)}</p>
                      </div>
                    </div>
                  )}
                  {/* Proyección */}
                  {anualProjection && (
                    <div className="rounded-2xl p-3.5 flex flex-col gap-2" style={{ backgroundColor: 'rgba(245,158,11,0.14)', border: '1px solid rgba(245,158,11,0.2)' }}>
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(245,158,11,0.22)' }}>
                        <BarChart2 className="w-4 h-4" style={{ color: '#fbbf24' }} />
                      </div>
                      <div>
                        <p className="text-[9px] uppercase font-bold tracking-wide leading-none mb-1.5" style={{ color: '#fbbf24' }}>Proyección {year}</p>
                        <p className="text-[15px] font-extrabold text-gray-900 dark:text-gray-100 tabular-nums leading-tight">{formatCLP(anualProjection)}</p>
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
                <div className="flex items-end justify-between" style={{ gap: '2px' }}>
                  {anualRows.map(row => {
                    const isFutureBar  = year === now.getFullYear() && row.monthNum > now.getMonth() + 1
                    const isCurrentBar = row.monthNum === now.getMonth() + 1 && year === now.getFullYear()
                    const isPeakBar    = peakRow?.monthNum === row.monthNum
                    const maxBarH = 88
                    const barH = row.total > 0 ? Math.max(8, Math.round((row.total / (peakRow?.total ?? 1)) * maxBarH)) : 0
                    const valLabel = barMode === 'pct'
                      ? `${Math.round((row.total / anualGrandTotal) * 100)}%`
                      : formatCLP(row.total)
                    return (
                      <div key={row.monthNum} className="flex-1 flex flex-col items-center" style={{ gap: '4px' }}>
                        <div style={{ height: `${maxBarH}px`, display: 'flex', alignItems: 'flex-end', width: '100%', position: 'relative' }}>
                          {!isFutureBar ? (
                            <div style={{
                              width: 'min(22px, 100%)', height: barH > 0 ? `${barH}px` : '3px',
                              margin: '0 auto', borderRadius: '5px 5px 2px 2px',
                              background: isPeakBar
                                ? 'var(--primary)'
                                : isCurrentBar
                                  ? '#4D93FF'
                                  : 'var(--bar-color, #D5E6FF)',
                              transition: 'height 0.2s ease', position: 'relative',
                            }} className="dark:[--bar-color:#2d4f7a]">
                              {isPeakBar && row.total > 0 && (
                                <div style={{
                                  position: 'absolute', bottom: '100%', left: '50%',
                                  transform: 'translateX(-50%)', marginBottom: '5px',
                                  background: 'var(--surface-2)', color: 'var(--ink)',
                                  border: '1px solid var(--border)',
                                  borderRadius: '7px', padding: '3px 8px',
                                  fontSize: '10px', fontWeight: 700,
                                  whiteSpace: 'nowrap', zIndex: 10,
                                  boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                                }}>{valLabel}</div>
                              )}
                            </div>
                          ) : (
                            <div style={{
                              width: 'min(22px, 100%)', height: '28px', margin: '0 auto',
                              borderRadius: '5px', border: '1.5px dashed rgba(43,124,246,0.25)',
                            }} />
                          )}
                        </div>
                        <span style={{
                          fontSize: '9px', fontWeight: isCurrentBar ? 700 : 400,
                          color: isCurrentBar ? '#3b82f6' : undefined,
                          textAlign: 'center', display: 'block', width: '100%',
                        }} className={isCurrentBar ? '' : 'text-gray-400 dark:text-gray-600'}>{row.label}</span>
                      </div>
                    )
                  })}
                </div>
                <div className="flex items-center gap-5 mt-4 justify-center">
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-2 rounded-full bg-[#D5E6FF] dark:bg-[#2d4f7a]" />
                    <span className="text-[10px] text-gray-400">Real</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-0 rounded-full border border-dashed border-[#2B7CF6]/30" />
                    <span className="text-[10px] text-gray-400">Proyectado</span>
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

              {/* D1 — [total card + KPIs] | [gráfico de barras] */}
              <div className="hidden lg:flex gap-4 items-start">

                {/* ── Col izquierda: total + Más alto / Más bajo ── */}
                <div className="flex flex-col gap-3 flex-shrink-0" style={{ width: '320px' }}>

                  {/* Tarjeta azul: total + promedio */}
                  <div className="rounded-3xl p-5 flex flex-col" style={{ background: 'var(--primary)' }}>
                    <p className="text-[9px] font-bold uppercase tracking-widest mb-3"
                      style={{ color: 'rgba(255,255,255,0.6)' }}>
                      Total gastado en {year}
                    </p>
                    <p className="text-[clamp(22px,2.2vw,34px)] font-extrabold text-white tabular-nums leading-none tracking-tight break-all">
                      {formatCLP(anualGrandTotal)}
                    </p>
                    {yearDelta !== null && (
                      <div className={`mt-2.5 inline-flex items-center gap-1 self-start px-2 py-1 rounded-lg text-[10px] font-bold ${yearDelta < 0 ? 'bg-emerald-400/20 text-emerald-300' : 'bg-red-400/20 text-red-300'}`}>
                        {yearDelta < 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                        {Math.abs(yearDelta)}% {yearDelta < 0 ? 'menos' : 'más'} que {year - 1}
                      </div>
                    )}
                    <div className="mt-4 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.22)' }}>
                      <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.55)' }}>Promedio / mes</p>
                      <p className="text-base font-extrabold text-white tabular-nums mt-0.5">
                        {formatCLP(Math.round(anualGrandTotal / Math.max(pastRows.length, 1)))}
                      </p>
                    </div>
                  </div>

                  {/* Chips: Más alto + Más bajo */}
                  <div className="grid grid-cols-2 gap-2">
                    {peakRow && (
                      <div className="rounded-2xl p-3.5 flex flex-col gap-1"
                        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                        <div className="flex items-center gap-1 mb-0.5">
                          <ArrowUp className="w-3 h-3 flex-shrink-0" style={{ color: '#FFC23C' }} />
                          <span className="text-[9px] font-bold uppercase tracking-widest"
                            style={{ color: '#FFC23C' }}>Más alto</span>
                        </div>
                        <p className="text-[14px] font-extrabold leading-none" style={{ color: 'var(--ink)' }}>
                          {anualMonthLabels[peakRow.monthNum - 1]}
                        </p>
                        <p className="text-[10px] tabular-nums"
                          style={{ color: 'var(--ink-3)' }}>{formatCLP(peakRow.total)}</p>
                      </div>
                    )}
                    {lowRow && lowRow.monthNum !== peakRow?.monthNum && (
                      <div className="rounded-2xl p-3.5 flex flex-col gap-1"
                        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                        <div className="flex items-center gap-1 mb-0.5">
                          <ArrowDown className="w-3 h-3 flex-shrink-0" style={{ color: '#34D399' }} />
                          <span className="text-[9px] font-bold uppercase tracking-widest"
                            style={{ color: '#34D399' }}>Más bajo</span>
                        </div>
                        <p className="text-[14px] font-extrabold leading-none" style={{ color: 'var(--ink)' }}>
                          {anualMonthLabels[lowRow.monthNum - 1]}
                        </p>
                        <p className="text-[10px] tabular-nums"
                          style={{ color: 'var(--ink-3)' }}>{formatCLP(lowRow.total)}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Col derecha: gráfico de barras ── */}
                <div className="flex-1 rounded-3xl flex flex-col" style={{ background: 'var(--surface)', border: '1px solid var(--border)', minHeight: '260px' }}>

                  {/* Header del chart */}
                  <div className="flex items-center justify-between px-5 pt-4 pb-3"
                    style={{ borderBottom: '1px solid var(--border)' }}>
                    <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Gasto mensual</p>
                    <div className="flex items-center gap-4 text-[11px]" style={{ color: 'var(--ink-3)' }}>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: '#FFC23C' }} />Pico
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: '#4D93FF' }} />Actual
                      </span>
                    </div>
                  </div>

                  {/* Barras */}
                  <div className="flex-1 flex flex-col px-5 pt-5 pb-4">
                    <div className="flex items-end justify-between flex-1" style={{ gap: '5px', minHeight: '140px' }}>
                      {anualRows.map(row => {
                        const isFutureB  = year === now.getFullYear() && row.monthNum > now.getMonth() + 1
                        const isCurrentB = row.monthNum === now.getMonth() + 1 && year === now.getFullYear()
                        const isPeakB    = peakRow?.monthNum === row.monthNum
                        const maxVal     = peakRow?.total ?? 1
                        const barH       = row.total > 0 ? Math.max(8, Math.round((row.total / maxVal) * 140)) : 0
                        const showLabel  = (isPeakB || isCurrentB) && row.total > 0
                        const barBg      = isPeakB ? '#FFC23C' : isCurrentB ? '#4D93FF'
                          : row.total > 0 ? 'rgba(77,147,255,0.32)' : 'rgba(77,147,255,0.08)'

                        return (
                          <div key={row.monthNum} className="flex-1 flex flex-col items-center justify-end"
                            style={{ height: '140px' }}>
                            <span className="text-[9px] tabular-nums font-bold leading-none mb-1.5 text-center w-full truncate block"
                              style={{ color: showLabel ? (isPeakB ? '#FFC23C' : '#4D93FF') : 'transparent' }}>
                              {showLabel ? formatCLP(row.total) : '.'}
                            </span>
                            {!isFutureB ? (
                              <div style={{
                                width: 'min(38px, 100%)',
                                height: barH > 0 ? `${barH}px` : '3px',
                                borderRadius: '5px 5px 2px 2px',
                                backgroundColor: barBg,
                              }} />
                            ) : (
                              <div style={{
                                width: 'min(38px, 100%)', height: '24px',
                                borderRadius: '5px', border: '1.5px dashed var(--border)',
                              }} />
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {/* Labels de mes */}
                    <div className="flex justify-between mt-2" style={{ gap: '5px' }}>
                      {anualRows.map(row => {
                        const isFutureB  = year === now.getFullYear() && row.monthNum > now.getMonth() + 1
                        const isCurrentB = row.monthNum === now.getMonth() + 1 && year === now.getFullYear()
                        const isPeakB    = peakRow?.monthNum === row.monthNum
                        return (
                          <span key={row.monthNum} className="flex-1 text-center text-[9px] leading-none"
                            style={{
                              fontWeight: (isPeakB || isCurrentB) ? 700 : 400,
                              color: isPeakB ? '#FFC23C'
                                : isCurrentB ? '#4D93FF'
                                : isFutureB ? 'var(--ink-3)'
                                : 'var(--ink-3)',
                            }}>
                            {row.label}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* D2 — Ranking de categorías */}
              <div className="hidden lg:block rounded-3xl px-5 py-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>

                {/* Header */}
                <div className="flex items-start justify-between mb-5">
                  <div>
                    <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Ranking de categorías · {year}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>
                      En qué se concentró tu gasto del año
                    </p>
                  </div>
                  {Object.keys(catSpikes).length > 0 && (() => {
                    const spikesArr = Object.entries(catSpikes)
                      .map(([catId, s]) => ({ ...s, catName: anualCats.find(c => c.id === catId)?.name ?? '' }))
                      .sort((a, b) => b.multiple - a.multiple)
                    const top = spikesArr[0]
                    const label = spikesArr.length === 1
                      ? `${top.catName} ×${top.multiple} en ${anualMonthLabels[top.monthNum - 1]}`
                      : `${spikesArr.length} picos detectados`
                    return (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-full flex-shrink-0 ml-4"
                        style={{ background: 'rgba(255,195,60,0.12)', color: '#FFC23C', border: '1px solid rgba(255,195,60,0.22)' }}>
                        <Zap className="w-3 h-3 flex-shrink-0" />{label}
                      </span>
                    )
                  })()}
                </div>

                {/* Filas */}
                <div className="space-y-4">
                  {anualCats.map((c, idx) => {
                    const pctVal  = anualGrandTotal > 0 ? Math.round((c.total / anualGrandTotal) * 100) : 0
                    const barW    = anualCats[0].total > 0 ? Math.round((c.total / anualCats[0].total) * 100) : 0
                    const spike   = catSpikes[c.id]
                    const CatIcon = isEmoji(c.icon) ? null : getCategoryIcon(c.icon)
                    const rankColor = idx === 0 ? '#FFB800' : idx === 1 ? '#94A3B8' : idx === 2 ? '#F97316' : 'var(--ink-3)'
                    return (
                      <Link key={c.id}
                        href={spike ? `/analisis/${c.id}?month=${spike.monthNum}&year=${year}` : `/analisis/${c.id}?year=${year}`}
                        className="block group">
                        {/* Fila superior */}
                        <div className="flex items-center gap-3 mb-1.5">
                          <span className="w-4 text-center text-[11px] font-extrabold flex-shrink-0"
                            style={{ color: rankColor }}>{idx + 1}</span>
                          <div className="cat-icon-bg w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{ '--cat-bg': c.bg_color, '--cat-color': c.color } as React.CSSProperties}>
                            {isEmoji(c.icon)
                              ? <span className="text-sm leading-none">{c.icon}</span>
                              : CatIcon ? <CatIcon className="w-4 h-4" style={{ color: c.color }} /> : null}
                          </div>
                          <div className="flex-1 flex items-center gap-2 min-w-0">
                            <span className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{c.name}</span>
                            {spike && (
                              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                                style={{ background: 'rgba(255,195,60,0.14)', color: '#FFC23C', border: '1px solid rgba(255,195,60,0.2)' }}>
                                <Zap className="w-2.5 h-2.5" />pico en {anualMonthLabels[spike.monthNum - 1].slice(0, 3)}
                              </span>
                            )}
                          </div>
                          <span className="text-sm font-bold tabular-nums flex-shrink-0 pl-3" style={{ color: 'var(--ink)' }}>
                            {formatCLP(c.total)}
                          </span>
                          <span className="text-[11px] font-semibold flex-shrink-0 w-8 text-right"
                            style={{ color: 'var(--ink-3)' }}>{pctVal}%</span>
                        </div>
                        {/* Progress bar azul */}
                        <div className="ml-[52px] h-1.5 rounded-full overflow-hidden"
                          style={{ background: 'var(--border)' }}>
                          <div className="h-full rounded-full" style={{ width: `${barW}%`, background: '#4D93FF' }} />
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>

              {/* D3 — Heatmap mes × categoría — solo desktop */}
              <div className="hidden lg:block rounded-3xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>

                {/* Header */}
                <div className="px-6 pt-5 pb-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <p className="text-base font-bold" style={{ color: 'var(--ink)' }}>Desglose mensual</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>La intensidad del color indica el peso relativo en cada categoría</p>
                  </div>
                  {/* Leyenda de intensidad */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[11px] font-medium" style={{ color: 'var(--ink-3)' }}>Menos</span>
                    {[0.12, 0.28, 0.48, 0.68, 0.90].map((op, i) => (
                      <div key={i} className="w-5 h-4 rounded-md" style={{ background: `rgba(77,147,255,${op})` }} />
                    ))}
                    <span className="text-[11px] font-medium" style={{ color: 'var(--ink-3)' }}>Más</span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th className="text-left px-6 py-3 min-w-[130px] sticky left-0" style={{ background: 'var(--surface)' }}>
                          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-3)' }}>Mes</span>
                        </th>
                        {anualCats.map(c => (
                          <th key={c.id} className="px-2 py-3 text-center min-w-[110px]">
                            <span className="text-[10px] font-bold uppercase tracking-widest block truncate max-w-[96px] mx-auto" style={{ color: 'var(--ink-3)' }} title={c.name}>
                              {c.name.length > 9 ? c.name.slice(0, 8) + '.' : c.name}
                            </span>
                          </th>
                        ))}
                        {hasOtros && (
                          <th className="px-2 py-3 text-center min-w-[90px]">
                            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-3)' }}>Otros</span>
                          </th>
                        )}
                        <th className="px-6 py-3 text-right min-w-[140px]" style={{ borderLeft: '1px solid var(--border)' }}>
                          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-3)' }}>Total Mes</span>
                        </th>
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
                        const yearPct    = anualGrandTotal > 0 ? Math.round((row.total / anualGrandTotal) * 100) : 0

                        if (isFuture) return null

                        return (
                          <tr
                            key={row.monthNum}
                            style={{
                              borderBottom: '1px solid var(--border)',
                              borderLeft: isCurrentM ? '3px solid #4D93FF' : '3px solid transparent',
                            }}
                          >
                            {/* Mes */}
                            <td className="px-4 py-2.5 sticky left-0" style={{ background: 'var(--surface)' }}>
                              <Link href={`/analisis?month=${row.monthNum}&year=${year}`} className="flex items-center gap-2 group">
                                <span className="font-bold text-[14px] leading-tight"
                                  style={{ color: isEmpty ? 'var(--ink-3)' : 'var(--ink)' }}>
                                  {anualMonthLabels[row.monthNum - 1]}
                                </span>
                                {isCurrentM && (
                                  <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full flex-shrink-0"
                                    style={{ background: 'var(--primary)', color: 'white' }}>
                                    Actual
                                  </span>
                                )}
                                {isPeak && !isCurrentM && (
                                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#FFC23C' }} />
                                )}
                              </Link>
                            </td>

                            {/* Celdas heatmap */}
                            {anualCats.map(c => {
                              const val      = row.byCategory[c.id] ?? 0
                              const isSpike  = catSpikes[c.id]?.monthNum === row.monthNum
                              // Intensidad del azul según peso relativo dentro de la columna
                              const intensity = val > 0 ? 0.14 + (val / anualColMax[c.id]) * 0.82 : 0
                              const cellBg   = isSpike ? '#FFC23C' : val > 0 ? `rgba(77,147,255,${intensity.toFixed(2)})` : 'transparent'
                              const textColor = isSpike ? '#0A1F44' : 'var(--ink)'

                              return (
                                <td key={c.id} className="px-1.5 py-2">
                                  {val > 0 ? (
                                    <Link
                                      href={`/analisis/${c.id}?month=${row.monthNum}&year=${year}`}
                                      className="flex flex-col justify-center px-3 py-2 rounded-xl min-h-[44px] gap-0.5 transition-all hover:brightness-110"
                                      style={{ background: cellBg }}
                                    >
                                      {isSpike && (
                                        <span className="flex items-center gap-0.5 text-[9px] font-bold leading-none" style={{ color: '#0A1F44' }}>
                                          <Zap className="w-2.5 h-2.5 flex-shrink-0" />PICO
                                        </span>
                                      )}
                                      <span className="font-bold text-[12px] tabular-nums leading-none" style={{ color: textColor }}>
                                        {formatCLP(val)}
                                      </span>
                                    </Link>
                                  ) : (
                                    <div className="flex items-center justify-center min-h-[44px]">
                                      <span className="text-sm" style={{ color: 'var(--border)' }}>·</span>
                                    </div>
                                  )}
                                </td>
                              )
                            })}

                            {/* Otros */}
                            {hasOtros && (
                              <td className="px-3 py-2.5 text-right tabular-nums font-medium text-[12px]"
                                style={{ color: 'var(--ink-3)' }}>
                                {otros > 0 ? formatCLP(otros) : ''}
                              </td>
                            )}

                            {/* Total fila */}
                            <td className="px-5 py-2.5 text-right" style={{ borderLeft: '1px solid var(--border)' }}>
                              {row.total > 0 ? (
                                <div className="flex flex-col items-end gap-0.5">
                                  <span className="tabular-nums font-extrabold text-[14px] leading-tight"
                                    style={{ color: isPeak ? '#FFC23C' : 'var(--ink)' }}>
                                    {formatCLP(row.total)}
                                  </span>
                                  <span className="text-[10px] tabular-nums font-semibold"
                                    style={{ color: isPeak ? 'rgba(255,195,60,0.6)' : 'var(--ink-3)' }}>
                                    {yearPct}%{isPeak ? ' · máx' : ''}
                                  </span>
                                </div>
                              ) : (
                                <span style={{ color: 'var(--ink-3)' }}>—</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>

                    {/* Footer — totales anuales */}
                    <tfoot>
                      <tr style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                        <td className="px-5 py-4 font-bold text-[11px] uppercase tracking-widest sticky left-0"
                          style={{ color: 'var(--ink-3)', background: 'var(--surface-2)' }}>
                          Total Año
                        </td>
                        {anualCats.map(c => (
                          <td key={c.id} className="px-2 py-4 text-center">
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="font-bold tabular-nums text-[13px]" style={{ color: 'var(--ink)' }}>
                                {formatCLP(anualCatTotals[c.id])}
                              </span>
                              <span className="text-[10px] font-semibold tabular-nums" style={{ color: 'var(--ink-3)' }}>
                                {anualGrandTotal > 0 ? Math.round((anualCatTotals[c.id] / anualGrandTotal) * 100) : 0}%
                              </span>
                            </div>
                          </td>
                        ))}
                        {hasOtros && (
                          <td className="px-3 py-4 text-center font-bold tabular-nums text-[13px]"
                            style={{ color: 'var(--ink-3)' }}>
                            {(() => {
                              const tot = anualRows.reduce((s, r) => {
                                const ct = anualCats.reduce((cs, c) => cs + (r.byCategory[c.id] ?? 0), 0)
                                return s + Math.max(0, r.total - ct)
                              }, 0)
                              return tot > 0 ? formatCLP(tot) : '—'
                            })()}
                          </td>
                        )}
                        <td className="px-5 py-4 text-right" style={{ borderLeft: '1px solid var(--border)' }}>
                          <span className="font-extrabold tabular-nums text-[15px]" style={{ color: '#4D93FF' }}>
                            {formatCLP(anualGrandTotal)}
                          </span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {year === now.getFullYear() && now.getMonth() < 11 && (
                  <div className="px-6 py-3" style={{ borderTop: '1px solid var(--border)' }}>
                    <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
                      Los meses restantes de {year} aparecerán cuando registres gastos.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Vista mensual ─────────────────────────────────────────────────────── */}
      {!isAnual && (() => {
        const topExpenseData = topExpense
          ? getExpenseIcon(topExpense.description ?? null, topExpense.category?.name ?? null)
          : null
        // Donut chart helpers
        const donutR    = 68
        const donutC    = 2 * Math.PI * donutR  // ≈ 427
        const donutFill = Math.round((healthScore / 100) * donutC)

        return (
          <>
            {/* ── 4 KPI cards ─────────────────────────────────────────────────── */}
            {totalSelected > 0 && (
              <>
                {/* Mobile 2×2 */}
                <div className="grid grid-cols-2 gap-2.5 mb-5 lg:hidden">
              {/* Mobile card 1: Ingresos (del mes ANTERIOR — ese financió este mes) */}
              <div className="card p-3">
                <p className="text-[10px] font-medium mb-1.5" style={{ color: 'var(--ink-3)' }}>Sueldo de {prevMonthName}</p>
                <IncomeEditor
                  userId={user!.id}
                  month={prevMonth}
                  year={prevYear}
                  amount={prevMonthIncome > 0 ? prevMonthIncome : null}
                  description={(prevIncomeRow as any)?.description ?? null}
                  compact
                />
              </div>
              {/* Mobile card 2: Gasto total */}
              <div className="card p-3">
                <p className="text-[10px] font-medium mb-1" style={{ color: 'var(--ink-3)' }}>Gasto total</p>
                <div className="flex items-baseline gap-1.5">
                  <p className="text-[15px] font-extrabold tabular-nums leading-tight" style={{ color: 'var(--ink)' }}>{formatCLP(totalSelected)}</p>
                  {delta !== null && (
                    <span className="text-[10px] font-bold" style={{ color: delta > 0 ? '#FF6F61' : '#1FBE8D' }}>
                      {delta > 0 ? '↑' : '↓'}{Math.abs(delta)}%
                    </span>
                  )}
                </div>
                <p className="text-[9px] mt-0.5" style={{ color: 'var(--ink-3)' }}>vs. {prevMonthName} · {formatCLP(dailyAvg)}/día</p>
              </div>
              {/* Mobile card 3: Te sobró */}
              <div className="card p-3" style={surplus !== null && surplus > 0 ? { background: 'rgba(31,190,141,0.10)', border: '1px solid rgba(31,190,141,0.2)' } : {}}>
                <p className="text-[10px] font-medium mb-1" style={{ color: 'var(--ink-3)' }}>Saldo de {prevMonthName}</p>
                {surplus !== null
                  ? <p className="text-[15px] font-extrabold tabular-nums leading-tight" style={{ color: surplus > 0 ? '#1FBE8D' : '#FF6F61' }}>{formatCLP(Math.abs(surplus))}</p>
                  : <p className="text-[13px] font-semibold" style={{ color: 'var(--ink-3)' }}>—</p>
                }
                <p className="text-[9px] mt-0.5" style={{ color: 'var(--ink-3)' }}>{surplusPct !== null ? `${surplusPct}% del sueldo anterior` : 'Sin ingreso de ' + prevMonthName}</p>
              </div>
              {/* Mobile card 4: Mayor gasto */}
              <div className="card p-3">
                <p className="text-[10px] font-medium mb-1" style={{ color: 'var(--ink-3)' }}>Mayor gasto único</p>
                {topExpense
                  ? <>
                      <p className="text-[15px] font-extrabold tabular-nums leading-tight" style={{ color: 'var(--ink)' }}>{formatCLP(topExpense.amount)}</p>
                      <p className="text-[9px] mt-0.5 truncate" style={{ color: 'var(--ink-3)' }}>{topExpense.description ?? topExpense.category?.name ?? 'Gasto'}</p>
                    </>
                  : <p className="text-[13px] font-semibold" style={{ color: 'var(--ink-3)' }}>—</p>
                }
              </div>
            </div>

            {/* Desktop 4-col KPI cards */}
            <div className="hidden lg:grid lg:grid-cols-4 gap-4 mb-6">
              {/* Ingresos (del mes ANTERIOR — ese financió este mes) */}
              <div className="card p-5 flex flex-col gap-1">
                <p className="text-xs font-medium mb-1" style={{ color: 'var(--ink-3)' }}>Sueldo de {prevMonthName}</p>
                <IncomeEditor
                  userId={user!.id}
                  month={prevMonth}
                  year={prevYear}
                  amount={prevMonthIncome > 0 ? prevMonthIncome : null}
                  description={(prevIncomeRow as any)?.description ?? null}
                />
              </div>
              {/* Gasto total */}
              <div className="card p-5 flex flex-col gap-1">
                <p className="text-xs font-medium" style={{ color: 'var(--ink-3)' }}>Gasto total</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-extrabold tabular-nums leading-tight" style={{ color: 'var(--ink)' }}>{formatCLP(totalSelected)}</p>
                  {delta !== null && (
                    <span className="text-[11px] font-bold" style={{ color: delta > 0 ? '#FF6F61' : '#1FBE8D' }}>
                      {delta > 0 ? '↑' : '↓'}{Math.abs(delta)}%
                    </span>
                  )}
                </div>
                <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>vs. {prevMonthName} · {formatCLP(dailyAvg)}/día</p>
              </div>
              {/* Te sobró */}
              <div className="card p-5 flex flex-col gap-1" style={surplus !== null && surplus > 0 ? { background: 'rgba(31,190,141,0.08)', border: '1.5px solid rgba(31,190,141,0.25)' } : {}}>
                <p className="text-xs font-medium" style={{ color: 'var(--ink-3)' }}>Saldo de {prevMonthName}</p>
                {surplus !== null
                  ? <p className="text-2xl font-extrabold tabular-nums leading-tight" style={{ color: surplus > 0 ? '#1FBE8D' : '#FF6F61' }}>{formatCLP(Math.abs(surplus))}</p>
                  : <p className="text-xl font-semibold" style={{ color: 'var(--ink-3)' }}>—</p>
                }
                <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>{surplusPct !== null ? `${surplusPct}% del sueldo de ${prevMonthName}` : `Sin ingreso de ${prevMonthName}`}</p>
              </div>
              {/* Mayor gasto único */}
              <div className="card p-5 flex flex-col gap-1">
                <p className="text-xs font-medium" style={{ color: 'var(--ink-3)' }}>Mayor gasto único</p>
                {topExpense
                  ? <>
                      <p className="text-2xl font-extrabold tabular-nums leading-tight" style={{ color: 'var(--ink)' }}>{formatCLP(topExpense.amount)}</p>
                      <p className="text-[11px] truncate" style={{ color: 'var(--ink-3)' }}>{topExpense.description ?? topExpense.category?.name ?? 'Gasto'} · compra única</p>
                    </>
                  : <p className="text-xl font-semibold" style={{ color: 'var(--ink-3)' }}>—</p>
                }
              </div>
            </div>
          </>
        )}

        {/* ── Health score panel ──────────────────────────────────────────────── */}
        {totalSelected > 0 && (
          <div className="card mb-5 p-5 lg:p-6" style={{ background: 'var(--surface-2)' }}>
            {/* Mobile: stacked / Desktop: side-by-side */}
            <div className="flex flex-col lg:flex-row lg:gap-8 lg:items-center">
              {/* Donut + badge */}
              <div className="flex items-center gap-5 lg:flex-col lg:items-center lg:gap-3 mb-5 lg:mb-0 lg:flex-shrink-0">
                <div className="relative" style={{ width: 160, height: 160 }}>
                  <svg width="160" height="160" viewBox="0 0 160 160">
                    <circle cx="80" cy="80" r={donutR} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="11" />
                    <circle
                      cx="80" cy="80" r={donutR} fill="none"
                      stroke={healthColor} strokeWidth="11"
                      strokeLinecap="round"
                      strokeDasharray={`${donutFill} ${donutC}`}
                      transform="rotate(-90 80 80)"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[38px] font-extrabold leading-none" style={{ color: 'var(--ink)' }}>{healthScore}</span>
                    <span className="text-[11px] font-medium mt-0.5" style={{ color: 'var(--ink-3)' }}>de 100</span>
                  </div>
                </div>
                <div className="lg:text-center">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
                    style={{ background: `${healthColor}20`, color: healthColor }}>
                    <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: healthColor }} />
                    {healthLabel}
                  </span>
                  {/* Summary visible on mobile only */}
                  <p className="text-xs mt-2 leading-relaxed lg:hidden" style={{ color: 'var(--ink-2)' }}>
                    {healthSummary}
                  </p>
                </div>
              </div>

              {/* Signals */}
              <div className="flex-1 min-w-0">
                <div className="hidden lg:block mb-3">
                  <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Tu salud financiera en cuatro señales</p>
                  <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--ink-2)' }}>
                    {healthSummary}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {/* Señal 1: tasa de ahorro (30 pts) */}
                  <div className="rounded-2xl p-3" style={{ background: 'var(--surface)' }}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: scoreRate === null ? 'rgba(148,163,184,0.15)' : scoreRate >= 10 ? 'rgba(31,190,141,0.18)' : scoreRate >= 0 ? 'rgba(255,193,60,0.18)' : 'rgba(255,111,97,0.18)' }}>
                        <PiggyBank className="w-3.5 h-3.5"
                          style={{ color: scoreRate === null ? 'var(--ink-3)' : scoreRate >= 10 ? '#1FBE8D' : scoreRate >= 0 ? '#FFC23C' : '#FF6F61' }} />
                      </div>
                      <p className="text-[11px] font-semibold leading-snug" style={{ color: 'var(--ink)' }}>
                        {scoreRate === null ? 'Tasa de ahorro' : scoreRate >= 20 ? 'Ahorro sano' : scoreRate >= 10 ? 'Ahorro moderado' : scoreRate >= 0 ? 'Ahorro bajo' : 'Gastas más de lo que ganas'}
                      </p>
                    </div>
                    <p className="text-[10px] font-semibold pl-9" style={{ color: scoreRate === null ? 'var(--ink-3)' : scoreRate >= 10 ? '#1FBE8D' : scoreRate >= 0 ? '#FFC23C' : '#FF6F61' }}>
                      {scoreRate !== null
                        ? `${scoreRate}% del sueldo ${isCurrentMonth ? 'proyectado al cierre' : 'quedó guardado'}`
                        : `Registra tu ingreso de ${prevMonthName} para medirla`}
                    </p>
                  </div>

                  {/* Señal 2: fondo de emergencia (25 pts) */}
                  <div className="rounded-2xl p-3" style={{ background: 'var(--surface)' }}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: monthsCovered === null ? 'rgba(148,163,184,0.15)' : monthsCovered >= 3 ? 'rgba(31,190,141,0.18)' : 'rgba(255,193,60,0.18)' }}>
                        <ShieldCheck className="w-3.5 h-3.5"
                          style={{ color: monthsCovered === null ? 'var(--ink-3)' : monthsCovered >= 3 ? '#1FBE8D' : '#FFC23C' }} />
                      </div>
                      <p className="text-[11px] font-semibold leading-snug" style={{ color: 'var(--ink)' }}>
                        {monthsCovered === null ? 'Fondo de emergencia' : monthsCovered >= 6 ? 'Fondo completo' : monthsCovered >= 3 ? 'Fondo en zona segura' : 'Fondo en construcción'}
                      </p>
                    </div>
                    <p className="text-[10px] font-semibold pl-9" style={{ color: monthsCovered === null ? 'var(--ink-3)' : monthsCovered >= 3 ? '#1FBE8D' : '#FFC23C' }}>
                      {monthsCovered !== null
                        ? `Tus ahorros cubren ${monthsCovered.toLocaleString('es-CL', { maximumFractionDigits: 1 })} mes${monthsCovered >= 2 ? 'es' : ''} de gasto`
                        : 'Registra tus ahorros para medirlo'}
                    </p>
                  </div>

                  {/* Señal 3: deuda comprometida / ingreso (20 pts) */}
                  <div className="rounded-2xl p-3" style={{ background: 'var(--surface)' }}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: commitRatio === null ? 'rgba(148,163,184,0.15)' : commitRatio > 35 ? 'rgba(255,111,97,0.18)' : commitRatio >= 20 ? 'rgba(255,193,60,0.18)' : 'rgba(31,190,141,0.18)' }}>
                        <CalendarClock className="w-3.5 h-3.5"
                          style={{ color: commitRatio === null ? 'var(--ink-3)' : commitRatio > 35 ? '#FF6F61' : commitRatio >= 20 ? '#FFC23C' : '#1FBE8D' }} />
                      </div>
                      <p className="text-[11px] font-semibold leading-snug" style={{ color: 'var(--ink)' }}>
                        {commitRatio === null ? 'Deuda comprometida' : commitRatio > 35 ? 'Compromiso alto' : commitRatio >= 20 ? 'Compromiso moderado' : 'Compromiso holgado'}
                      </p>
                    </div>
                    <p className="text-[10px] font-semibold pl-9" style={{ color: commitRatio === null ? 'var(--ink-3)' : commitRatio > 35 ? '#FF6F61' : commitRatio >= 20 ? '#FFC23C' : '#1FBE8D' }}>
                      {commitRatio !== null
                        ? `${commitRatio}% del ingreso ya está comprometido (sano: <35%)`
                        : commitNext > 0 ? 'Registra tu ingreso para medirla' : 'Sin cuotas ni fijos pendientes'}
                    </p>
                  </div>

                  {/* Señal 4: disciplina de presupuesto (25 pts) */}
                  {(() => {
                    const projOver = projection !== null && globalBudget !== null && projection > globalBudget * 1.1 && !projInflatedByTop
                    const bad = numExcedidas > 0 || projOver
                    const title = numExcedidas > 0
                      ? `${numExcedidas} categoría${numExcedidas > 1 ? 's' : ''} excedida${numExcedidas > 1 ? 's' : ''}`
                      : projOver ? 'Proyección sobre presupuesto'
                      : projInflatedByTop ? 'Al día, salvo una compra única'
                      : 'Presupuestos en orden'
                    const subtitle = numExcedidas > 0
                      ? `+${formatCLP(catsOverBudget.reduce((s, c) => s + c.total - (catBudgetMap.get(c.id) ?? 0), 0))} fuera de límite`
                      : projOver && projection !== null ? `${formatCLP(projection)} estimado al cierre`
                      : catBudgetMap.size > 0 ? 'Todos dentro del límite' : 'Define límites para afinar esta señal'
                    return (
                      <div className="rounded-2xl p-3" style={{ background: 'var(--surface)' }}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{ background: numExcedidas > 0 ? 'rgba(255,111,97,0.18)' : projOver ? 'rgba(255,193,60,0.18)' : 'rgba(31,190,141,0.18)' }}>
                            {numExcedidas > 0
                              ? <AlertTriangle className="w-3.5 h-3.5" style={{ color: '#FF6F61' }} />
                              : projOver
                                ? <Clock className="w-3.5 h-3.5" style={{ color: '#FFC23C' }} />
                                : <Check className="w-3.5 h-3.5" style={{ color: '#1FBE8D' }} />}
                          </div>
                          <p className="text-[11px] font-semibold leading-snug" style={{ color: 'var(--ink)' }}>{title}</p>
                        </div>
                        <p className="text-[10px] font-semibold pl-9" style={{ color: bad ? (numExcedidas > 0 ? '#FF6F61' : '#FFC23C') : 'var(--ink-3)' }}>
                          {subtitle}
                        </p>
                      </div>
                    )
                  })()}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Construcción de patrimonio: F1 tasa de ahorro + F2 fondo de emergencia ── */}
        {showPatrimonio && (
          <PatrimonioCards
            ratePoints={trimmedRatePoints}
            currentRate={surplusPct}
            currentSaved={surplus}
            avg6={rateAvg6}
            avg12={rateAvg12}
            totalSavings={totalSavings}
            savingsCount={savingsBalances.length}
            avgMonthlyExpense={avgMonthlyExpense}
            monthsCovered={monthsCovered}
            monthLabel={monthName(month)}
            prevMonthLabel={prevMonthName}
            projectedRate={projectedRate}
            dayOfMonth={now.getDate()}
            isCurrentMonth={isCurrentMonth}
            commitMonths={commitMonths}
            commitNext={commitNext}
            commitRatio={commitRatio}
            cuotasPendingTotal={cuotasPendingTotal}
            fixedMonthlyTotal={fixedMonthlyTotal}
            cardNextTotal={cardNextTotal}
            freeMonthLabel={freeMonthLabel}
            netWorth={netWorth}
          />
        )}

        {/* Trigger AI analysis in background when there are expenses */}
        {totalSelected > 0 && !isAnual && <AnalyzeTrigger month={month} year={year} />}

        {/* ── Oportunidades de mejora — header dentro de la card, como las demás ── */}
        {finalOportunidades.length > 0 && (
          <div className="card p-4 lg:p-5 mb-5">
            <div className="flex items-center gap-2 mb-3">
              <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Oportunidades de mejora</p>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                {finalOportunidades.length} sugerencia{finalOportunidades.length > 1 ? 's' : ''}
              </span>
              {hasAiInsights && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
                  style={{ background: 'rgba(139,92,246,0.12)', color: '#7c3aed' }}>
                  <Sparkles className="w-2.5 h-2.5" /> IA
                </span>
              )}
            </div>
            <div className="grid gap-2 lg:grid-cols-3 lg:items-stretch">
              {finalOportunidades.map((op, i) => (
                <div key={i} className="rounded-2xl px-3 py-3 flex flex-col gap-2.5" style={{ background: 'var(--surface-2)' }}>
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: op.iconBg }}>
                      <op.icon className="w-4 h-4" style={{ color: op.iconColor }} />
                    </div>
                    <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{op.title}</p>
                  </div>
                  <p className="text-xs leading-relaxed flex-1" style={{ color: 'var(--ink-2)' }}>{op.body}</p>
                  <Link href={op.href} className="text-xs font-semibold flex items-center gap-1" style={{ color: 'var(--primary)' }}>
                    {op.cta} <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Bottom 2-col: Tendencia + Categorías ────────────────────────────── */}
        {totalSelected > 0 ? (
          <>
          {/* Resumen narrativo del mes — para leer de un vistazo antes de los gráficos */}
          {insight && (
            <div className="card p-4 mb-5 flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(255,194,60,0.15)' }}>
                <Zap className="w-4 h-4" style={{ color: 'var(--gold)' }} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Tu mes en una frase</p>
                <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--ink-2)' }}>{insight}</p>
              </div>
            </div>
          )}

          <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start space-y-5 lg:space-y-0">

            {/* Tendencia 6 meses */}
            <div className="card p-4 lg:self-start">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Tendencia 6 meses</p>
                {monthData.length >= 2 && (
                  <span className="text-xs capitalize" style={{ color: 'var(--ink-3)' }}>
                    {monthData[0].label} – {monthData[monthData.length - 1].label}
                  </span>
                )}
              </div>
              {(() => {
                const nonZero   = monthData.filter(m => m.total > 0)
                const avg       = nonZero.length > 0 ? Math.round(nonZero.reduce((s, m) => s + m.total, 0) / nonZero.length) : 0
                const BAR_H     = 160  // px — height of bar area
                const avgPx     = avg > 0 ? Math.round((avg / maxMonth) * BAR_H) : 0
                const avgLabel  = formatCLP(avg)
                return (
                  <>
                    {/* Promedio label */}
                    <div className="flex items-center gap-1.5 mb-3">
                      <span className="inline-block w-5 border-t-2 border-dashed flex-shrink-0" style={{ borderColor: '#4D93FF' }} />
                      <p className="text-[10px] font-semibold" style={{ color: 'var(--ink-3)' }}>
                        Promedio {avgLabel}/mes
                      </p>
                    </div>
                    {/* Max label */}
                    {maxMonth > 1 && (
                      <p className="text-[9px] font-medium tabular-nums mb-1" style={{ color: 'var(--ink-3)' }}>
                        {formatCLP(maxMonth)}
                      </p>
                    )}
                    {/* Chart */}
                    <div className="relative" style={{ height: BAR_H + 24 }}>
                      {/* Dashed avg line */}
                      {avgPx > 0 && (
                        <div
                          className="absolute left-0 right-0 border-t-2 border-dashed pointer-events-none"
                          style={{ bottom: 24 + avgPx - 1, borderColor: 'rgba(77,147,255,0.5)' }}
                        />
                      )}
                      {/* Bars */}
                      <div className="absolute inset-x-0 bottom-0 flex items-end gap-1.5" style={{ height: BAR_H + 24 }}>
                        {monthData.map((m) => {
                          const isSelected = m.key === selectedKey
                          const isCurrent  = m.key === currentKey
                          const barPx      = m.total > 0 ? Math.max(6, Math.round((m.total / maxMonth) * BAR_H)) : 3
                          const barClass   = isSelected ? '' : isCurrent ? 'bar-current' : 'bar-inactive'
                          const [mYear, mMonth] = m.key.split('-').map(Number)
                          return (
                            <Link key={m.key} href={`/analisis?month=${mMonth}&year=${mYear}`}
                              className="flex-1 flex flex-col items-center gap-0.5 group h-full justify-end">
                              <span className="text-[9px] tabular-nums leading-none font-semibold mb-0.5 whitespace-nowrap"
                                style={{ color: isSelected ? 'var(--primary)' : 'var(--ink-3)' }}>
                                {m.total > 0 ? formatCLP(m.total) : ''}
                              </span>
                              <div
                                className={`w-full rounded-t-xl transition-all group-active:opacity-70 ${isSelected ? 'shadow-[0_4px_14px_rgba(77,147,255,0.4)]' : ''} ${barClass}`}
                                style={{
                                  height: barPx,
                                  ...(isSelected ? { backgroundColor: 'var(--primary)' } : {}),
                                  opacity: m.total === 0 ? 0.25 : 1,
                                }}
                              />
                              <span className="text-[10px] capitalize leading-none font-semibold mt-1"
                                style={{ color: isSelected ? 'var(--primary)' : isCurrent ? '#4D8FFF' : 'var(--ink-3)' }}>
                                {m.label}
                              </span>
                            </Link>
                          )
                        })}
                      </div>
                    </div>
                  </>
                )
              })()}
            </div>

            {/* Categorías vs. presupuesto — header dentro de la card, como las demás */}
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-4 pt-4 pb-3">
                <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Categorías vs. presupuesto</p>
                <div className="flex items-center gap-3 text-[10px] font-semibold" style={{ color: 'var(--ink-3)' }}>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: '#1FBE8D' }} />OK</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: '#FFC23C' }} />Cerca</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: '#FF6F61' }} />Excedido</span>
                </div>
              </div>
              <div>
                {catSummary.map((c, idx) => {
                  const limit        = catBudgetMap.get(c.id) ?? null
                  const over         = limit ? c.total > limit : false
                  const budgetPct    = limit ? Math.min(100, Math.round((c.total / limit) * 100)) : null
                  const barWidth     = limit ? budgetPct! : Math.round((c.total / (catSummary[0]?.total ?? 1)) * 100)
                  const recurringAmt  = recurringByCat[c.id] ?? 0
                  const isAllRecurring = recurringAmt > 0 && recurringAmt >= c.total
                  const barColor = (over && isAllRecurring) ? c.color
                    : over ? '#FF6F61'
                    : budgetPct !== null && budgetPct >= 80 ? '#FFC23C'
                    : c.color
                  const CatIcon = isEmoji(c.icon) ? null : getCategoryIcon(c.icon)
                  return (
                    <Link
                      key={c.id}
                      href={`/analisis/${c.id}?month=${month}&year=${year}`}
                      className="flex flex-col px-4 py-3 transition-colors hover:bg-black/5 active:bg-black/10"
                      style={{ borderTop: '1px solid var(--border)' }}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className="cat-icon-bg w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ '--cat-bg': c.bg_color, '--cat-color': c.color } as React.CSSProperties}>
                          {isEmoji(c.icon)
                            ? <span className="text-sm leading-none">{c.icon}</span>
                            : CatIcon ? <CatIcon className="w-4 h-4" style={{ color: c.color }} /> : null}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-sm font-semibold leading-tight" style={{ color: 'var(--ink)' }}>{c.name}</p>
                            {budgetPct !== null && (
                              <span className="text-[10px] font-bold" style={{ color: barColor }}>{budgetPct}%</span>
                            )}
                            {!limit && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}>
                                Sin presupuesto · definir
                              </span>
                            )}
                          </div>
                          {over && !isAllRecurring && (
                            <p className="text-[10px] font-semibold" style={{ color: '#FF6F61' }}>
                              +{formatCLP(c.total - limit!)} sobre el límite
                            </p>
                          )}
                          {limit && !over && (
                            <p className="text-[10px]" style={{ color: 'var(--ink-3)' }}>quedan {formatCLP(limit - c.total)}</p>
                          )}
                          {!limit && (
                            <p className="text-[10px]" style={{ color: 'var(--ink-3)' }}>
                              {totalSelected > 0 ? `${pct(c.total, totalSelected)}% del total` : ''}
                            </p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(c.total)}</p>
                          {limit && <p className="text-[10px] tabular-nums" style={{ color: 'var(--ink-3)' }}>de {formatCLP(limit)}</p>}
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${barWidth}%`, background: barColor }} />
                      </div>
                    </Link>
                  )
                })}
                {/* Acceso directo a definir límites cuando faltan */}
                {catSummary.some(c => !catBudgetMap.get(c.id)) && (
                  <Link href="/presupuesto"
                    className="flex items-center justify-center gap-1.5 px-4 py-3 text-xs font-bold transition-colors hover:bg-black/5"
                    style={{ color: 'var(--primary)', borderTop: '1px solid var(--border)' }}>
                    Definir límites por categoría <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                )}
              </div>
            </div>

          </div>

          {/* ── Comportamiento: medios de pago + día de la semana ─────────────── */}
          <div className="mt-5 lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start space-y-5 lg:space-y-0">

            {/* Medios de pago */}
            <div className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Con qué pagaste</p>
                <Link href="/metodos" className="text-sm font-semibold hover:opacity-70 transition-opacity" style={{ color: 'var(--primary)' }}>
                  Ver
                </Link>
              </div>
              <div className="space-y-2">
                {pmSummary.slice(0, 5).map(pm => {
                  const share = pct(pm.total, totalSelected)
                  const isCredit = pm.cardType === 'credit' && pm.id
                  const row = (
                    <div className="flex items-center gap-3 rounded-2xl px-3 py-3" style={{ background: 'var(--surface-2)' }}>
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ background: 'var(--surface)' }}>
                        {pm.domain
                          ? <ServiceLogo domain={pm.domain} name={pm.name} size={28} />
                          : <CreditCard className="w-4 h-4" style={{ color: 'var(--ink-3)' }} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold leading-tight truncate" style={{ color: 'var(--ink)' }}>{pm.name}</p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>
                          {share}% del mes · {pm.count} gasto{pm.count !== 1 ? 's' : ''}
                          {isCredit ? ' · crédito' : ''}
                        </p>
                      </div>
                      <p className="text-base font-extrabold tabular-nums flex-shrink-0" style={{ color: 'var(--ink)' }}>
                        {formatCLP(pm.total)}
                      </p>
                      {isCredit && <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ink-3)' }} />}
                    </div>
                  )
                  return isCredit
                    ? <Link key={pm.id} href={`/cuenta/${pm.id}`} className="block transition-opacity hover:opacity-80">{row}</Link>
                    : <div key={pm.id ?? 'efectivo'}>{row}</div>
                })}
              </div>
              {/* Cuánto del mes pasó por crédito — clave si pagas casi todo con tarjeta */}
              {(() => {
                const creditTotal = pmSummary.filter(p => p.cardType === 'credit').reduce((s, p) => s + p.total, 0)
                if (creditTotal === 0) return null
                const creditPct = pct(creditTotal, totalSelected)
                return (
                  <p className="text-[11px] mt-3 px-1" style={{ color: 'var(--ink-3)' }}>
                    El <span className="font-bold" style={{ color: 'var(--ink-2)' }}>{creditPct}%</span> de tus gastos fue con crédito:
                    revisa "Ya comprometido" para ver cuándo lo pagarás.
                  </p>
                )
              })()}
            </div>

            {/* Día de la semana */}
            <div className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Cuándo gastas</p>
                <span className="text-xs" style={{ color: 'var(--ink-3)' }}>{monthName(month)}</span>
              </div>
              <div className="flex items-end gap-2" style={{ height: 110 }}>
                {byWeekday.map((d, i) => {
                  const h = d.total > 0 ? Math.max(Math.round((d.total / maxWeekday) * 74), 6) : 2
                  const isPeak = i === peakDowIdx && d.total > 0
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1">
                      <p className="text-[9px] font-bold tabular-nums whitespace-nowrap" style={{ color: isPeak ? 'var(--primary)' : 'var(--ink-3)' }}>
                        {d.total > 0 ? formatCLP(d.total) : ''}
                      </p>
                      <div className="w-full rounded-t-lg"
                        style={{ height: h, background: isPeak ? 'var(--primary)' : d.total > 0 ? 'rgba(77,147,255,0.30)' : 'var(--border)' }} />
                      <p className="text-[10px] font-semibold" style={{ color: isPeak ? 'var(--primary)' : 'var(--ink-3)' }}>
                        {weekdayLabels[i]}
                      </p>
                    </div>
                  )
                })}
              </div>
              {byWeekday[peakDowIdx].total > 0 && (
                <p className="text-[11px] mt-3 px-1" style={{ color: 'var(--ink-3)' }}>
                  Tu día fuerte es el <span className="font-bold" style={{ color: 'var(--ink-2)' }}>{weekdayLabels[peakDowIdx]}</span>
                  {' '}({formatCLP(byWeekday[peakDowIdx].total)} en {byWeekday[peakDowIdx].count} gasto{byWeekday[peakDowIdx].count !== 1 ? 's' : ''}).
                  {weekendPct >= 30 && <> El fin de semana se lleva el {weekendPct}% del mes.</>}
                </p>
              )}
            </div>

          </div>
          </>
        ) : (
          /* Empty state */
          <div className="card text-center py-14 flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-3xl flex items-center justify-center" style={{ background: 'var(--primary-soft)' }}>
              <BarChart2 className="w-7 h-7" style={{ color: 'var(--primary)' }} />
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Sin gastos en {monthName(month)}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--ink-3)' }}>Registra gastos para ver tu análisis</p>
            </div>
            <Link href="/inicio"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-opacity hover:opacity-85"
              style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 8px 18px var(--shadow)' }}>
              Registrar un gasto <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}
          </>
        )
      })()}
    </div>
  )
}
