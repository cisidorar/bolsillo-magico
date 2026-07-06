import { createClient, getServerSession } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Palette } from 'lucide-react'
import ThemeToggle from '@/components/ThemeToggle'
import PaydaySelect from '@/components/PaydaySelect'
import BudgetPeriodSelect from '@/components/BudgetPeriodSelect'

export const dynamic = 'force-dynamic'

export default async function PreferenciasPage() {
  const [user, supabase] = await Promise.all([getServerSession(), createClient()])
  if (!user) redirect('/login')

  const [{ data: profile }, { data: paymentMethods }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('payment_methods').select('*').eq('user_id', user.id).order('sort_order'),
  ])

  return (
    <div className="space-y-3">
      <BudgetPeriodSelect
        userId={user.id}
        budgetPeriod={profile?.budget_period ?? 'calendar'}
        periodCardId={profile?.period_card_id ?? null}
        creditCards={((paymentMethods ?? []) as { id: string; name: string; billing_day: number | null; card_type: string }[])
          .filter(pm => pm.card_type === 'credit' && pm.billing_day)
          .map(pm => ({ id: pm.id, name: pm.name, billing_day: pm.billing_day! }))}
      />
      <PaydaySelect userId={user.id} payday={profile?.payday ?? null} />
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 px-4 pt-3.5 pb-0">
          <Palette className="w-4 h-4" style={{ color: '#7C3AED' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Apariencia</p>
        </div>
        <ThemeToggle />
      </div>
    </div>
  )
}
