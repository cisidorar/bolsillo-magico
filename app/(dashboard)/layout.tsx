import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import BottomNav from '@/components/BottomNav'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Crear categorías y métodos de pago por defecto si el usuario no tiene ninguno
  const { count } = await supabase
    .from('categories')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)

  if (count === 0) {
    await supabase.from('categories').insert([
      { user_id: user.id, name: 'Comida',     icon: '🍽️', color: '#0F6E56', bg_color: '#E1F5EE', is_default: true, sort_order: 1 },
      { user_id: user.id, name: 'Transporte', icon: '🚗', color: '#185FA5', bg_color: '#E6F1FB', is_default: true, sort_order: 2 },
      { user_id: user.id, name: 'Hogar',      icon: '🏠', color: '#854F0B', bg_color: '#FAEEDA', is_default: true, sort_order: 3 },
      { user_id: user.id, name: 'Ocio',       icon: '🎮', color: '#993556', bg_color: '#FBEAF0', is_default: true, sort_order: 4 },
      { user_id: user.id, name: 'Salud',      icon: '❤️', color: '#3B6D11', bg_color: '#EAF3DE', is_default: true, sort_order: 5 },
      { user_id: user.id, name: 'Ropa',       icon: '👕', color: '#3C3489', bg_color: '#EEEDFE', is_default: true, sort_order: 6 },
      { user_id: user.id, name: 'Educación',  icon: '📚', color: '#A32D2D', bg_color: '#FCEBEB', is_default: true, sort_order: 7 },
      { user_id: user.id, name: 'Mascotas',   icon: '🐾', color: '#854F0B', bg_color: '#FAEEDA', is_default: true, sort_order: 8 },
      { user_id: user.id, name: 'Otros',      icon: '📦', color: '#5F5E5A', bg_color: '#F1EFE8', is_default: true, sort_order: 9 },
    ])
    await supabase.from('payment_methods').insert([
      { user_id: user.id, name: 'Débito',   icon: '💳', card_type: 'debit',   is_default: true,  sort_order: 1 },
      { user_id: user.id, name: 'Crédito',  icon: '💎', card_type: 'credit',  is_default: false, sort_order: 2 },
      { user_id: user.id, name: 'Efectivo', icon: '💵', card_type: 'cash',    is_default: false, sort_order: 3 },
      { user_id: user.id, name: 'Digital',  icon: '📱', card_type: 'digital', is_default: false, sort_order: 4 },
    ])
  }

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
    <div className="min-h-screen flex flex-col max-w-lg mx-auto" style={{ backgroundColor: '#E1F7FD' }}>
      <main className="flex-1 overflow-y-auto pb-24">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
