import { createClient, getServerSession } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import NotificationPrefs from '@/components/NotificationPrefs'

export const dynamic = 'force-dynamic'

export default async function NotificacionesPage() {
  const [user, supabase] = await Promise.all([getServerSession(), createClient()])
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()

  return (
    <NotificationPrefs
      userId={user.id}
      notifyBilling={profile?.notify_billing ?? true}
      notifyBudget={profile?.notify_budget ?? true}
      notifyMonthly={profile?.notify_monthly ?? false}
      notifyRecurring={profile?.notify_recurring ?? true}
      budgetAlertPct={profile?.budget_alert_pct ?? 80}
      billingAlertDays={profile?.billing_alert_days ?? 2}
    />
  )
}
