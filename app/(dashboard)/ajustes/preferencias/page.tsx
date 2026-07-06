import { createClient, getServerSession } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Palette } from 'lucide-react'
import ThemeToggle from '@/components/ThemeToggle'
import AccentColorPicker from '@/components/AccentColorPicker'
import PaydaySelect from '@/components/PaydaySelect'
import BudgetPeriodSelect from '@/components/BudgetPeriodSelect'
import LanguageRegionSelect from '@/components/LanguageRegionSelect'
import WeekStartToggle from '@/components/WeekStartToggle'
import { isAccentKey, DEFAULT_ACCENT } from '@/lib/accent-colors'

export const dynamic = 'force-dynamic'

export default async function PreferenciasPage() {
  const [user, supabase] = await Promise.all([getServerSession(), createClient()])
  if (!user) redirect('/login')

  const [{ data: profile }, { data: paymentMethods }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('payment_methods').select('*').eq('user_id', user.id).order('sort_order'),
  ])

  const accentColor = isAccentKey(profile?.accent_color) ? profile!.accent_color : DEFAULT_ACCENT

  return (
    <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start space-y-5 lg:space-y-0">

      {/* ── Columna izquierda ───────────────────────────────────────── */}
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
      </div>

      {/* ── Columna derecha ─────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="card overflow-hidden divide-y" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-4 px-4 pt-4 pb-3.5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#F5F3FF' }}>
              <Palette className="w-5 h-5" style={{ color: '#7C3AED' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Apariencia</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>Cómo se ve la app.</p>
            </div>
          </div>
          <ThemeToggle />
          <AccentColorPicker userId={user.id} accentColor={accentColor} />
        </div>
        <LanguageRegionSelect
          userId={user.id}
          language={profile?.language ?? 'es-CL'}
          dateFormat={profile?.date_format ?? 'DD/MM/AAAA'}
        />
        <WeekStartToggle userId={user.id} weekStart={profile?.week_start ?? 'monday'} />
      </div>

    </div>
  )
}
