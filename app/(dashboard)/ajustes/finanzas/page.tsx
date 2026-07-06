import React from 'react'
import Link from 'next/link'
import { createClient, getServerSession } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { isEmoji } from '@/lib/utils'
import { getCategoryIcon } from '@/lib/category-icons'
import ServiceLogo from '@/components/ServiceLogo'
import { ChevronRight, Tag, CreditCard, Target, Wallet, TrendingUp, RefreshCw } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function FinanzasPage() {
  const [user, supabase] = await Promise.all([getServerSession(), createClient()])
  if (!user) redirect('/login')

  const [{ data: categories }, { data: paymentMethods }] = await Promise.all([
    supabase.from('categories').select('*').eq('user_id', user.id).order('sort_order'),
    supabase.from('payment_methods').select('*').eq('user_id', user.id).order('sort_order'),
  ])

  return (
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
