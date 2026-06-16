import { createClient, getServerSession } from '@/lib/supabase/server'
import ExpenseList from '@/components/ExpenseList'
import MonthNav from '@/components/MonthNav'
import HistorialFilters from '@/components/HistorialFilters'
import { billingPeriod, formatCLP, monthName } from '@/lib/utils'
import { SearchX, ClipboardList, ChevronLeft, ChevronRight } from 'lucide-react'
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
  searchParams: Promise<{ month?: string; year?: string; q?: string; cat?: string; page?: string; view?: string }>
}) {
  const { month: monthStr, year: yearStr, q, cat, page: pageStr, view } = await searchParams
  const now   = new Date()
  const month = monthStr ? parseInt(monthStr) : now.getMonth() + 1
  const year  = yearStr  ? parseInt(yearStr)  : now.getFullYear()
  const page  = pageStr  ? Math.max(1, parseInt(pageStr)) : 1
  const isBilling = view === 'billing'

  const [user, supabase] = await Promise.all([getServerSession(), createClient()])

  let expenses: ExpenseWithRelations[]
  let totalCount = 0
  let totalPages = 1
  let billingHitLimit = false

  if (isBilling) {
    // En modo facturación: fetch ventana ampliada (mes-1 → mes+1) sin paginación,
    // luego post-filtramos por billingPeriod(). Máximo ~300 registros.
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

    if (q)   billingQuery = billingQuery.ilike('description', `%${q}%`)
    if (cat) billingQuery = billingQuery.eq('category_id', cat)

    const { data } = await billingQuery
    const all = (data ?? []) as ExpenseWithRelations[]
    billingHitLimit = all.length === 300

    // Post-filtrar por billing period
    expenses = all.filter(e => {
      const pm = e.payment_method as { billing_day?: number | null } | null
      const bd = pm?.billing_day ?? null
      const bp = billingPeriod(e.date, bd)
      return bp.month === month && bp.year === year
    })

    totalCount = expenses.length
    totalPages = 1 // Sin paginación en modo billing
  } else {
    // Modo por compra: paginación normal
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

    if (q)   purchaseQuery = purchaseQuery.ilike('description', `%${q}%`)
    if (cat) purchaseQuery = purchaseQuery.eq('category_id', cat)

    const { data, count } = await purchaseQuery
    expenses   = (data ?? []) as ExpenseWithRelations[]
    totalCount = count ?? 0
    totalPages = Math.ceil(totalCount / PAGE_SIZE)
  }

  const [{ data: categories }] = await Promise.all([
    supabase.from('categories').select('*').eq('user_id', user!.id).order('sort_order'),
  ])

  const total = expenses.reduce((s, e) => s + e.amount, 0)
  const hasFilters = !!(q || cat)

  // Group by date
  const grouped = expenses.reduce<Record<string, ExpenseWithRelations[]>>((acc, e) => {
    if (!acc[e.date]) acc[e.date] = []
    acc[e.date].push(e)
    return acc
  }, {})
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  const baseParams = { month, year, q, cat, view: isBilling ? 'billing' : undefined }
  const prevHref = (!isBilling && page > 1) ? buildHref({ ...baseParams, page: page - 1 }) : null
  const nextHref = (!isBilling && page < totalPages) ? buildHref({ ...baseParams, page: page + 1 }) : null

  const summaryLabel = isBilling
    ? hasFilters
      ? `Facturación · ${monthName(month)} ${year} (filtrado)`
      : `Facturación · ${monthName(month)} ${year}`
    : hasFilters ? 'Filtrado' : `${monthName(month)} ${year}`

  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-4 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-brand-900">Historial</h1>
        <MonthNav month={month} year={year} basePath="/historial" extraParams={isBilling ? { view: 'billing' } : {}} />
      </div>

      {/* Search + filter */}
      <HistorialFilters
        categories={categories ?? []}
        month={month}
        year={year}
      />

      {/* Banner modo facturación */}
      {isBilling && (
        <div className="flex items-start gap-2.5 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
          <span className="text-indigo-500 text-base mt-0.5">💳</span>
          <p className="text-xs text-indigo-700 leading-relaxed">
            Mostrando gastos cuyo <strong>estado de cuenta cierra en {monthName(month)} {year}</strong>,
            independiente de la fecha de compra.
          </p>
        </div>
      )}

      {/* Aviso si se alcanzó el límite de 300 registros en modo billing */}
      {isBilling && billingHitLimit && (
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
          <span className="text-amber-500 text-base mt-0.5">⚠️</span>
          <p className="text-xs text-amber-700 leading-relaxed">
            Se mostraron los primeros 300 gastos del período. Usa los filtros de búsqueda o categoría para acotar los resultados.
          </p>
        </div>
      )}

      {/* Summary card */}
      {totalCount > 0 && (
        <div className="card px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-400 mb-0.5">{summaryLabel}</p>
            <p className="text-2xl font-extrabold text-gray-900 tabular-nums">{formatCLP(total)}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-extrabold text-gray-900">{totalCount}</p>
            <p className="text-xs font-medium text-gray-400">
              gasto{totalCount !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      )}

      {/* Grouped expense list */}
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
        sortedDates.map(date => {
          const dayTotal = grouped[date].reduce((s, e) => s + e.amount, 0)
          return (
            <div key={date}>
              <div className="flex items-center justify-between mb-2 px-0.5">
                <span className="text-sm font-bold text-gray-600 capitalize">
                  {dateLabel(date)}
                </span>
                <span className="text-sm font-semibold text-gray-400 tabular-nums">
                  {formatCLP(dayTotal)}
                </span>
              </div>
              <ExpenseList expenses={grouped[date]} />
            </div>
          )
        })
      )}

      {/* Paginación (solo en modo por compra) */}
      {!isBilling && totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          {prevHref ? (
            <Link href={prevHref} className="flex items-center gap-1 px-4 py-2 text-sm font-semibold text-brand-600 bg-brand-50 rounded-xl hover:bg-brand-100 transition-colors">
              <ChevronLeft className="w-4 h-4" />
              Anterior
            </Link>
          ) : <div />}
          <p className="text-xs text-gray-400 font-medium">
            Página {page} de {totalPages}
          </p>
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
