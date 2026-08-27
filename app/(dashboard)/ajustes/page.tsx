import React from 'react'
import Link from 'next/link'
import { createClient, getServerSession } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { isEmoji } from '@/lib/utils'
import { getCategoryIcon } from '@/lib/category-icons'
import ServiceLogo from '@/components/ServiceLogo'
import ThemeToggle from '@/components/ThemeToggle'
import PaydaySelect from '@/components/PaydaySelect'
import BudgetPeriodSelect from '@/components/BudgetPeriodSelect'
import NotificationPrefs from '@/components/NotificationPrefs'
import ImportCSV from '@/components/ImportCSV'
import ExportForm from '@/components/ExportForm'
import { summarizeNotificationStatus } from '@/lib/notification-status'
import { getNowChile } from '@/lib/utils'
import {
  ChevronRight, Tag, CreditCard, Target, Wallet, TrendingUp, RefreshCw,
  Palette, Sparkles, Bell, Coins, Database, Download,
  type LucideIcon,
} from 'lucide-react'

function MobileProfileLink({ name, email, avatarUrl }: { name: string; email: string; avatarUrl: string | null }) {
  const initial = (name || email || '?').charAt(0).toUpperCase()
  return (
    <Link
      href="/ajustes/perfil"
      className="lg:hidden card flex items-center gap-3 px-4 py-3.5 mb-6 hover:opacity-90 transition-opacity"
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt={name} width={40} height={40} className="rounded-full flex-shrink-0 object-cover" style={{ width: 40, height: 40 }} />
      ) : (
        <div className="rounded-full flex-shrink-0 flex items-center justify-center font-bold text-white" style={{ width: 40, height: 40, background: 'var(--primary)' }}>
          {initial}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold truncate" style={{ color: 'var(--ink)' }}>{name || 'Tu perfil'}</p>
        <p className="text-xs truncate" style={{ color: 'var(--ink-3)' }}>Perfil y cuenta</p>
      </div>
      <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ink-3)' }} />
    </Link>
  )
}

export const dynamic = 'force-dynamic'

