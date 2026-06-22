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
  Download, Database, Shield, Coins, LogOut, Palette,
  type LucideIcon,
} from 'lucide-react'
import ImportCSV from '@/components/ImportCSV'
import ThemeToggle from '@/components/ThemeToggle'

export const dynamic = 'force-dynamic'

export default async function AjustesPage() {
  const [user, supabase] = await Promise.all([getServerSession(), createClient()])
  if (!user) redirect('/login')

  const [{ data: profile }, { data: categories }, { data: paymentMethods }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('categories').select('*').eq('user_id', user.id).order('sort_order'),
    supabase.from('payment_methods').select('*').eq('user_id', user.id).order('sort_order'),
  ])

  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-10">

      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-brand-900">Ajustes</h1>
        <p className="text-sm text-gray-400 mt-0.5">Administra tu cuenta, finanzas y preferencias.</p>
      </div>

      {/* ── Grid desktop: izquierda (Perfil + Finanzas) | derecha (Datos + Cuenta) ── */}
      <div className="lg:grid lg:gap-6 lg:items-start space-y-6 lg:space-y-0" style={{ gridTemplateColumns: '3fr 2fr' }}>

        {/* ── Columna izquierda ──────────────────────────────────── */}
        <div className="space-y-6">

          {/* Perfil */}
          <ProfileEditor
            userId={user.id}
            displayName={profile?.display_name ?? null}
            email={user.email ?? ''}
            avatarUrl={profile?.avatar_url ?? null}
          />

          {/* Finanzas */}
          <section>
            <SectionHeader icon={Coins} label="Finanzas" color="#F59E0B" />
            <div className="card overflow-hidden divide-y divide-gray-50">

              <SettingsRow
                href="/presupuesto"
                icon={
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#EEF4FF' }}>
                    <Target className="w-5 h-5" style={{ color: '#1B6DD4' }} />
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
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#F0FDF4' }}>
                        <CreditCard className="w-5 h-5" style={{ color: '#16A34A' }} />
                      </div>
                    )}
                  </div>
                }
                title="Métodos de pago"
                subtitle="Administra tus cuentas y tarjetas."
              />

              <SettingsRow
                href="/recurrentes"
                icon={
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#F0FDFA' }}>
                    <RefreshCw className="w-5 h-5" style={{ color: '#0D9488' }} />
                  </div>
                }
                title="Gastos recurrentes"
                subtitle="Gestiona suscripciones y cobros fijos."
              />

            </div>
          </section>
        </div>

        {/* ── Columna derecha ────────────────────────────────────── */}
        <div className="space-y-6">

          {/* Apariencia */}
          <section>
            <SectionHeader icon={Palette} label="Apariencia" color="#7C3AED" />
            <div className="card overflow-hidden">
              <ThemeToggle />
            </div>
          </section>

          {/* Datos */}
          <section>
            <SectionHeader icon={Database} label="Datos" color="#1B6DD4" />
            <div className="card overflow-hidden divide-y divide-gray-50">

              <a
                href="/api/export"
                download
                className="flex items-center gap-4 px-4 py-4 hover:bg-gray-50/70 transition-colors group"
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#F0FDF4' }}>
                  <Download className="w-5 h-5" style={{ color: '#16A34A' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">Exportar gastos</p>
                  <p className="text-xs text-gray-400 mt-0.5">Descarga todos tus gastos en CSV.</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-400 transition-colors flex-shrink-0" />
              </a>

              <ImportCSV />

            </div>
          </section>

          {/* Cuenta */}
          <section>
            <SectionHeader icon={Shield} label="Cuenta" color="#1B6DD4" />
            <form action="/api/auth/signout" method="post">
              <button
                type="submit"
                className="logout-btn w-full flex items-center justify-center gap-2 py-3.5 text-sm font-semibold text-red-500 rounded-2xl border hover:bg-red-50 dark:hover:bg-red-900/10 active:scale-[0.99] transition-all"
              >
                <LogOut className="w-4 h-4" />
                Cerrar sesión
              </button>
            </form>
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
      <p className="text-sm font-bold text-gray-700">{label}</p>
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
      className="flex items-center gap-4 px-4 py-4 hover:bg-gray-50/70 transition-colors group"
    >
      {icon}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-400 transition-colors flex-shrink-0" />
    </Link>
  )
}
