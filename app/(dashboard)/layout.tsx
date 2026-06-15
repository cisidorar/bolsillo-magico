import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import BottomNav from '@/components/BottomNav'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Auto-registro de gastos recurrentes con auto_register=true
  // Corre cada vez que se carga el dashboard (idempotente: solo inserta si no existe ya este mes)
  const today = new Date()
  const todayDay = today.getDate()
  const currentMonth = today.getMonth() + 1
  const currentYear  = today.getFullYear()
  const monthStr = String(currentMonth).padStart(2, '0')
  const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1
  const nextYear  = currentMonth === 12 ? currentYear + 1 : currentYear

  // Recurrentes activos con auto_register cuyo día de cobro ya llegó
  const { data: autoRecurring } = await supabase
    .from('recurring_expenses')
    .select('id, amount, category_id, payment_method_id, billing_day, name')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .eq('auto_register', true)
    .lte('billing_day', todayDay)

  if (autoRecurring && autoRecurring.length > 0) {
    // Fetch cuáles ya fueron registrados este mes
    const { data: alreadyRegistered } = await supabase
      .from('expenses')
      .select('recurring_expense_id')
      .eq('user_id', user.id)
      .not('recurring_expense_id', 'is', null)
      .gte('date', `${currentYear}-${monthStr}-01`)
      .lt('date',  `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`)

    const registeredSet = new Set((alreadyRegistered ?? []).map(e => e.recurring_expense_id))

    const toInsert = autoRecurring
      .filter(r => !registeredSet.has(r.id))
      .map(r => ({
        user_id: user.id,
        amount: r.amount,
        category_id: r.category_id,
        payment_method_id: r.payment_method_id,
        recurring_expense_id: r.id,
        description: r.name,
        date: `${currentYear}-${monthStr}-${String(r.billing_day).padStart(2, '0')}`,
      }))

    if (toInsert.length > 0) {
      await supabase.from('expenses').insert(toInsert)
    }
  }

  return (
    <div className="min-h-screen flex flex-col max-w-lg mx-auto" style={{ backgroundColor: '#EEF4FF' }}>
      <main className="flex-1 overflow-y-auto" style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}>
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
