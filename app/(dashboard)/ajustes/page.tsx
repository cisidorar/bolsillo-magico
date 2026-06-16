import { createClient, getServerSession } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { monthName, isEmoji, formatCLP } from '@/lib/utils'
import { getCategoryIcon } from '@/lib/category-icons'
import ServiceLogo from '@/components/ServiceLogo'
import ProfileEditor from '@/components/ProfileEditor'
import Link from 'next/link'
import { ChevronRight, RefreshCw, Tag, CreditCard, Target, Download, Upload } from 'lucide-react'
import ImportCSV from '@/components/ImportCSV'

export const dynamic = 'force-dynamic'

export default async function AjustesPage() {
  const [user, supabase] = await Promise.all([getServerSession(), createClient()])
  if (!user) redirect('/login')

  const now   = new Date()
  const month = now.getMonth() + 1
  const year  = now.getFullYear()

  const [{ data: profile }, { data: categoryBudgets }, { data: categories }, { data: paymentMethods }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('category_budgets').select('amount').eq('user_id', user.id),
    supabase.from('categories').select('*').eq('user_id', user.id).order('sort_order'),
    supabase.from('payment_methods').select('*').eq('user_id', user.id).order('sort_order'),
  ])

  const totalBudget = (categoryBudgets ?? []).reduce((s, b) => s + b.amount, 0)

  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-10 space-y-6 lg:max-w-2xl">

      {/* ── Perfil ──────────────────────────────────────────────── */}
      <section>
        <SectionHeader label="Mi perfil" />
        <ProfileEditor
          userId={user.id}
          displayName={profile?.display_name ?? null}
          email={user.email ?? ''}
          avatarUrl={profile?.avatar_url ?? null}
        />
      </section>

      {/* ── Finanzas ────────────────────────────────────────────── */}
      <section>
        <SectionHeader label="Finanzas" />
        <div className="card overflow-hidden divide-y divide-gray-50">

          {/* Presupuesto */}
          <Link
            href="/presupuesto"
            className="flex items-center gap-4 px-4 py-4 hover:bg-gray-50/70 transition-colors group"
          >
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: '#EEF4FF' }}>
              <Target className="w-5 h-5" style={{ color: '#1B6DD4' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">Límite mensual</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {totalBudget > 0 ? `${monthName(month)} ${year}` : 'Sin presupuesto configurado'}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {totalBudget > 0 && (
                <span
                  className="text-xs font-bold px-2.5 py-1 rounded-lg"
                  style={{ background: '#EEF4FF', color: '#1B6DD4' }}
                >
                  {formatCLP(totalBudget)}
                </span>
              )}
              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-400 transition-colors" />
            </div>
          </Link>

          {/* Categorías */}
          <Link
            href="/categorias"
            className="flex items-center gap-4 px-4 py-4 hover:bg-gray-50/70 transition-colors group"
          >
            <div className="flex-shrink-0">
              {(categories ?? []).length > 0 ? (
                <div className="flex -space-x-2">
                  {(categories ?? []).slice(0, 4).map(c => (
                    <div
                      key={c.id}
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-sm ring-2 ring-white flex-shrink-0"
                      style={{ background: c.bg_color }}
                    >
                      {isEmoji(c.icon)
                        ? <span className="text-sm">{c.icon}</span>
                        : (() => { const Icon = getCategoryIcon(c.icon); return <Icon className="w-4 h-4" style={{ color: c.color }} /> })()
                      }
                    </div>
                  ))}
                </div>
              ) : (
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: '#F5F3FF' }}>
                  <Tag className="w-5 h-5" style={{ color: '#7C3AED' }} />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">Categorías</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {(categories ?? []).length > 0 ? `${(categories ?? []).length} categorías` : 'Sin categorías'}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-400 transition-colors flex-shrink-0" />
          </Link>

          {/* Métodos de pago */}
          <Link
            href="/metodos"
            className="flex items-center gap-4 px-4 py-4 hover:bg-gray-50/70 transition-colors group"
          >
            <div className="flex-shrink-0">
              {(paymentMethods ?? []).length > 0 ? (
                <div className="flex -space-x-2">
                  {(paymentMethods ?? []).slice(0, 4).map(m => (
                    <div key={m.id} className="ring-2 ring-white rounded-xl flex-shrink-0">
                      <ServiceLogo domain={m.domain} name={m.name} size={36} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: '#F0FDF4' }}>
                  <CreditCard className="w-5 h-5" style={{ color: '#16A34A' }} />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">Métodos de pago</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {(paymentMethods ?? []).length > 0 ? `${(paymentMethods ?? []).length} método${(paymentMethods ?? []).length !== 1 ? 's' : ''}` : 'Sin métodos'}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-400 transition-colors flex-shrink-0" />
          </Link>

          {/* Recurrentes */}
          <Link
            href="/recurrentes"
            className="flex items-center gap-4 px-4 py-4 hover:bg-gray-50/70 transition-colors group"
          >
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: '#F0FDFA' }}>
              <RefreshCw className="w-5 h-5" style={{ color: '#0D9488' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">Gastos recurrentes</p>
              <p className="text-xs text-gray-400 mt-0.5">Suscripciones y cobros fijos</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-400 transition-colors flex-shrink-0" />
          </Link>

        </div>
      </section>

      {/* ── Datos ───────────────────────────────────────────────── */}
      <section>
        <SectionHeader label="Datos" />
        <div className="card overflow-hidden divide-y divide-gray-50">

          <a
            href="/api/export"
            download
            className="flex items-center gap-4 px-4 py-4 hover:bg-gray-50/70 transition-colors group"
          >
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: '#F0FDF4' }}>
              <Download className="w-5 h-5" style={{ color: '#16A34A' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">Exportar gastos</p>
              <p className="text-xs text-gray-400 mt-0.5">Descarga todos tus gastos en CSV</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-400 transition-colors flex-shrink-0" />
          </a>

          <ImportCSV />

        </div>
      </section>

      {/* ── Cerrar sesión ───────────────────────────────────────── */}
      <section>
        <form action="/api/auth/signout" method="post">
          <button
            type="submit"
            className="w-full py-3.5 text-sm font-semibold text-red-500 rounded-2xl border border-red-100 hover:bg-red-50 hover:border-red-200 active:scale-[0.99] transition-all"
            style={{ background: 'rgba(254,242,242,0.6)' }}
          >
            Cerrar sesión
          </button>
        </form>
      </section>

    </div>
  )
}

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2.5 px-1">
      {label}
    </p>
  )
}
