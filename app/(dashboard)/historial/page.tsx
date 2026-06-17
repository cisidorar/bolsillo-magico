import { createClient, getServerSession } from '@/lib/supabase/server'
import HistorialExpenses from '@/components/HistorialExpenses'
import MonthNav from '@/components/MonthNav'
import HistorialFilters from '@/components/HistorialFilters'
import { billingPeriod, billingPeriodRange, formatCLP, monthName } from '@/lib/utils'
import { SearchX, ClipboardList, ChevronLeft, ChevronRight, Wallet, Receipt, TrendingUp } from 'lucide-react'
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
  const now   = new Date()
  const month = monthStr ? parseInt(monthStr) : now.getMonth() + 1
  const year  = yearStr  ? parseInt(yearStr)  : now.getFullYear()
  const page  = pageStr  ? Math.max(1, parseInt(pageStr)) : 1
  const isBilling = view === 'billing'

  // Multi-category filter
  const catIds = cats ? cats.split(',').filter(Boolean) : []

  const [user, supabase] = await Promise.all([getServerSession(), createClient()])

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
    billingHitLimit = all.length === 300

    expenses = all.filter(e => {
      const pm = e.payment_method as { billing_day?: number | null } | null
      const bd = pm?.billing_day ?? null
      const bp = billingPeriod(e.date, bd)
      return bp.month === month && bp.year === year
    })

    totalCount = expenses.length
    totalPages = 1
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
  const avgPerExpense = totalCount > 0 ? Math.round(total / totalCount) : 0
  const hasFilters = !!(q || catIds.length > 0)

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
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-4">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Historial</h1>
          <p className="text-sm text-gray-400 mt-1">Revisa y organiza tus gastos realizados.</p>
        </div>
        <MonthNav month={month} year={year} basePath="/historial" extraParams={isBilling ? { view: 'billing' } : {}} />
      </div>

      {/* Stats cards */}
      {totalCount > 0 && (
        <div className="grid grid-cols-3 gap-2.5 lg:gap-4 mb-5">

          {/* Total del mes / período */}
          <div className="card p-3 lg:p-4 flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-3">
            <div className="w-8 h-8 lg:w-12 lg:h-12 rounded-xl lg:rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: '#EEF4FF' }}>
              <Wallet className="w-4 h-4 lg:w-6 lg:h-6" style={{ color: '#1B6DD4' }} />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] lg:text-xs text-gray-400 font-medium leading-tight">
                {isBilling ? 'Total del período' : 'Total del mes'}
              </p>
              <p className="text-[13px] lg:text-xl font-extrabold text-gray-900 tabular-nums leading-tight">{formatCLP(total)}</p>
            </div>
          </div>

          {/* Gastos count */}
          <div className="card p-3 lg:p-4 flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-3">
            <div className="w-8 h-8 lg:w-12 lg:h-12 rounded-xl lg:rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: '#F0FDF4' }}>
              <Receipt className="w-4 h-4 lg:w-6 lg:h-6" style={{ color: '#16A34A' }} />
            </div>
            <div>
              <p className="text-lg lg:text-2xl font-extrabold text-gray-900 leading-none">{totalCount}</p>
              <p className="text-[9px] lg:text-xs text-gray-400 font-medium leading-tight">
                {isBilling ? 'en el período' : 'gastos este mes'}
              </p>
            </div>
          </div>

          {/* Promedio */}
          <div className="card p-3 lg:p-4 flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-3">
            <div className="w-8 h-8 lg:w-12 lg:h-12 rounded-xl lg:rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: '#F5F3FF' }}>
              <TrendingUp className="w-4 h-4 lg:w-6 lg:h-6" style={{ color: '#7C3AED' }} />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] lg:text-xs text-gray-400 font-medium leading-tight">Promedio</p>
              <p className="text-[13px] lg:text-xl font-extrabold text-gray-900 tabular-nums leading-tight">{formatCLP(avgPerExpense)}</p>
              <p className="text-[8px] lg:text-[10px] text-gray-400 leading-tight">Por gasto</p>
            </div>
          </div>

        </div>
      )}

      {/* Filters */}
      <div className="mb-5">
        <HistorialFilters categories={categories ?? []} month={month} year={year} />
      </div>

      {/* Banners */}
      {isBilling && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 mb-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-indigo-500 text-base">💳</span>
            <p className="text-xs font-semibold text-indigo-700">
              Facturación · {monthName(month)} {year}
            </p>
          </div>
          {cardPeriods.length > 0 ? (
            <div className="space-y-1 pl-6">
              {cardPeriods.map(cp => {
                const fmt = (s: string) => {
                  const d = new Date(s + 'T12:00:00')
                  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
                }
                return (
                  <p key={cp.billingDay} className="text-[11px] text-indigo-600">
                    {cp.name
                      ? <><span className="font-semibold">{cp.name}:</span> {fmt(cp.start)} – {fmt(cp.end)}</>
                      : <>{fmt(cp.start)} – {fmt(cp.end)} (corte día {cp.billingDay})</>
                    }
                  </p>
                )
              })}
            </div>
          ) : (
            <p className="text-[11px] text-indigo-500 pl-6">
              Gastos cuyo estado de cuenta cierra en {monthName(month)} {year}, independiente de la fecha de compra.
            </p>
          )}
        </div>
      )}
      {isBilling && billingHitLimit && (
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mb-4">
          <span className="text-amber-500 text-base mt-0.5">⚠️</span>
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
