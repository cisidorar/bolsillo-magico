import React from 'react'
import { createClient, getServerSession } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CategoryBudgetManager from '@/components/CategoryBudgetManager'
import { formatCLP } from '@/lib/utils'
import { PiggyBank, Target } from 'lucide-react'
import type { CategoryBudget } from '@/types'

export const dynamic = 'force-dynamic'

export default async function PresupuestoPage() {
  const [user, supabase] = await Promise.all([getServerSession(), createClient()])
  if (!user) redirect('/login')

  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()

  const [{ data: categories }, { data: budgets }] = await Promise.all([
    supabase.from('categories').select('*').eq('user_id', user.id).order('sort_order'),
    supabase.from('category_budgets').select('*').eq('user_id', user.id),
  ])

  const typedBudgets = (budgets ?? []) as CategoryBudget[]
  const totalBudgeted = typedBudgets.reduce((s, b) => s + b.amount, 0)
  const budgetsWithLimit = typedBudgets.length
  const totalCategories = (categories ?? []).length

  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-8">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-brand-900">Presupuesto por categoría</h1>
        <p className="text-sm text-gray-400 mt-1">
          Define cuánto quieres gastar en cada categoría este mes.
        </p>
      </div>

      <div className="lg:grid lg:gap-6 lg:items-start" style={{ gridTemplateColumns: '1fr 260px' }}>

        {/* Lista de categorías */}
        <CategoryBudgetManager
          categories={categories ?? []}
          budgets={typedBudgets}
          userId={user.id}
          month={month}
          year={year}
        />

        {/* Panel lateral — solo desktop */}
        <div className="hidden lg:flex flex-col gap-4">

          {/* Resumen */}
          <div className="card p-5">
            <p className="text-sm font-bold text-gray-700 mb-4">Resumen</p>
            <div className="space-y-4">

              <div className="flex items-center gap-3">
                <div
                  className="cat-icon-bg w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ '--cat-bg': '#EEF4FF', '--cat-color': '#1B6DD4' } as React.CSSProperties}
                >
                  <PiggyBank className="w-4 h-4" style={{ color: '#1B6DD4' }} />
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 font-medium leading-tight">Total presupuestado</p>
                  <p className="text-base font-extrabold text-gray-900 tabular-nums">
                    {totalBudgeted > 0 ? formatCLP(totalBudgeted) : '—'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div
                  className="cat-icon-bg w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ '--cat-bg': '#F0FDF4', '--cat-color': '#16A34A' } as React.CSSProperties}
                >
                  <Target className="w-4 h-4" style={{ color: '#16A34A' }} />
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 font-medium leading-tight">Categorías con límite</p>
                  <p className="text-base font-extrabold text-gray-900 tabular-nums">
                    {budgetsWithLimit} <span className="text-sm font-medium text-gray-400">/ {totalCategories}</span>
                  </p>
                </div>
              </div>

            </div>
          </div>

          {/* Tip */}
          <div className="card insight-card p-4">
            <p className="text-xs font-bold text-amber-800 mb-1">💡 Cómo funciona</p>
            <p className="text-xs text-amber-700 leading-relaxed">
              El total presupuestado se refleja como límite mensual en el dashboard. Deja un campo vacío para no poner límite a esa categoría.
            </p>
          </div>

        </div>
      </div>
    </div>
  )
}
