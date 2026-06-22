import { createClient, getServerSession } from '@/lib/supabase/server'
import { formatCLP, monthName, isEmoji } from '@/lib/utils'
import { getCategoryIcon } from '@/lib/category-icons'
import CatExpenseList from '@/components/CatExpenseList'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
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

  const [{ data: category }, { data: expenses }] = await Promise.all([
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
  ])

  if (!category) notFound()

  const typedExpenses = (expenses ?? []) as ExpenseWithRelations[]
  const total = typedExpenses.reduce((s, e) => s + e.amount, 0)

  // Agrupar por día
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

  const CatIcon = isEmoji(category.icon) ? null : getCategoryIcon(category.icon)

  return (
    <div className="pb-8">
      {/* Header */}
      <div className="hero-gradient px-4 lg:px-8 pt-5 pb-4 flex items-center gap-3">
        <Link
          href={backHref}
          className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 active:bg-white/30 transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-white" />
        </Link>

        {/* Ícono + nombre */}
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-white/20"
          >
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

        {/* Total */}
        <div className="text-right flex-shrink-0">
          <p className="text-lg font-extrabold text-white tabular-nums leading-tight">{formatCLP(total)}</p>
          <p className="text-xs text-white/60">{typedExpenses.length} gasto{typedExpenses.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Lista agrupada por día */}
      <div className="px-4 lg:px-8 pt-4">
        {groups.length === 0 ? (
          <div className="card text-center py-14">
            <p className="text-sm font-bold text-gray-500">Sin gastos en {monthName(month)}</p>
          </div>
        ) : (
          <CatExpenseList groups={groups} categoryName={category.name} />
        )}
      </div>
    </div>
  )
}
