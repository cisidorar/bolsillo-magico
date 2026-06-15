import { createClient, getServerSession } from '@/lib/supabase/server'
import ExpenseList from '@/components/ExpenseList'
import MonthNav from '@/components/MonthNav'
import HistorialFilters from '@/components/HistorialFilters'
import { formatCLP, monthName } from '@/lib/utils'
import { SearchX, ClipboardList } from 'lucide-react'
import type { ExpenseWithRelations } from '@/types'

export const revalidate = 0

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

export default async function HistorialPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string; q?: string; cat?: string }>
}) {
  const { month: monthStr, year: yearStr, q, cat } = await searchParams
  const now   = new Date()
  const month = monthStr ? parseInt(monthStr) : now.getMonth() + 1
  const year  = yearStr  ? parseInt(yearStr)  : now.getFullYear()

  const [user, supabase] = await Promise.all([getServerSession(), createClient()])

  const nextMonth = month === 12 ? 1       : month + 1
  const nextYear  = month === 12 ? year + 1 : year

  // Build query with optional filters
  let query = supabase
    .from('expenses')
    .select('*, category:categories(*), payment_method:payment_methods(*), recurring_expense:recurring_expenses(id,name,domain)')
    .eq('user_id', user!.id)
    .gte('date', `${year}-${String(month).padStart(2, '0')}-01`)
    .lt('date',  `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })

  if (q)   query = query.ilike('description', `%${q}%`)
  if (cat) query = query.eq('category_id', cat)

  const [{ data: expenses }, { data: categories }] = await Promise.all([
    query,
    supabase.from('categories').select('*').eq('user_id', user!.id).order('sort_order'),
  ])

  const typedExpenses = (expenses ?? []) as ExpenseWithRelations[]
  const total = typedExpenses.reduce((s, e) => s + e.amount, 0)
  const hasFilters = !!(q || cat)

  // Group by date
  const grouped = typedExpenses.reduce<Record<string, ExpenseWithRelations[]>>((acc, e) => {
    if (!acc[e.date]) acc[e.date] = []
    acc[e.date].push(e)
    return acc
  }, {})
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  return (
    <div className="px-4 pt-6 pb-4 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-brand-900">Historial</h1>
        <MonthNav month={month} year={year} basePath="/historial" />
      </div>

      {/* Search + filter */}
      <HistorialFilters
        categories={categories ?? []}
        month={month}
        year={year}
      />

      {/* Summary card */}
      {typedExpenses.length > 0 && (
        <div className="card px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-400 mb-0.5">
              {hasFilters ? 'Filtrado' : `${monthName(month)} ${year}`}
            </p>
            <p className="text-2xl font-extrabold text-gray-900 tabular-nums">{formatCLP(total)}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-extrabold text-gray-900">{typedExpenses.length}</p>
            <p className="text-xs font-medium text-gray-400">
              gasto{typedExpenses.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      )}

      {/* Grouped expense list */}
      {typedExpenses.length === 0 ? (
        <div className="card text-center py-16 flex flex-col items-center gap-3">
          {hasFilters
            ? <SearchX className="w-10 h-10 text-gray-300" />
            : <ClipboardList className="w-10 h-10 text-gray-300" />
          }
          <p className="text-sm font-medium text-gray-500">
            {hasFilters ? 'Sin resultados para ese filtro' : 'Sin gastos este mes'}
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
    </div>
  )
}
