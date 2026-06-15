import { createClient, getServerSession } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CategoryBudgetManager from '@/components/CategoryBudgetManager'
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

  return (
    <div className="px-4 pt-6 pb-4">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-brand-900">Presupuesto por categoría</h1>
        <p className="text-sm text-brand-400 mt-1">
          El total se usa como límite mensual en el dashboard
        </p>
      </div>

      <CategoryBudgetManager
        categories={categories ?? []}
        budgets={(budgets ?? []) as CategoryBudget[]}
        userId={user.id}
        month={month}
        year={year}
      />
    </div>
  )
}
