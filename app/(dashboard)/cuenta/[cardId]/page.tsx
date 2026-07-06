import { createClient, getServerSession } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { formatCLP, currentStatementRange, billingPeriod, billingPeriodRange, type DateFormat } from '@/lib/utils'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import ServiceLogo from '@/components/ServiceLogo'
import StatementView from '@/components/StatementView'
import type { ExpenseWithRelations, PaymentMethod } from '@/types'

export const revalidate = 0

export default async function CuentaPage({ params }: { params: Promise<{ cardId: string }> }) {
  const { cardId } = await params
  const [user, supabase] = await Promise.all([getServerSession(), createClient()])
  if (!user) redirect('/login')

  // Fetch card
  const { data: cardData } = await supabase
    .from('payment_methods')
    .select('*')
    .eq('id', cardId)
    .eq('user_id', user.id)
    .single()

  if (!cardData || cardData.card_type !== 'credit') notFound()
  const card = cardData as PaymentMethod

  const { data: prefRow } = await supabase
    .from('profiles').select('date_format').eq('id', user.id).maybeSingle()
  const dateFormat = (prefRow?.date_format ?? 'DD/MM/AAAA') as DateFormat

  const billingDay = card.billing_day!
  const now        = new Date()

  // Período actual
  const current = currentStatementRange(billingDay)

  // Período anterior
  const prevStatementMonth = current.month === 1 ? 12 : current.month - 1
  const prevStatementYear  = current.month === 1 ? current.year - 1 : current.year
  const prev = billingPeriodRange(prevStatementMonth, prevStatementYear, billingDay)

  // Fetch expenses: período actual + anterior
  const fetchStart = prev.start

  const [{ data: expensesRaw }, { data: allCategories }, { data: allPaymentMethods }] = await Promise.all([
    supabase
      .from('expenses')
      .select('*, category:categories(*), payment_method:payment_methods(*), recurring_expense:recurring_expenses(id,name,domain)')
      .eq('user_id', user.id)
      .eq('payment_method_id', cardId)
      .gte('date', fetchStart)
      .lte('date', now.toISOString().split('T')[0])
      .order('date', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase.from('categories').select('*').eq('user_id', user.id).order('sort_order'),
    supabase.from('payment_methods').select('*').eq('user_id', user.id).order('sort_order'),
  ])

  const allExpenses = (expensesRaw ?? []) as ExpenseWithRelations[]

  // Separar en período actual vs anterior
  const currentExpenses = allExpenses.filter(e => {
    const bp = billingPeriod(e.date, billingDay)
    return bp.month === current.month && bp.year === current.year
  })
  const prevExpenses = allExpenses.filter(e => {
    const bp = billingPeriod(e.date, billingDay)
    return bp.month === prevStatementMonth && bp.year === prevStatementYear
  })

  const currentTotal = currentExpenses.reduce((s, e) => s + e.amount, 0)
  const prevTotal    = prevExpenses.reduce((s, e)    => s + e.amount, 0)
  const delta        = prevTotal > 0 ? Math.round(((currentTotal - prevTotal) / prevTotal) * 100) : null

  // Días restantes del período
  const today0  = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const close0  = new Date(current.end + 'T12:00:00')
  const close0d = new Date(close0.getFullYear(), close0.getMonth(), close0.getDate())
  const daysLeft = Math.round((close0d.getTime() - today0.getTime()) / 86_400_000)

  // Días del período total (para la barra)
  const open0  = new Date(current.start + 'T12:00:00')
  const open0d = new Date(open0.getFullYear(), open0.getMonth(), open0.getDate())
  const totalDays  = Math.round((close0d.getTime() - open0d.getTime()) / 86_400_000) + 1
  const daysUsed   = totalDays - daysLeft
  const periodPct  = Math.round((daysUsed / totalDays) * 100)

  // Resumen por categoría
  const byCat = currentExpenses.reduce<Record<string, {
    id: string; name: string; color: string; bg_color: string; total: number
  }>>((acc, e) => {
    if (!e.category) return acc
    const id = e.category.id
    if (!acc[id]) acc[id] = { id, name: e.category.name, color: e.category.color, bg_color: e.category.bg_color, total: 0 }
    acc[id].total += e.amount
    return acc
  }, {})
  const catSummary = Object.values(byCat).sort((a, b) => b.total - a.total)

  const fmtDate = (s: string) =>
    new Date(s + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
  const fmtShort = (s: string) =>
    new Date(s + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })

  const daysLabel = daysLeft === 0 ? 'Cierra hoy'
    : daysLeft === 1 ? 'Cierra mañana'
    : daysLeft > 0   ? `Cierra en ${daysLeft} días`
    : 'Período cerrado'

  return (
    <div>
      {/* ── Hero header ───────────────────────────────────────────── */}
      <div className="hero-gradient relative overflow-hidden">
        {/* Back button */}
        <div className="px-4 lg:px-8 pt-4 pb-0">
          <Link
            href="/inicio"
            className="inline-flex items-center gap-1.5 text-white/70 hover:text-white text-sm font-semibold transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Inicio
          </Link>
        </div>

        <div className="px-4 lg:px-8 pt-4 pb-7">
          <div className="flex items-start gap-4">
            <ServiceLogo
              domain={card.domain}
              name={card.name}
              size={52}
              className="flex-shrink-0 rounded-2xl shadow-lg"
            />
            <div className="flex-1 min-w-0">
              <p className="text-white/60 text-xs font-semibold uppercase tracking-widest mb-0.5">
                Estado de cuenta
              </p>
              <h1 className="text-xl font-extrabold text-white leading-tight truncate">
                {card.name}
              </h1>
              {card.last_four && (
                <p className="text-white/50 text-sm mt-0.5">···{card.last_four}</p>
              )}
            </div>
          </div>

          {/* Monto + período */}
          <div className="mt-5">
            <p className="text-white/55 text-[10px] font-bold uppercase tracking-widest mb-1">
              Acumulado período actual
            </p>
            <p className="text-white font-extrabold leading-none" style={{ fontSize: 'clamp(32px, 8vw, 48px)' }}>
              {formatCLP(currentTotal)}
            </p>
            <p className="text-white/50 text-xs mt-1.5">
              {fmtShort(current.start)} – {fmtShort(current.end)}
              {card.billing_day && (
                <span className="ml-2 text-white/40">· Corte día {card.billing_day}</span>
              )}
            </p>

            {/* Comparación vs anterior */}
            {delta !== null && prevTotal > 0 && (
              <div className="mt-2.5 inline-flex items-center gap-1.5 bg-white/15 rounded-xl px-2.5 py-1.5">
                <span className={`text-[10px] font-bold ${delta <= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                  {delta <= 0 ? '↓' : '↑'} {Math.abs(delta)}%{' '}
                  {delta <= 0 ? 'menos' : 'más'} que el período anterior
                </span>
                <span className="text-[10px] text-white/35">({formatCLP(prevTotal)})</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Contenido ─────────────────────────────────────────────── */}
      <div className="px-4 lg:px-8 pt-5 pb-8 lg:grid lg:grid-cols-[1fr_340px] lg:gap-6 lg:items-start space-y-4 lg:space-y-0">

        {/* Columna principal */}
        <div className="space-y-4">

          {/* Tarjeta de período */}
          <div className="card p-4 space-y-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Período de facturación</p>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-2xl p-3">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Apertura</p>
                <p className="text-sm font-bold text-gray-800">{fmtDate(current.start)}</p>
              </div>
              <div className="bg-gray-50 rounded-2xl p-3">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Cierre</p>
                <p className="text-sm font-bold text-gray-800">{fmtDate(current.end)}</p>
              </div>
            </div>

            {/* Barra de avance del período */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-[10px] font-semibold text-gray-400">
                  Día {daysUsed} de {totalDays}
                </span>
                <span className={`text-[10px] font-bold ${daysLeft <= 3 && daysLeft >= 0 ? 'text-amber-500' : 'text-gray-400'}`}>
                  {daysLabel}
                </span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, periodPct)}%`,
                    backgroundColor: daysLeft <= 3 && daysLeft >= 0 ? '#F59E0B' : 'var(--primary)',
                  }}
                />
              </div>
            </div>

            {/* Stats rápidos */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              {[
                { label: 'Transacciones', value: String(currentExpenses.length) },
                { label: 'Promedio', value: currentExpenses.length > 0 ? formatCLP(Math.round(currentTotal / currentExpenses.length)) : '–' },
                { label: 'Período anterior', value: prevTotal > 0 ? formatCLP(prevTotal) : 'Sin datos' },
              ].map(s => (
                <div key={s.label} className="text-center bg-gray-50 rounded-2xl p-2.5">
                  <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide leading-tight mb-1">{s.label}</p>
                  <p className="text-xs font-extrabold text-gray-800 tabular-nums leading-tight">{s.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Lista de gastos */}
          <StatementView
            expenses={currentExpenses}
            categories={allCategories ?? []}
            paymentMethods={allPaymentMethods ?? []}
            dateFormat={dateFormat}
          />

        </div>

        {/* Columna lateral */}
        <div className="space-y-4">

          {/* Desglose por categoría */}
          {catSummary.length > 0 && (
            <div className="card p-4 space-y-3">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Por categoría</p>
              <div className="space-y-2.5">
                {catSummary.map(c => {
                  const pct = currentTotal > 0 ? Math.round((c.total / currentTotal) * 100) : 0
                  return (
                    <div key={c.id}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
                          <span className="text-xs font-semibold text-gray-700 truncate">{c.name}</span>
                        </div>
                        <div className="text-right flex-shrink-0 ml-2">
                          <span className="text-xs font-bold text-gray-900 tabular-nums">{formatCLP(c.total)}</span>
                          <span className="text-[10px] text-gray-400 ml-1.5">{pct}%</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, backgroundColor: c.color }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Info de la tarjeta */}
          <div className="card p-4 space-y-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Datos de la tarjeta</p>
            <div className="space-y-2">
              {[
                { label: 'Tipo', value: 'Crédito' },
                { label: 'Día de corte', value: `Día ${card.billing_day}` },
                ...(card.last_four ? [{ label: 'Terminación', value: `···${card.last_four}` }] : []),
              ].map(item => (
                <div key={item.label} className="flex justify-between items-center py-1.5 border-b border-gray-50 last:border-0">
                  <span className="text-xs text-gray-400 font-medium">{item.label}</span>
                  <span className="text-xs font-bold text-gray-800">{item.value}</span>
                </div>
              ))}
            </div>
            <Link
              href={`/metodos`}
              className="block text-center text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors pt-1"
            >
              Editar tarjeta →
            </Link>
          </div>

        </div>
      </div>
    </div>
  )
}
