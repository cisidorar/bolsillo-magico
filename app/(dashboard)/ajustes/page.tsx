import React from 'react'
import { createClient, getServerSession } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { isEmoji } from '@/lib/utils'
import { getCategoryIcon } from '@/lib/category-icons'
import ServiceLogo from '@/components/ServiceLogo'
import ProfileEditor from '@/components/ProfileEditor'
import Link from 'next/link'
import {
  ChevronRight, RefreshCw, Tag, CreditCard, Target,
  Download, Database, Shield, Coins, LogOut, Palette, Wallet, TrendingUp,
  Bell, Sparkles, Mail,
  type LucideIcon,
} from 'lucide-react'
import ImportCSV from '@/components/ImportCSV'
import ThemeToggle from '@/components/ThemeToggle'
import ExportForm from '@/components/ExportForm'
import NotificationPrefs from '@/components/NotificationPrefs'
import PaydaySelect from '@/components/PaydaySelect'
import BudgetPeriodSelect from '@/components/BudgetPeriodSelect'

export const dynamic = 'force-dynamic'

// Secciones para la navegación rápida (anclas)
const NAV_SECTIONS = [
  { id: 'perfil',         label: 'Perfil' },
  { id: 'preferencias',   label: 'Preferencias' },
  { id: 'notificaciones', label: 'Notificaciones' },
  { id: 'finanzas',       label: 'Finanzas' },
  { id: 'datos',          label: 'Datos' },
  { id: 'cuenta',         label: 'Cuenta' },
]

export default async function AjustesPage() {
  const [user, supabase] = await Promise.all([getServerSession(), createClient()])
  if (!user) redirect('/login')

  const [{ data: profile }, { data: categories }, { data: paymentMethods }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('categories').select('*').eq('user_id', user.id).order('sort_order'),
    supabase.from('payment_methods').select('*').eq('user_id', user.id).order('sort_order'),
  ])

  return (
    <div className="px-4 lg:px-8 pt-2 lg:pt-8 pb-10">

      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="mb-4">
        <h1 className="text-3xl font-semibold leading-tight" style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--ink)' }}>Ajustes</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--ink-3)' }}>Administra tu cuenta, finanzas y preferencias.</p>
      </div>

      {/* ── Navegación rápida por sección ───────────────────────── */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto scrollbar-none -mx-4 px-4 lg:mx-0 lg:px-0">
        {NAV_SECTIONS.map(s => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-opacity hover:opacity-80 flex-shrink-0"
            style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', color: 'var(--ink-2)' }}
          >
            {s.label}
          </a>
        ))}
      </div>

      {/* ── Grid desktop: izquierda (configuración) | derecha (navegación + datos) ── */}
      <div className="lg:grid lg:gap-6 lg:items-start space-y-6 lg:space-y-0" style={{ gridTemplateColumns: '3fr 2fr' }}>

        {/* ── Columna izquierda: lo que se configura ─────────────── */}
        <div className="space-y-6">

          {/* Perfil */}
          <section id="perfil" className="scroll-mt-6">
            <ProfileEditor
              userId={user.id}
              displayName={profile?.display_name ?? null}
              email={user.email ?? ''}
              avatarUrl={profile?.avatar_url ?? null}
            />
          </section>

          {/* Preferencias: personalización + apariencia */}
          <section id="preferencias" className="scroll-mt-6">
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
              <PaydaySelect userId={user.id} payday={profile?.payday ?? null} />
              <div className="card overflow-hidden">
                <div className="flex items-center gap-2 px-4 pt-3.5 pb-0">
                  <Palette className="w-4 h-4" style={{ color: '#7C3AED' }} />
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Apariencia</p>
                </div>
                <ThemeToggle />
              </div>
            </div>
          </section>

          {/* Notificaciones */}
          <section id="notificaciones" className="scroll-mt-6">
            <SectionHeader icon={Bell} label="Notificaciones por email" color="#2B7CF6" />
            <NotificationPrefs
              userId={user.id}
              notifyBilling={profile?.notify_billing ?? true}
              notifyBudget={profile?.notify_budget ?? true}
              notifyMonthly={profile?.notify_monthly ?? false}
              notifyRecurring={profile?.notify_recurring ?? true}
              budgetAlertPct={profile?.budget_alert_pct ?? 80}
              billingAlertDays={profile?.billing_alert_days ?? 2}
            />
          </section>
        </div>

        {/* ── Columna derecha: accesos y datos ───────────────────── */}
        <div className="space-y-6">

          {/* Finanzas (navegación) */}
          <section id="finanzas" className="scroll-mt-6">
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
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#F5F3FF' }}>
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

          {/* Datos */}
          <section id="datos" className="scroll-mt-6">
            <SectionHeader icon={Database} label="Datos" color="#2B7CF6" />
            <div className="card overflow-hidden divide-y" style={{ borderColor: 'var(--border)' }}>

              <div>
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

              <ImportCSV />

            </div>
          </section>

          {/* Cuenta */}
          <section id="cuenta" className="scroll-mt-6">
            <SectionHeader icon={Shield} label="Cuenta" color="#2B7CF6" />
            <div className="card overflow-hidden">
              {/* Email de la sesión */}
              <div className="flex items-center gap-4 px-4 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
                <div className="cat-icon-bg w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ '--cat-bg': '#EEF4FF', '--cat-color': '#2B7CF6' } as React.CSSProperties}>
                  <Mail className="w-5 h-5" style={{ color: '#2B7CF6' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{user.email}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>Sesión iniciada con este correo.</p>
                </div>
              </div>
              {/* Cerrar sesión */}
              <form action="/api/auth/signout" method="post" className="p-3">
                <button
                  type="submit"
                  className="logout-btn w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold text-red-500 rounded-2xl border hover:bg-red-50 dark:hover:bg-red-900/10 active:scale-[0.99] transition-all"
                >
                  <LogOut className="w-4 h-4" />
                  Cerrar sesión
                </button>
              </form>
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
