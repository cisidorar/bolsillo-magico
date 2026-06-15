import { createClient, getServerSession } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatCLP } from '@/lib/utils'
import RecurringManager from '@/components/RecurringManager'
import type { RecurringExpense } from '@/types'

export const dynamic = 'force-dynamic'

export default async function RecurrentesPage() {
  const [user, supabase] = await Promise.all([getServerSession(), createClient()])
  if (!user) redirect('/login')

  const [{ data: recurring }, { data: categories }, { data: paymentMethods }, { data: allExpenses }] = await Promise.all([
    supabase
      .from('recurring_expenses')
      .select('*, category:categories(*), payment_method:payment_methods(*)')
      .eq('user_id', user.id)
      .order('billing_day'),
    supabase.from('categories').select('*').eq('user_id', user.id).order('sort_order'),
    supabase.from('payment_methods').select('*').eq('user_id', user.id).order('sort_order'),
    supabase
      .from('expenses')
      .select('recurring_expense_id')
      .eq('user_id', user.id)
      .not('recurring_expense_id', 'is', null),
  ])

  // Contar cuotas pagadas desde expenses (más confiable que paid_installments)
  const paidMap = (allExpenses ?? []).reduce<Record<string, number>>((acc, e) => {
    if (e.recurring_expense_id) acc[e.recurring_expense_id] = (acc[e.recurring_expense_id] ?? 0) + 1
    return acc
  }, {})

  const recurringWithCounts = ((recurring ?? []) as RecurringExpense[]).map(r => ({
    ...r,
    paid_installments: r.total_installments ? (paidMap[r.id] ?? 0) : r.paid_installments,
  }))

  const totalMonthly = recurringWithCounts
    .filter(r => r.is_active)
    .reduce((s, r) => s + r.amount, 0)

  return (
    <div className="px-4 pt-6 pb-4">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-brand-900">Recurrentes</h1>
      </div>

      {/* Summary */}
      {(recurring ?? []).length > 0 && (
        <div className="card p-4 mb-5">
          <p className="text-sm font-bold text-gray-600 mb-1">Compromiso mensual</p>
          <p className="text-2xl font-extrabold text-brand-900">
            {formatCLP(totalMonthly)}
          </p>
          <p className="text-xs text-brand-400 mt-0.5">
            {(recurring ?? []).filter((r: RecurringExpense) => r.is_active).length} gasto{(recurring ?? []).filter((r: RecurringExpense) => r.is_active).length !== 1 ? 's' : ''} activo{(recurring ?? []).filter((r: RecurringExpense) => r.is_active).length !== 1 ? 's' : ''}
          </p>
        </div>
      )}

      <RecurringManager
        items={recurringWithCounts}
        categories={categories ?? []}
        paymentMethods={paymentMethods ?? []}
        userId={user.id}
      />
    </div>
  )
}
