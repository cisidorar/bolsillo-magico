import { createClient, getServerSession } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { monthName, isEmoji, formatCLP } from '@/lib/utils'
import { getCategoryIcon } from '@/lib/category-icons'
import ServiceLogo from '@/components/ServiceLogo'
import ProfileEditor from '@/components/ProfileEditor'
import Link from 'next/link'
import { ChevronRight, RefreshCw, Tag, CreditCard, Target, Download } from 'lucide-react'
import ImportCSV from '@/components/ImportCSV'

export const dynamic = 'force-dynamic'

export default async function AjustesPage() {
  const [user, supabase] = await Promise.all([getServerSession(), createClient()])
  if (!user) redirect('/login')

  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()

  const [{ data: profile }, { data: categoryBudgets }, { data: categories }, { data: paymentMethods }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('category_budgets').select('amount').eq('user_id', user.id),
    supabase.from('categories').select('*').eq('user_id', user.id).order('sort_order'),
    supabase.from('payment_methods').select('*').eq('user_id', user.id).order('sort_order'),
  ])

  const totalBudget = (categoryBudgets ?? []).reduce((s, b) => s + b.amount, 0)

  return (
    <div className="px-4 pt-6 pb-8 space-y-5">
      <h1 className="text-xl font-bold text-brand-900">Ajustes</h1>

      {/* ── Perfil ──────────────────────────────────────────────── */}
      <ProfileEditor
        userId={user.id}
        displayName={profile?.display_name ?? null}
        email={user.email ?? ''}
        avatarUrl={profile?.avatar_url ?? null}
      />

      {/* ── Presupuesto ─────────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-bold text-gray-600 mb-3">
          Presupuesto · {monthName(month)} {year}
        </h2>
        <Link href="/presupuesto" className="card block hover:bg-brand-50 transition-colors">
          <div className="flex items-center justify-between px-4 py-3.5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
                <Target className="w-4 h-4 text-brand-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Límite mensual</p>
                <p className="text-xs text-gray-400">
                  {totalBudget > 0 ? 'Calculado desde tus categorías' : 'Sin presupuesto configurado'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {totalBudget > 0 && (
                <span className="text-sm font-bold text-brand-900">{formatCLP(totalBudget)}</span>
              )}
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </div>
          </div>
        </Link>
      </div>

      {/* ── Personalización ─────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-bold text-gray-600 mb-3">Personalización</h2>
        <div className="card divide-y divide-brand-100">

          <Link href="/categorias" className="flex items-center justify-between px-4 py-3.5 hover:bg-brand-50 transition-colors">
            <div className="flex items-center gap-3">
              {(categories ?? []).length > 0 ? (
                <div className="flex -space-x-1.5">
                  {(categories ?? []).slice(0, 4).map(c => (
                    <div
                      key={c.id}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-sm ring-2 ring-white flex-shrink-0"
                      style={{ background: c.bg_color }}
                    >
                      {isEmoji(c.icon)
                        ? c.icon
                        : (() => { const Icon = getCategoryIcon(c.icon); return <Icon className="w-4 h-4" style={{ color: c.color }} /> })()
                      }
                    </div>
                  ))}
                </div>
              ) : (
                <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center">
                  <Tag className="w-4 h-4 text-brand-600" />
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-gray-900">Categorías</p>
                <p className="text-xs text-gray-400">{(categories ?? []).length} categorías</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </Link>

          <Link href="/metodos" className="flex items-center justify-between px-4 py-3.5 hover:bg-brand-50 transition-colors">
            <div className="flex items-center gap-3">
              {(paymentMethods ?? []).length > 0 ? (
                <div className="flex -space-x-1.5">
                  {(paymentMethods ?? []).slice(0, 4).map(m => (
                    <div key={m.id} className="ring-2 ring-white rounded-xl flex-shrink-0">
                      <ServiceLogo
                        domain={m.domain}
                        name={m.name}
                        size={32}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center">
                  <CreditCard className="w-4 h-4 text-brand-600" />
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-gray-900">Métodos de pago</p>
                <p className="text-xs text-gray-400">{(paymentMethods ?? []).length} métodos</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </Link>

          <Link href="/recurrentes" className="flex items-center justify-between px-4 py-3.5 hover:bg-brand-50 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center">
                <RefreshCw className="w-4 h-4 text-teal-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Gastos recurrentes</p>
                <p className="text-xs text-gray-400">Suscripciones y cobros fijos</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </Link>

        </div>
      </div>

      {/* ── Datos ───────────────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-bold text-gray-600 mb-3">Datos</h2>
        <div className="card divide-y divide-brand-100">
          <a
            href="/api/export"
            download
            className="flex items-center justify-between px-4 py-3.5 hover:bg-brand-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                <Download className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Exportar gastos</p>
                <p className="text-xs text-gray-400">Descarga todos tus gastos en CSV</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </a>
          <ImportCSV />
        </div>
      </div>

      {/* ── Cerrar sesión ───────────────────────────────────────── */}
      <form action="/api/auth/signout" method="post">
        <button
          type="submit"
          className="w-full py-3 text-sm font-semibold text-red-600 bg-white border border-red-100 rounded-xl hover:bg-red-50 transition-colors"
        >
          Cerrar sesión
        </button>
      </form>
    </div>
  )
}