export default async function AjustesPage() {
  const [user, supabase] = await Promise.all([getServerSession(), createClient()])
  if (!user) redirect('/login')

  const { year, month } = getNowChile()
  const monthStr = `${year}-${String(month).padStart(2, '0')}`

  const [{ data: profile }, { data: categories }, { data: paymentMethods }, { data: notifLogs }, { data: monthBudget }, { data: monthExpenses }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('categories').select('*').eq('user_id', user.id).order('sort_order'),
    supabase.from('payment_methods').select('*').eq('user_id', user.id).order('sort_order'),
    // E1: monitor de avisos — últimos 6 meses alcanzan para ver el último envío de cada tipo
    supabase.from('notification_log').select('type, sent_at').eq('user_id', user.id)
      .gte('sent_at', new Date(Date.now() - 180 * 86_400_000).toISOString()),
    supabase.from('budgets').select('amount').eq('user_id', user.id).eq('month', month).eq('year', year).maybeSingle(),
    supabase.from('expenses').select('amount').eq('user_id', user.id)
      .gte('date', `${monthStr}-01`).lte('date', `${monthStr}-31`),
  ])

  const budgetPct = monthBudget?.amount
    ? Math.round((((monthExpenses ?? []).reduce((s, e) => s + e.amount, 0)) / monthBudget.amount) * 100)
    : null
  const notifStatus = summarizeNotificationStatus({
    logs: notifLogs ?? [],
    monthStr,
    budgetPct,
    budgetThreshold: profile?.budget_alert_pct ?? 80,
  })

  return (
    <div className="px-4 lg:px-8 pt-2 lg:pt-8 pb-10">

      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-3xl font-semibold leading-tight" style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--ink)' }}>Ajustes</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--ink-3)' }}>Preferencias, notificaciones, finanzas y datos.</p>
      </div>

      {/* En desktop, Perfil y cuenta se accede desde el bloque de usuario del
          SideNav. En mobile no hay otro lugar para llegar ahí, así que se
          ofrece este acceso rápido arriba de todo. */}
      <MobileProfileLink
        name={profile?.display_name ?? user.email ?? ''}
        email={user.email ?? ''}
        avatarUrl={profile?.avatar_url ?? null}
      />

      <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start space-y-6 lg:space-y-0">

        {/* ── Columna izquierda: Preferencias + Notificaciones ────── */}
        <div className="space-y-6">

          <section>
            <SectionHeader icon={Sparkles} label="Preferencias" color="#1FBE8D" />
            <div className="space-y-3">
              <BudgetPeriodSelect
                userId={user.id}
                budgetPeriod={profile?.budget_period ?? 'calendar'}
                periodCardId={profile?.period_card_id ?? null}
                creditCards={((paymentMethods ?? []) as { id: string; name: string; billing_day: number | null; card_type: string }[])
                  .filter(pm => pm.card_type === 'credit' && pm.billing_day)
                  .map(pm => ({ id: pm.id, name: pm.name, billing_day: pm.billing_day! }))}
              />
              <PaydaySelect
                userId={user.id}
                payday={profile?.payday ?? null}
                lastBusinessDay={profile?.payday_last_business_day ?? false}
              />
              <div className="card overflow-hidden">
                <div className="flex items-center gap-4 px-4 pt-4 pb-3.5">
                  {/* cat-icon-bg (no un bg hardcodeado): el fondo lavanda fijo
                      no se adaptaba a modo oscuro y quedaba blanco/desentonado
                      junto a los demás íconos, que sí usan este patrón. */}
                  <div className="cat-icon-bg w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ '--cat-bg': '#F5F3FF', '--cat-color': '#7C3AED' } as React.CSSProperties}>
                    <Palette className="w-5 h-5" style={{ color: '#7C3AED' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Apariencia</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>Cómo se ve la app.</p>
                  </div>
                </div>
                <ThemeToggle />
              </div>
            </div>
          </section>

          <section>
            <SectionHeader icon={Bell} label="Notificaciones" color="#2B7CF6" />
            <NotificationPrefs
              userId={user.id}
              notifyBilling={profile?.notify_billing ?? true}
              notifyBudget={profile?.notify_budget ?? true}
              notifyMonthly={profile?.notify_monthly ?? false}
              notifyRecurring={profile?.notify_recurring ?? true}
              notifyWatchlistDigest={profile?.notify_watchlist_target ?? true}
              notifyWeeklyReport={profile?.notify_weekly_report ?? true}
              notifyDepositMaturity={profile?.notify_deposit_maturity ?? true}
              budgetAlertPct={profile?.budget_alert_pct ?? 80}
              billingAlertDays={profile?.billing_alert_days ?? 2}
              status={notifStatus}
            />
          </section>

        </div>

        {/* ── Columna derecha: Finanzas + Datos ───────────────────── */}
        <div className="space-y-6">

          <section>
            <SectionHeader icon={Coins} label="Finanzas" color="#F59E0B" />
            <div className="card overflow-hidden">

              {/* Solo mobile — ya en sidebar desktop */}
              <div className="lg:hidden divide-y" style={{ borderColor: 'var(--border)' }}>
                <SettingsRow
                  href="/ingresos"
                  icon={
                    <div className="cat-icon-bg w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ '--cat-bg': '#E6FAF3', '--cat-color': '#1FBE8D' } as React.CSSProperties}>
                      <Wallet className="w-5 h-5" style={{ color: '#1FBE8D' }} />
                    </div>
                  }
                  title="Ingresos"
                  subtitle="Registra cuánto ganas cada mes."
                />
                <SettingsRow
                  href="/inversiones"
                  icon={
                    <div className="cat-icon-bg w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ '--cat-bg': '#EEF4FF', '--cat-color': '#2B7CF6' } as React.CSSProperties}>
                      <TrendingUp className="w-5 h-5" style={{ color: '#2B7CF6' }} />
                    </div>
                  }
                  title="Inversiones"
                  subtitle="Acciones, depósitos a plazo y ahorro."
                />
                <SettingsRow
                  href="/recurrentes"
                  icon={
                    <div className="cat-icon-bg w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ '--cat-bg': '#F0FDFA', '--cat-color': '#0D9488' } as React.CSSProperties}>
                      <RefreshCw className="w-5 h-5" style={{ color: '#0D9488' }} />
                    </div>
                  }
                  title="Gastos recurrentes"
                  subtitle="Gestiona suscripciones y cobros fijos."
                />
              </div>

              {/* Siempre visibles */}
              <div className="divide-y border-t lg:border-t-0" style={{ borderColor: 'var(--border)' }}>
                <SettingsRow
                  href="/presupuesto"
                  icon={
                    <div className="cat-icon-bg w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ '--cat-bg': '#EEF4FF', '--cat-color': '#2B7CF6' } as React.CSSProperties}>
                      <Target className="w-5 h-5" style={{ color: '#2B7CF6' }} />
                    </div>
                  }
                  title="Límite mensual"
                  subtitle="Define y controla tu presupuesto mensual."
                />
                <SettingsRow
                  href="/categorias"
                  icon={
                    <div className="flex-shrink-0">
                      {(categories ?? []).length > 0 ? (
                        <div className="flex -space-x-2">
                          {(categories ?? []).slice(0, 3).map(c => (
                            <div
                              key={c.id}
                              className="cat-icon-bg w-10 h-10 rounded-xl flex items-center justify-center text-sm ring-2 ring-white dark:ring-slate-900 flex-shrink-0"
                              style={{ '--cat-bg': c.bg_color, '--cat-color': c.color } as React.CSSProperties}
                            >
                              {isEmoji(c.icon)
                                ? <span className="text-base">{c.icon}</span>
                                : (() => { const Icon = getCategoryIcon(c.icon); return <Icon className="w-4 h-4" style={{ color: c.color }} /> })()
                              }
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="cat-icon-bg w-10 h-10 rounded-xl flex items-center justify-center"
                          style={{ '--cat-bg': '#F5F3FF', '--cat-color': '#7C3AED' } as React.CSSProperties}>
                          <Tag className="w-5 h-5" style={{ color: '#7C3AED' }} />
                        </div>
                      )}
                    </div>
                  }
                  title="Categorías"
                  subtitle="Organiza tus gastos por categorías."
                />
                <SettingsRow
                  href="/metodos"
                  icon={
                    <div className="flex-shrink-0">
                      {(paymentMethods ?? []).length > 0 ? (
                        <div className="flex -space-x-2">
                          {(paymentMethods ?? []).slice(0, 3).map(m => (
                            <div key={m.id} className="ring-2 ring-white dark:ring-slate-900 rounded-xl flex-shrink-0">
                              <ServiceLogo domain={m.domain} name={m.name} size={40} />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="cat-icon-bg w-10 h-10 rounded-xl flex items-center justify-center"
                          style={{ '--cat-bg': '#F0FDF4', '--cat-color': '#16A34A' } as React.CSSProperties}>
                          <CreditCard className="w-5 h-5" style={{ color: '#16A34A' }} />
                        </div>
                      )}
                    </div>
                  }
                  title="Métodos de pago"
                  subtitle="Administra tus cuentas y tarjetas."
                />
              </div>

            </div>
          </section>

          <section>
            <SectionHeader icon={Database} label="Datos" color="#2B7CF6" />
            <div className="space-y-3">
              <div className="card overflow-hidden">
                <div className="flex items-center gap-4 px-4 pt-4 pb-2">
                  <div className="cat-icon-bg w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ '--cat-bg': '#F0FDF4', '--cat-color': '#16A34A' } as React.CSSProperties}>
                    <Download className="w-5 h-5" style={{ color: '#16A34A' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Exportar gastos</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>Descarga tus gastos en CSV.</p>
                  </div>
                </div>
                <ExportForm />
              </div>
              <div className="card overflow-hidden">
                <ImportCSV />
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, label, color }: { icon: LucideIcon; label: string; color: string }) {
  return (
    <div className="flex items-center gap-2 mb-3 px-0.5">
      <Icon className="w-4 h-4 flex-shrink-0" style={{ color }} />
      <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{label}</p>
    </div>
  )
}

function SettingsRow({
  href,
  icon,
  title,
  subtitle,
}: {
  href: string
  icon: React.ReactNode
  title: string
  subtitle: string
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 px-4 py-4 transition-colors hover:bg-black/5 group"
    >
      {icon}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{title}</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>{subtitle}</p>
      </div>
      <ChevronRight className="w-4 h-4 flex-shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: 'var(--ink-3)' }} />
    </Link>
  )
}
