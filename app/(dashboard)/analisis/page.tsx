import { createClient } from '@/lib/supabase/server'
import { formatCLP, monthName, pct } from '@/lib/utils'
import { getExpenseIcon } from '@/lib/expense-icons'
import MonthNav from '@/components/MonthNav'
import Link from 'next/link'
import type { ExpenseWithRelations, CategoryBudget } from '@/types'
import { TrendingUp, TrendingDown, Minus, CreditCard, BarChart2, ChevronRight } from 'lucide-react'

export const revalidate = 0

export default async function AnalisisPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>
}) {
  const { month: monthStr, year: yearStr } = await searchParams
  const now   = new Date()
  const month = monthStr ? parseInt(monthStr) : now.getMonth() + 1
  const year  = yearStr  ? parseInt(yearStr)  : now.getFullYear()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // El gráfico siempre muestra los últimos 6 meses hasta HOY
  const chartAnchor = new Date(now.getFullYear(), now.getMonth(), 1)
  const sixAgo      = new Date(chartAnchor); sixAgo.setMonth(sixAgo.getMonth() - 5)
  const chartStart  = `${sixAgo.getFullYear()}-${String(sixAgo.getMonth() + 1).padStart(2, '0')}-01`

  // El mes seleccionado puede estar fuera de la ventana del gráfico (mes anterior)
  const selectedKey = `${year}-${String(month).padStart(2, '0')}`
  const currentKey  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  // Fetch: desde 6 meses atrás hasta el fin del mes seleccionado (o actual si es mayor)
  const selEnd   = new Date(year, month, 1)   // primer día del mes siguiente al seleccionado
  const curEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const fetchEnd = selEnd > curEnd ? selEnd : curEnd
  const nextYear  = fetchEnd.getFullYear()
  const nextMonth = fetchEnd.getMonth() + 1
  const endDate   = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`

  // También necesitamos el inicio del mes seleccionado si está antes de chartStart
  const fetchStart = selectedKey < chartStart.substring(0, 7) ? `${year}-${String(month).padStart(2, '0')}-01` : chartStart

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

  // ── Gráfico: siempre los últimos 6 meses hasta hoy ────────────────────────
  const byMonth: Record<string, { label: string; total: number; key: string }> = {}
  for (let i = 5; i >= 0; i--) {
    const d = new Date(chartAnchor); d.setMonth(d.getMonth() - i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    byMonth[key] = { key, label: d.toLocaleString('es-CL', { month: 'short' }), total: 0 }
  }
  typedExpenses.forEach(e => {
    const key = e.date.substring(0, 7)
    if (byMonth[key]) byMonth[key].total += e.amount
  })
  const monthData = Object.values(byMonth)
  const maxMonth  = Math.max(...monthData.map(m => m.total), 1)

  // ── Selected month data ───────────────────────────────────────────────────
  const selectedExpenses = typedExpenses.filter(e => e.date.startsWith(selectedKey))
  const totalSelected    = selectedExpenses.reduce((s, e) => s + e.amount, 0)

  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear()
  const daysElapsed    = isCurrentMonth ? now.getDate() : new Date(year, month, 0).getDate()
  const dailyAvg       = daysElapsed > 0 && totalSelected > 0 ? Math.round(totalSelected / daysElapsed) : 0

  // vs previous month
  const prevMonthData = monthData[monthData.length - 2] // index 4 of 6
  const prevTotal     = prevMonthData?.total ?? 0
  const delta         = prevTotal > 0 ? Math.round(((totalSelected - prevTotal) / prevTotal) * 100) : null

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

  return (
    <div className="px-4 pt-6 pb-8 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-brand-900">Análisis</h1>
        <MonthNav month={month} year={year} basePath="/analisis" />
      </div>

      {/* ── KPIs ──────────────────────────────────────────────────────────── */}
      {totalSelected > 0 && (
        <div className="grid grid-cols-3 gap-2.5">
          {/* Total */}
          <div className="card px-3 py-3 flex flex-col gap-1">
            <p className="text-[11px] font-medium text-gray-400">Total</p>
            <p className="font-extrabold text-gray-900 tabular-nums leading-tight" style={{ fontSize: 'clamp(13px, 4vw, 16px)' }}>{formatCLP(totalSelected)}</p>
          </div>

          {/* Promedio/día */}
          <div className="card px-3 py-3 flex flex-col gap-1">
            <p className="text-[11px] font-medium text-gray-400">Por día</p>
            <p className="text-base font-extrabold text-gray-900 tabular-nums leading-tight">{formatCLP(dailyAvg)}</p>
          </div>

          {/* vs mes anterior */}
          <div className="card px-3 py-3 flex flex-col gap-1">
            <p className="text-[11px] font-medium text-gray-400">vs anterior</p>
            {delta === null ? (
              <div className="flex items-center gap-1">
                <Minus className="w-3.5 h-3.5 text-gray-300" />
                <p className="text-base font-extrabold text-gray-400">—</p>
              </div>
            ) : delta === 0 ? (
              <div className="flex items-center gap-1">
                <Minus className="w-3.5 h-3.5 text-gray-400" />
                <p className="text-base font-extrabold text-gray-600">igual</p>
              </div>
            ) : delta > 0 ? (
              <div className="flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                <p className="text-base font-extrabold text-red-500 tabular-nums">+{delta}%</p>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <TrendingDown className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                <p className="text-base font-extrabold text-emerald-600 tabular-nums">{delta}%</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tendencia 6 meses ─────────────────────────────────────────────── */}
      <div className="card p-4">
        <p className="text-sm font-bold text-gray-600 mb-4">Tendencia 6 meses</p>
        <div className="flex items-end gap-2 h-32">
          {monthData.map((m) => {
            const isSelected  = m.key === selectedKey
            const isCurrent   = m.key === currentKey
            const h = m.total > 0 ? Math.max(8, Math.round((m.total / maxMonth) * 100)) : 3
            // 3-state color: selected → azul fuerte | mes actual no selec → azul medio | resto → azul claro
            const barColor  = isSelected ? '#1B6DD4' : isCurrent ? '#75A8FF' : '#D5E6FF'
            const textColor = isSelected ? '#1B6DD4' : isCurrent ? '#4D8FFF' : '#9CA3AF'
            const [mYear, mMonth] = m.key.split('-').map(Number)
            const href = `/analisis?month=${mMonth}&year=${mYear}`
            return (
              <Link
                key={m.key}
                href={href}
                className="flex-1 flex flex-col items-center gap-1 group"
              >
                {/* Amount label */}
                <span className={`text-[9px] tabular-nums leading-none font-semibold transition-colors ${isSelected ? 'text-brand-700' : 'text-gray-400'}`}>
                  {m.total > 0 ? (m.total >= 1000000 ? `${(m.total/1000000).toFixed(1)}M` : `${Math.round(m.total/1000)}k`) : ''}
                </span>
                {/* Bar */}
                <div className="w-full flex-1 flex items-end">
                  <div
                    className={`w-full rounded-t-lg transition-all group-active:opacity-70 ${isSelected ? 'shadow-[0_4px_12px_rgba(27,109,212,0.35)]' : ''}`}
                    style={{
                      height: `${h}px`,
                      backgroundColor: barColor,
                      opacity: m.total === 0 ? 0.3 : 1,
                    }}
                  />
                </div>
                {/* Label */}
                <span
                  className="text-[10px] capitalize leading-none font-semibold transition-colors"
                  style={{ color: textColor }}
                >
                  {m.label}
                  {isCurrent && !isSelected && <span className="block w-1 h-1 rounded-full mx-auto mt-0.5" style={{ backgroundColor: '#75A8FF' }} />}
                </span>
              </Link>
            )
          })}
        </div>
      </div>

      {totalSelected === 0 ? (
        <div className="card text-center py-14 flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-3xl bg-brand-50 flex items-center justify-center">
            <BarChart2 className="w-7 h-7 text-brand-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-600">Sin gastos en {monthName(month)}</p>
            <p className="text-xs text-gray-400 mt-1">Registra gastos para ver tu análisis</p>
          </div>
        </div>
      ) : (
        <>
          {/* ── Mayor gasto del mes ─────────────────────────────────────────── */}
          {topExpense && (
            <div>
              <h2 className="text-sm font-bold text-gray-600 mb-2.5">Mayor gasto</h2>
              <div className="card px-4 py-3.5">
                {(() => {
                  const { icon: Icon, color, bg } = getExpenseIcon(
                    topExpense.description ?? null,
                    topExpense.category?.name ?? null
                  )
                  return (
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: bg }}>
                        <Icon className="w-5 h-5" style={{ color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">
                          {topExpense.description ?? topExpense.category?.name ?? 'Gasto'}
                        </p>
                        <p className="text-xs text-gray-400">
                          {topExpense.category?.name ?? '–'} · {new Date(topExpense.date + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-gray-900 tabular-nums">{formatCLP(topExpense.amount)}</p>
                        <p className="text-[10px] text-gray-400">{pct(topExpense.amount, totalSelected)}% del total</p>
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>
          )}

          {/* ── Distribución por categoría ──────────────────────────────────── */}
          <div>
            <h2 className="text-sm font-bold text-gray-600 mb-2.5">
              Por categoría · {monthName(month)}
            </h2>
            <div className="card divide-y divide-gray-50 overflow-hidden">
              {catSummary.map((c, idx) => {
                const limit      = catBudgetMap.get(c.id) ?? null
                const over       = limit ? c.total > limit : false
                const budgetPct  = limit ? Math.min(100, Math.round((c.total / limit) * 100)) : null
                const barColor   = over ? '#EF4444' : budgetPct !== null && budgetPct >= 80 ? '#F59E0B' : c.color
                const barWidth   = limit ? budgetPct! : pct(c.total, totalSelected)
                const sharePct   = pct(c.total, totalSelected)
                const { icon: Icon, color: iconColor, bg: iconBg } = getExpenseIcon(null, c.name)
                return (
                  <Link
                    key={c.id}
                    href={`/analisis/${c.id}?month=${month}&year=${year}`}
                    className="block px-4 py-3.5 hover:bg-gray-50/60 transition-colors active:bg-brand-50"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-[10px] font-bold text-gray-300 w-3 flex-shrink-0 text-center">{idx + 1}</span>
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: iconBg }}>
                        <Icon className="w-4 h-4" style={{ color: iconColor }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 leading-tight">{c.name}</p>
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
                    <div className="h-1.5 rounded-full overflow-hidden ml-7" style={{ backgroundColor: `${barColor}20` }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${barWidth}%`, backgroundColor: barColor }} />
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>

          {/* ── Cómo pagaste ─────────────────────────────────────────────────── */}
          {pmSummary.length > 0 && (
            <div>
              <h2 className="text-sm font-bold text-gray-600 mb-2.5">Cómo pagaste</h2>
              <div className="card divide-y divide-gray-50 overflow-hidden">
                {pmSummary.map(pm => {
                  const pmPct = pct(pm.total, totalSelected)
                  return (
                    <div key={pm.name} className="px-4 py-3">
                      <div className="flex items-center gap-3 mb-1.5">
                        <div className="w-7 h-7 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
                          <CreditCard className="w-3.5 h-3.5 text-brand-500" />
                        </div>
                        <p className="flex-1 text-sm font-semibold text-gray-800">{pm.name}</p>
                        <p className="text-sm font-bold text-gray-900 tabular-nums">{formatCLP(pm.total)}</p>
                        <p className="text-xs text-gray-400 w-8 text-right tabular-nums">{pmPct}%</p>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden bg-brand-50 ml-10">
                        <div
                          className="h-full rounded-full bg-brand-400 transition-all"
                          style={{ width: `${pmPct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

    </div>
  )
}
