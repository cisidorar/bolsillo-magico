import { createClient, getServerSession } from '@/lib/supabase/server'
import { formatCLP, monthName, isEmoji } from '@/lib/utils'
import { getCategoryIcon } from '@/lib/category-icons'
import CatExpenseList from '@/components/CatExpenseList'
import MonthNav from '@/components/MonthNav'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { ExpenseWithRelations } from '@/types'

export const revalidate = 0

export default async function CategoriaDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ catId: string }>
  searchParams: Promise<{ month?: string; year?: string; view?: string }>
}) {
  const { catId } = await params
  const { month: monthStr, year: yearStr, view } = await searchParams

  const now   = new Date()
  const month = monthStr ? parseInt(monthStr) : now.getMonth() + 1
  const year  = yearStr  ? parseInt(yearStr)  : now.getFullYear()

  const [user, supabase] = await Promise.all([getServerSession(), createClient()])

  const monthKey  = String(month).padStart(2, '0')
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear  = month === 12 ? year + 1 : year

  // Últimos 7 meses (6 para el gráfico + 1 anterior para el delta)
  const chartAnchor = new Date(now.getFullYear(), now.getMonth(), 1)
  const sevenAgo    = new Date(chartAnchor); sevenAgo.setMonth(sevenAgo.getMonth() - 6)
  const chartStart  = `${sevenAgo.getFullYear()}-${String(sevenAgo.getMonth() + 1).padStart(2, '0')}-01`

  // Si el mes seleccionado es anterior al chartStart, expandir el fetch
  const selectedStart = `${year}-${monthKey}-01`
  const fetchStart    = selectedStart < chartStart ? selectedStart : chartStart

  const [{ data: category }, { data: expenses }, { data: trendExpenses }] = await Promise.all([
    supabase.from('categories').select('*').eq('id', catId).eq('user_id', user!.id).maybeSingle(),
    supabase
      .from('expenses')
      .select('*, category:categories(*), payment_method:payment_methods(*)')
      .eq('user_id', user!.id)
      .eq('category_id', catId)
      .gte('date', `${year}-${monthKey}-01`)
      .lt('date', `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false }),
    // Expenses para el gráfico de tendencia (7 meses atrás)
    supabase
      .from('expenses')
      .select('amount, date')
      .eq('user_id', user!.id)
      .eq('category_id', catId)
      .gte('date', fetchStart)
      .lt('date', `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`),
  ])

  if (!category) notFound()

  const typedExpenses = (expenses ?? []) as ExpenseWithRelations[]
  const total = typedExpenses.reduce((s, e) => s + e.amount, 0)

  // ── Gráfico de tendencia (últimos 6 meses hasta hoy) ───────────────────────
  const byMonth: Record<string, { label: string; total: number; key: string }> = {}
  for (let i = 5; i >= 0; i--) {
    const d = new Date(chartAnchor); d.setMonth(d.getMonth() - i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    byMonth[key] = { key, label: d.toLocaleString('es-CL', { month: 'short' }), total: 0 }
  }
  ;(trendExpenses ?? []).forEach(e => {
    const key = e.date.substring(0, 7)
    if (byMonth[key]) byMonth[key].total += e.amount
  })
  const monthData  = Object.values(byMonth)
  const maxMonth   = Math.max(...monthData.map(m => m.total), 1)
  const selectedKey = `${year}-${monthKey}`
  const currentKey  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  // Delta vs mes anterior
  const prevMonthNum  = month === 1 ? 12 : month - 1
  const prevMonthYear = month === 1 ? year - 1 : year
  const prevKey       = `${prevMonthYear}-${String(prevMonthNum).padStart(2, '0')}`
  const prevTotal     = (trendExpenses ?? [])
    .filter(e => e.date.startsWith(prevKey))
    .reduce((s, e) => s + e.amount, 0)
  const delta         = prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null

  // Promedio últimos 6 meses (excluye el mes actual si está incompleto)
  const completedMonths = monthData.filter(m => m.key !== currentKey && m.total > 0)
  const avgMonthly = completedMonths.length > 0
    ? Math.round(completedMonths.reduce((s, m) => s + m.total, 0) / completedMonths.length)
    : 0

  // Agrupar gastos por día
  const byDay: Record<string, ExpenseWithRelations[]> = {}
  for (const e of typedExpenses) {
    if (!byDay[e.date]) byDay[e.date] = []
    byDay[e.date].push(e)
  }
  const groups = Object.entries(byDay)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, exps]) => ({
      date,
      label: new Date(date + 'T12:00:00').toLocaleDateString('es-CL', {
        weekday: 'long', day: 'numeric', month: 'long',
      }),
      dayTotal: exps.reduce((s, e) => s + e.amount, 0),
      expenses: exps,
    }))

  const backHref = `/analisis?month=${month}&year=${year}${view === 'billing' ? '&view=billing' : ''}`
  const viewParam = view === 'billing' ? '&view=billing' : ''

  const CatIcon = isEmoji(category.icon) ? null : getCategoryIcon(category.icon)

  return (
    <div className="pb-8">
      {/* ── Header hero ─────────────────────────────────────────────────── */}
      <div className="hero-gradient px-4 lg:px-8 pt-5 pb-5">
        <div className="flex items-center gap-3 mb-4">
          <Link
            href={backHref}
            className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 active:bg-white/30 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-white" />
          </Link>

          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-white/20">
              {isEmoji(category.icon)
                ? <span className="text-lg">{category.icon}</span>
                : CatIcon && <CatIcon className="w-5 h-5 text-white" />
              }
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-extrabold text-white leading-tight truncate">{category.name}</h1>
              <p className="text-xs text-white/60 font-medium">{monthName(month)} {year}</p>
            </div>
          </div>

          <MonthNav
            month={month}
            year={year}
            basePath={`/analisis/${catId}`}
            extraParams={view === 'billing' ? { view: 'billing' } : {}}
          />
        </div>

        {/* ── KPI strip ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-2">
          {/* Total del mes */}
          <div className="bg-white/15 rounded-2xl px-3 py-2.5">
            <p className="text-[10px] text-white/60 font-semibold mb-0.5">Este mes</p>
            <p className="text-sm font-extrabold text-white tabular-nums leading-tight">{formatCLP(total)}</p>
            <p className="text-[10px] text-white/40">{typedExpenses.length} gasto{typedExpenses.length !== 1 ? 's' : ''}</p>
          </div>

          {/* vs mes anterior */}
          <div className="bg-white/15 rounded-2xl px-3 py-2.5">
            <p className="text-[10px] text-white/60 font-semibold mb-0.5">vs anterior</p>
            {delta === null ? (
              <p className="text-sm font-extrabold text-white/50">—</p>
            ) : (
              <div className="flex items-center gap-1">
                {delta === 0
                  ? <Minus className="w-3 h-3 text-white/70" />
                  : delta > 0
                    ? <TrendingUp className="w-3 h-3 text-red-300" />
                    : <TrendingDown className="w-3 h-3 text-emerald-300" />
                }
                <p className={`text-sm font-extrabold tabular-nums leading-tight ${delta > 0 ? 'text-red-300' : delta < 0 ? 'text-emerald-300' : 'text-white'}`}>
                  {delta > 0 ? '+' : ''}{delta}%
                </p>
              </div>
            )}
            <p className="text-[10px] text-white/40">{prevTotal > 0 ? formatCLP(prevTotal) : 'sin datos'}</p>
          </div>

          {/* Promedio mensual */}
          <div className="bg-white/15 rounded-2xl px-3 py-2.5">
            <p className="text-[10px] text-white/60 font-semibold mb-0.5">Promedio</p>
            <p className="text-sm font-extrabold text-white tabular-nums leading-tight">
              {avgMonthly > 0 ? formatCLP(avgMonthly) : '—'}
            </p>
            <p className="text-[10px] text-white/40">últimos meses</p>
          </div>
        </div>
      </div>

      {/* ── Contenido principal ─────────────────────────────────────────── */}
      <div className="px-4 lg:px-8 pt-4 lg:grid lg:grid-cols-[1fr_320px] lg:gap-6 lg:items-start">

        {/* Lista de gastos */}
        <div>
          {groups.length === 0 ? (
            <div className="card text-center py-14">
              <p className="text-sm font-bold text-gray-500">Sin gastos en {monthName(month)}</p>
              <p className="text-xs text-gray-400 mt-1">Navega a otro mes con las flechas del header</p>
            </div>
          ) : (
            <CatExpenseList groups={groups} categoryName={category.name} />
          )}
        </div>

        {/* Gráfico de tendencia — solo desktop (mobile está en el hero) */}
        <div className="hidden lg:block">
          <div className="card p-4">
            <p className="text-sm font-bold text-gray-700 mb-3">Tendencia 6 meses</p>

            {maxMonth > 1 && (
              <p className="text-[9px] text-gray-300 font-medium tabular-nums mb-1">
                {maxMonth >= 1000000 ? `${(maxMonth / 1000000).toFixed(1)}M` : `${Math.round(maxMonth / 1000)}k`}
              </p>
            )}

            <div className="flex items-end gap-2 h-36">
              {monthData.map(m => {
                const isSelected = m.key === selectedKey
                const isCurrent  = m.key === currentKey
                const h = m.total > 0 ? Math.max(6, Math.round((m.total / maxMonth) * 100)) : 3
                const [mYear, mMonth] = m.key.split('-').map(Number)
                const href = `/analisis/${catId}?month=${mMonth}&year=${mYear}${viewParam}`
                return (
                  <Link key={m.key} href={href} className="flex-1 flex flex-col items-center gap-1 group">
                    <span className={`text-[9px] tabular-nums leading-none font-semibold ${isSelected ? 'text-brand-700' : 'text-gray-400'}`}>
                      {m.total > 0 ? (m.total >= 1000000 ? `${(m.total / 1000000).toFixed(1)}M` : `${Math.round(m.total / 1000)}k`) : ''}
                    </span>
                    <div className="w-full flex-1 flex items-end">
                      <div
                        className={`w-full rounded-t-lg transition-all ${isSelected ? 'shadow-[0_4px_12px_rgba(27,109,212,0.35)]' : isCurrent ? 'bar-current' : 'bar-inactive'}`}
                        style={{
                          height: `${h}px`,
                          ...(isSelected ? { backgroundColor: '#1B6DD4' } : {}),
                          opacity: m.total === 0 ? 0.25 : 1,
                        }}
                      />
                    </div>
                    <span
                      className="text-[10px] capitalize leading-none font-semibold"
                      style={{ color: isSelected ? '#1B6DD4' : isCurrent ? '#4D8FFF' : '#9CA3AF' }}
                    >
                      {m.label}
                    </span>
                  </Link>
                )
              })}
            </div>

            {/* Promedio line */}
            {avgMonthly > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-50 flex items-center justify-between">
                <p className="text-[11px] text-gray-400">Promedio mensual</p>
                <p className="text-[11px] font-bold text-gray-700 tabular-nums">{formatCLP(avgMonthly)}</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
