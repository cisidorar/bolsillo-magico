import React from 'react'
import { createClient, getServerSession } from '@/lib/supabase/server'
import HistorialExpenses from '@/components/HistorialExpenses'
import MonthNav from '@/components/MonthNav'
import HistorialFilters from '@/components/HistorialFilters'
import { billingPeriod, billingPeriodRange, formatCLP, monthName, getNowChile } from '@/lib/utils'
import { SearchX, ClipboardList, ChevronLeft, ChevronRight, Wallet, TrendingUp, TrendingDown, Minus, CreditCard, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import type { ExpenseWithRelations } from '@/types'

export const revalidate = 0

const PAGE_SIZE = 50

function dateLabel(dateStr: string): string {
  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
  const yestStr = yesterday.toISOString().split('T')[0]
  if (dateStr === todayStr)  return 'Hoy'
  if (dateStr === yestStr)   return 'Ayer'
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'short' })
}

function buildHref(params: Record<string, string | number | undefined>) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '' && v !== null) p.set(k, String(v))
  }
  const qs = p.toString()
  return `/historial${qs ? `?${qs}` : ''}`
}

/** Mes anterior y siguiente para expandir el rango de fetch en vista facturación */
function prevMonth(m: number, y: number) {
  return m === 1 ? { m: 12, y: y - 1 } : { m: m - 1, y }
}
function nextMonthOf(m: number, y: number) {
  return m === 12 ? { m: 1, y: y + 1 } : { m: m + 1, y }
}

export default async function HistorialPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string; q?: string; cats?: string; page?: string; view?: string }>
}) {
  const { month: monthStr, year: yearStr, q, cats, page: pageStr, view } = await searchParams
  const { now, year: chileYear, month: chileMonth, dateStr: chileDate } = getNowChile()

  const isBilling = view === 'billing'
  const page  = pageStr  ? Math.max(1, parseInt(pageStr)) : 1
  const catIds = cats ? cats.split(',').filter(Boolean) : []

  const [user, supabase] = await Promise.all([getServerSession(), createClient()])

  // Cuando se carga billing sin mes explícito, determinar el período de estado ABIERTO.
  // Un período ya cerrado (billing_day < hoy) corresponde al mes siguiente.
  // Ejemplo: hoy=25 jun, billing_day=24 → billingPeriod('2026-06-25', 24) = julio → mostrar julio.
  let month: number
  let year: number
  if (isBilling && !monthStr) {
    // Primero buscar la tarjeta favorita (is_default=true), si no existe tomar la primera por sort_order
    const { data: cards } = await supabase
      .from('payment_methods')
      .select('billing_day, is_default')
      .eq('user_id', user!.id)
      .eq('card_type', 'credit')
      .not('billing_day', 'is', null)
      .order('is_default', { ascending: false })
      .order('sort_order',  { ascending: true })
      .limit(5)
    const defaultCard = cards?.find(c => c.is_default) ?? cards?.[0]
    if (defaultCard?.billing_day) {
      const bp = billingPeriod(chileDate, defaultCard.billing_day as number)
      month = bp.month
      year  = bp.year
    } else {
      month = chileMonth
      year  = chileYear
    }
  } else {
    month = monthStr ? parseInt(monthStr) : chileMonth
    year  = yearStr  ? parseInt(yearStr)  : chileYear
  }

  let expenses: ExpenseWithRelations[]
  let totalCount = 0
  let totalPages = 1
  let billingHitLimit = false

  if (isBilling) {
    const prev = prevMonth(month, year)
    const next = nextMonthOf(nextMonthOf(month, year).m, nextMonthOf(month, year).y)

    const startDate = `${prev.y}-${String(prev.m).padStart(2, '0')}-01`
    const endDate   = `${next.y}-${String(next.m).padStart(2, '0')}-01`

    let billingQuery = supabase
      .from('expenses')
      .select('*, category:categories(*), payment_method:payment_methods(*), recurring_expense:recurring_expenses(id,name,domain)')
      .eq('user_id', user!.id)
      .gte('date', startDate)
      .lt('date',  endDate)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(300)

    if (q)              billingQuery = billingQuery.ilike('description', `%${q}%`)
    if (catIds.length > 0) billingQuery = billingQuery.in('category_id', catIds)

    const { data } = await billingQuery
    const all = (data ?? []) as ExpenseWithRelations[]

    expenses = all.filter(e => {
      const pm = e.payment_method as { billing_day?: number | null } | null
      const bd = pm?.billing_day ?? null
      const bp = billingPeriod(e.date, bd)
      return bp.month === month && bp.year === year
    })

    totalCount = expenses.length
    totalPages = 1
    // Advertir solo si el raw fetch llegó al límite Y los gastos filtrados son muchos (probablemente incompletos)
    billingHitLimit = all.length === 300 && expenses.length >= 100
  } else {
    const nextM = month === 12 ? 1       : month + 1
    const nextY = month === 12 ? year + 1 : year
    const offset = (page - 1) * PAGE_SIZE

    let purchaseQuery = supabase
      .from('expenses')
      .select('*, category:categories(*), payment_method:payment_methods(*), recurring_expense:recurring_expenses(id,name,domain)', { count: 'exact' })
      .eq('user_id', user!.id)
      .gte('date', `${year}-${String(month).padStart(2, '0')}-01`)
      .lt('date',  `${nextY}-${String(nextM).padStart(2, '0')}-01`)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)

    if (q)              purchaseQuery = purchaseQuery.ilike('description', `%${q}%`)
    if (catIds.length > 0) purchaseQuery = purchaseQuery.in('category_id', catIds)

    const { data, count } = await purchaseQuery
    expenses   = (data ?? []) as ExpenseWithRelations[]
    totalCount = count ?? 0
    totalPages = Math.ceil(totalCount / PAGE_SIZE)
  }

  const [{ data: categories }] = await Promise.all([
    supabase.from('categories').select('*').eq('user_id', user!.id).order('sort_order'),
  ])

  const total = expenses.reduce((s, e) => s + e.amount, 0)
  const hasFilters = !!(q || catIds.length > 0)

  // ── vs mes anterior (solo modo compra) ────────────────────────────────────
  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear()
  const prevM2 = month === 1 ? 12 : month - 1
  const prevY2 = month === 1 ? year - 1 : year
  const prevNextM2 = prevM2 === 12 ? 1 : prevM2 + 1
  const prevNextY2 = prevM2 === 12 ? prevY2 + 1 : prevY2

  let prevMonthRaw: { amount: number; date: string }[] = []
  if (!isBilling) {
    let prevQ = supabase
      .from('expenses')
      .select('amount, date')
      .eq('user_id', user!.id)
      .gte('date', `${prevY2}-${String(prevM2).padStart(2, '0')}-01`)
      .lt('date',  `${prevNextY2}-${String(prevNextM2).padStart(2, '0')}-01`)
    if (catIds.length > 0) prevQ = prevQ.in('category_id', catIds)
    if (q) prevQ = prevQ.ilike('description', `%${q}%`)
    const { data: prevData } = await prevQ
    prevMonthRaw = (prevData ?? []) as { amount: number; date: string }[]
  }

  const prevFiltered = isCurrentMonth
    ? prevMonthRaw.filter(e => parseInt(e.date.split('-')[2]) <= now.getDate())
    : prevMonthRaw
  const prevTotal = prevFiltered.reduce((s, e) => s + e.amount, 0)
  const delta = !isBilling && prevTotal > 0
    ? Math.round(((total - prevTotal) / prevTotal) * 100)
    : null
  const absoluteDelta = total - prevTotal

  // En modo billing: derivar períodos reales por tarjeta a partir de los gastos ya filtrados
  type CardPeriod = { name: string; start: string; end: string; billingDay: number }
  const cardPeriods: CardPeriod[] = []
  if (isBilling) {
    const seen = new Set<number>()
    for (const e of expenses) {
      const pm = e.payment_method as { name?: string; billing_day?: number | null } | null
      const bd = pm?.billing_day ?? null
      if (bd && !seen.has(bd)) {
        seen.add(bd)
        const range = billingPeriodRange(month, year, bd)
        cardPeriods.push({ name: pm?.name ?? '', start: range.start, end: range.end, billingDay: bd })
      }
    }
    // Si no hay expenses pero estamos en billing mode, no mostramos nada
  }

  // ── Promedio diario ───────────────────────────────────────────────────────
  const daysInMonth = new Date(year, month, 0).getDate()
  const daysElapsed = isCurrentMonth ? now.getDate() : daysInMonth
  let daysForAvg = daysElapsed
  if (isBilling && cardPeriods.length > 0) {
    const p = cardPeriods[0]
    const s = new Date(p.start + 'T12:00:00')
    const e = new Date(p.end   + 'T12:00:00')
    daysForAvg = Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1
  }
  const dailyAvg = daysForAvg > 0 && total > 0 ? Math.round(total / daysForAvg) : 0

  // Group by date
  const grouped = expenses.reduce<Record<string, ExpenseWithRelations[]>>((acc, e) => {
    if (!acc[e.date]) acc[e.date] = []
    acc[e.date].push(e)
    return acc
  }, {})
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  const baseParams = { month, year, q, cats: catIds.join(',') || undefined, view: isBilling ? 'billing' : undefined }
  const prevHref = (!isBilling && page > 1) ? buildHref({ ...baseParams, page: page - 1 }) : null
  const nextHref = (!isBilling && page < totalPages) ? buildHref({ ...baseParams, page: page + 1 }) : null

  const summaryLabel = isBilling
    ? hasFilters
      ? `Facturación · ${monthName(month)} ${year} (filtrado)`
      : `Facturación · ${monthName(month)} ${year}`
    : hasFilters ? 'Filtrado' : `${monthName(month)} ${year}`

  return (
    <div className="px-4 lg:px-8 pt-2 lg:pt-8 pb-4">

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-brand-900">Historial</h1>
        <MonthNav
          month={month}
          year={year}
          basePath="/historial"
          extraParams={{
            ...(isBilling ? { view: 'billing' } : {}),
            ...(q        ? { q }                : {}),
            ...(catIds.length > 0 ? { cats: catIds.join(',') } : {}),
          }}
        />
      </div>

      {/* Stats cards */}
      {totalCount > 0 && (
        <>
          {/* Mobile: total prominente arriba, dos chips abajo */}
          <div className="lg:hidden mb-4 space-y-2">
            <div className="card p-4 flex items-center gap-3">
              <div className="cat-icon-bg w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ '--cat-bg': 'var(--primary-soft)', '--cat-color': 'var(--primary)' } as React.CSSProperties}>
                <Wallet className="w-5 h-5" style={{ color: 'var(--primary)' }} />
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium">{isBilling ? 'Total del período' : 'Total del mes'}</p>
                <p className="text-2xl font-extrabold text-gray-900 dark:text-gray-100 tabular-nums leading-tight">{formatCLP(total)}</p>
                <p className="text-xs text-gray-400">{totalCount} registros</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {/* vs anterior */}
              <div className="card p-3.5 flex items-center gap-2.5">
                <div className="cat-icon-bg w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    '--cat-bg':    delta === null ? '#F5F5F5' : delta > 0 ? '#FEF2F2' : '#F0FDF4',
                    '--cat-color': delta === null ? '#9CA3AF' : delta > 0 ? '#EF4444' : '#16A34A',
                  } as React.CSSProperties}>
                  {delta === null || delta === 0
                    ? <Minus className="w-4 h-4 text-gray-400" />
                    : delta > 0
                      ? <TrendingUp   className="w-4 h-4" style={{ color: '#EF4444' }} />
                      : <TrendingDown className="w-4 h-4" style={{ color: '#16A34A' }} />
                  }
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-gray-400 font-medium leading-tight">
                    vs anterior{isCurrentMonth && !isBilling ? ` · d${now.getDate()}` : ''}
                  </p>
                  {isBilling || delta === null ? (
                    <p className="text-base font-extrabold text-gray-400">—</p>
                  ) : (
                    <>
                      <p className={`text-base font-extrabold tabular-nums ${delta > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                        {delta > 0 ? '+' : ''}{delta}%
                      </p>
                      <p className={`text-[10px] tabular-nums ${absoluteDelta > 0 ? 'text-red-400' : 'text-emerald-500'}`}>
                        {absoluteDelta > 0 ? '+' : ''}{formatCLP(absoluteDelta)}
                      </p>
                    </>
                  )}
                </div>
              </div>
              {/* Promedio diario */}
              <div className="card p-3.5 flex items-center gap-2.5">
                <div className="cat-icon-bg w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ '--cat-bg': '#FFF8EC', '--cat-color': '#FFC23C' } as React.CSSProperties}>
                  <TrendingUp className="w-4 h-4" style={{ color: '#FFC23C' }} />
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 font-medium leading-tight">Promedio diario</p>
                  <p className="text-base font-extrabold text-gray-900 dark:text-gray-100 tabular-nums">{formatCLP(dailyAvg)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Desktop: 3 columnas */}
          <div className="hidden lg:grid grid-cols-3 gap-4 mb-5">
            {/* Total */}
            <div className="card p-5 flex items-center gap-4">
              <div className="cat-icon-bg w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ '--cat-bg': 'var(--primary-soft)', '--cat-color': '#4D93FF' } as React.CSSProperties}>
                <Wallet className="w-7 h-7" style={{ color: '#4D93FF' }} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-400 font-medium">{isBilling ? 'Total del período' : 'Total del mes'}</p>
                <p className="text-2xl font-extrabold text-gray-900 dark:text-gray-100 tabular-nums leading-tight">{formatCLP(total)}</p>
                <p className="text-xs text-gray-400 mt-0.5">{totalCount} registro{totalCount !== 1 ? 's' : ''}</p>
              </div>
            </div>
            {/* vs anterior */}
            <div className="card p-5 flex items-center gap-4">
              <div className="cat-icon-bg w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{
                  '--cat-bg':    delta === null ? '#F5F5F5' : delta > 0 ? '#FEF2F2' : '#F0FDF4',
                  '--cat-color': delta === null ? '#9CA3AF' : delta > 0 ? '#EF4444' : '#16A34A',
                } as React.CSSProperties}>
                {delta === null || delta === 0
                  ? <Minus className="w-7 h-7 text-gray-400" />
                  : delta > 0
                    ? <TrendingUp   className="w-7 h-7" style={{ color: '#EF4444' }} />
                    : <TrendingDown className="w-7 h-7" style={{ color: '#16A34A' }} />
                }
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-400 font-medium">vs mes anterior{isCurrentMonth && !isBilling ? ` · día ${now.getDate()}` : ''}</p>
                {isBilling || delta === null ? (
                  <p className="text-2xl font-extrabold text-gray-400 leading-tight">—</p>
                ) : (
                  <>
                    <p className={`text-2xl font-extrabold tabular-nums leading-tight ${delta > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                      {delta > 0 ? '+' : ''}{delta}%
                    </p>
                    <p className={`text-xs tabular-nums mt-0.5 ${absoluteDelta > 0 ? 'text-red-400' : 'text-emerald-500'}`}>
                      {absoluteDelta > 0 ? '+' : ''}{formatCLP(absoluteDelta)}
                    </p>
                  </>
                )}
              </div>
            </div>
            {/* Promedio */}
            <div className="card p-5 flex items-center gap-4">
              <div className="cat-icon-bg w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ '--cat-bg': '#FFF8EC', '--cat-color': '#FFC23C' } as React.CSSProperties}>
                <TrendingUp className="w-7 h-7" style={{ color: '#FFC23C' }} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-400 font-medium">Promedio diario</p>
                <p className="text-2xl font-extrabold text-gray-900 dark:text-gray-100 tabular-nums leading-tight">{formatCLP(dailyAvg)}</p>
                <p className="text-xs text-gray-400 mt-0.5">por día</p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Filters */}
      <div className="mb-4">
        <HistorialFilters categories={categories ?? []} month={month} year={year} />
      </div>

      {/* Banners */}
      {isBilling && (
        <div className="card mb-4 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-50">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 bg-indigo-50">
              <CreditCard className="w-3.5 h-3.5 text-indigo-500" />
            </div>
            <p className="text-sm font-bold text-gray-800">
              Estado de cuenta · {monthName(month)} {year}
            </p>
          </div>
          {cardPeriods.length > 0 ? (
            <div className="px-4 py-2.5 flex flex-wrap gap-x-6 gap-y-1.5">
              {cardPeriods.map(cp => {
                const fmt = (s: string) => {
                  const d = new Date(s + 'T12:00:00')
                  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
                }
                return (
                  <div key={cp.billingDay} className="flex items-center gap-2">
                    {cp.name && <span className="text-xs font-semibold text-gray-600">{cp.name}</span>}
                    <span className="text-xs text-gray-400 tabular-nums">{fmt(cp.start)} – {fmt(cp.end)}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-xs text-gray-400 px-4 py-2.5">
              Gastos cuyo estado de cuenta cierra en {monthName(month)} {year}.
            </p>
          )}
        </div>
      )}
      {isBilling && billingHitLimit && (
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-4">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 leading-relaxed">
            Se mostraron los primeros 300 gastos del período. Usa los filtros para acotar los resultados.
          </p>
        </div>
      )}

      {/* Expense list */}
      {expenses.length === 0 ? (
        <div className="card text-center py-16 flex flex-col items-center gap-3">
          {hasFilters
            ? <SearchX className="w-10 h-10 text-gray-300" />
            : <ClipboardList className="w-10 h-10 text-gray-300" />
          }
          <p className="text-sm font-medium text-gray-500">
            {hasFilters ? 'Sin resultados para ese filtro' : isBilling ? 'Sin gastos en este estado de cuenta' : 'Sin gastos este mes'}
          </p>
        </div>
      ) : (
        <HistorialExpenses
          groups={sortedDates.map(date => ({
            date,
            label: dateLabel(date),
            dayTotal: grouped[date].reduce((s, e) => s + e.amount, 0),
            expenses: grouped[date],
          }))}
        />
      )}

      {/* Paginación */}
      {!isBilling && totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 mt-4">
          {prevHref ? (
            <Link href={prevHref} className="flex items-center gap-1 px-4 py-2 text-sm font-semibold text-brand-600 bg-brand-50 rounded-xl hover:bg-brand-100 transition-colors">
              <ChevronLeft className="w-4 h-4" />
              Anterior
            </Link>
          ) : <div />}
          <p className="text-xs text-gray-400 font-medium">Página {page} de {totalPages}</p>
          {nextHref ? (
            <Link href={nextHref} className="flex items-center gap-1 px-4 py-2 text-sm font-semibold text-brand-600 bg-brand-50 rounded-xl hover:bg-brand-100 transition-colors">
              Siguiente
              <ChevronRight className="w-4 h-4" />
            </Link>
          ) : <div />}
        </div>
      )}
    </div>
  )
}
