import Image from 'next/image'
import { createClient, getServerSession } from '@/lib/supabase/server'
import { formatCLP, monthName, pct, isEmoji, currentStatementRange, billingPeriod } from '@/lib/utils'
import { getCategoryIcon } from '@/lib/category-icons'
import { Sparkles, CreditCard } from 'lucide-react'
import ExpenseSheet from '@/components/ExpenseSheet'
import ExpenseList from '@/components/ExpenseList'
import RecurringWidget from '@/components/RecurringWidget'
import ServiceLogo from '@/components/ServiceLogo'
import Link from 'next/link'
import type { ExpenseWithRelations, RecurringExpense, CategoryBudget, PaymentMethod } from '@/types'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const [user, supabase] = await Promise.all([getServerSession(), createClient()])

  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()

  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear  = month === 12 ? year + 1 : year
  const monthStr  = String(month).padStart(2, '0')

  // Para el widget de estado de cuenta, necesitamos 2 meses de historia
  // (el estado puede incluir gastos del mes anterior al corte)
  const twoMonthsAgo = new Date(year, now.getMonth() - 2, 1)
  const statementFetchStart = twoMonthsAgo.toISOString().split('T')[0]

  const [
    { data: expenses },
    { data: budget },
    { data: categories },
    { data: paymentMethods },
    { data: recurring },
    { data: categoryBudgets },
    { data: profile },
    { data: allRecurringExpenses },
    { data: statementExpenses },
  ] = await Promise.all([
    supabase
      .from('expenses')
      .select('*, category:categories(*), payment_method:payment_methods(*), recurring_expense:recurring_expenses(id,name,domain)')
      .eq('user_id', user!.id)
      .gte('date', `${year}-${monthStr}-01`)
      .lt('date',  `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase.from('budgets').select('amount')
      .eq('user_id', user!.id).eq('month', month).eq('year', year).maybeSingle(),
    supabase.from('categories').select('*').eq('user_id', user!.id).order('sort_order'),
    supabase.from('payment_methods').select('*').eq('user_id', user!.id).order('sort_order'),
    supabase
      .from('recurring_expenses')
      .select('*, category:categories(*), payment_method:payment_methods(*)')
      .eq('user_id', user!.id).eq('is_active', true).order('billing_day'),
    supabase.from('category_budgets').select('*').eq('user_id', user!.id),
    supabase.from('profiles').select('display_name').eq('id', user!.id).maybeSingle(),
    // Acotado a 10 años (suficiente para 120 cuotas)
    supabase
      .from('expenses')
      .select('recurring_expense_id')
      .eq('user_id', user!.id)
      .not('recurring_expense_id', 'is', null)
      .gte('date', `${year - 10}-01-01`),
    // Gastos de los últimos 2 meses para calcular estados de cuenta
    supabase
      .from('expenses')
      .select('amount, date, payment_method_id, payment_method:payment_methods(id, name, billing_day, card_type, domain)')
      .eq('user_id', user!.id)
      .gte('date', statementFetchStart)
      .lte('date', now.toISOString().split('T')[0]),
  ])

  // Derivar paid_installments desde expenses reales
  const paidMap = (allRecurringExpenses ?? []).reduce<Record<string, number>>((acc, e) => {
    if (e.recurring_expense_id) acc[e.recurring_expense_id] = (acc[e.recurring_expense_id] ?? 0) + 1
    return acc
  }, {})
  const recurringWithCounts = ((recurring ?? []) as RecurringExpense[]).map(r => ({
    ...r,
    paid_installments: r.total_installments ? (paidMap[r.id] ?? 0) : r.paid_installments,
  }))

  const typedExpenses = (expenses ?? []) as ExpenseWithRelations[]
  const total         = typedExpenses.reduce((s, e) => s + e.amount, 0)
  const budgetAmount  = budget?.amount ?? null
  const progressPct   = budgetAmount ? pct(total, budgetAmount) : 0
  const isOver        = budgetAmount ? total > budgetAmount : false

  const registeredRecurringIds = typedExpenses
    .filter(e => e.recurring_expense_id != null)
    .map(e => e.recurring_expense_id as string)

  const catBudgetMap = new Map(
    ((categoryBudgets ?? []) as CategoryBudget[]).map(b => [b.category_id, b.amount])
  )

  // Resumen por categoría (top 6 en desktop, top 4 en mobile)
  const byCat = typedExpenses.reduce<Record<string, {
    id: string; name: string; color: string; bg_color: string; icon: string; total: number
  }>>((acc, e) => {
    if (!e.category) return acc
    const id = e.category.id
    if (!acc[id]) acc[id] = { id, name: e.category.name, color: e.category.color, bg_color: e.category.bg_color, icon: e.category.icon, total: 0 }
    acc[id].total += e.amount
    return acc
  }, {})
  const catSummary = Object.values(byCat).sort((a, b) => b.total - a.total).slice(0, 6)

  // Saludo contextual
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'
  const rawName = profile?.display_name ?? user!.email ?? ''
  const displayName = rawName.includes('@') ? rawName.split('@')[0] : rawName

  // Indicadores financieros
  const daysElapsed = now.getDate()
  const daysInMonth = new Date(year, month, 0).getDate()
  const dailyAvg    = daysElapsed > 0 ? Math.round(total / daysElapsed) : 0
  const projection  = Math.round(dailyAvg * daysInMonth)

  // Gasto de esta semana (lunes a hoy)
  const daysFromMonday = (now.getDay() + 6) % 7
  const monday = new Date(now); monday.setDate(now.getDate() - daysFromMonday)
  const mondayStr = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
  const weekTotal = typedExpenses.filter(e => e.date >= mondayStr).reduce((s, e) => s + e.amount, 0)

  // ── Calcular estado de cuenta por tarjeta de crédito ─────────────────────
  const creditCards = ((paymentMethods ?? []) as PaymentMethod[])
    .filter(pm => pm.card_type === 'credit' && pm.billing_day)

  type StatementCard = {
    id: string
    name: string
    domain: string | null
    billingDay: number
    statementMonth: number
    statementYear: number
    closesOn: string
    total: number
    count: number
  }

  const statementCards: StatementCard[] = creditCards.map(card => {
    const range   = currentStatementRange(card.billing_day!)
    const inRange = (statementExpenses ?? []).filter(e => {
      if (e.payment_method_id !== card.id) return false
      const bp = billingPeriod(e.date, card.billing_day!)
      return bp.month === range.month && bp.year === range.year
    })
    return {
      id:             card.id,
      name:           card.name,
      domain:         card.domain,
      billingDay:     card.billing_day!,
      statementMonth: range.month,
      statementYear:  range.year,
      closesOn:       range.end,
      total:          inRange.reduce((s: number, e: { amount: number }) => s + e.amount, 0),
      count:          inRange.length,
    }
  }).filter(c => c.count > 0) // solo mostrar tarjetas con gastos en el estado actual

  return (
    <>
      {/* ── Responsive shell: single col mobile, 2-col desktop ──────── */}
      <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-2 lg:grid lg:grid-cols-[3fr,2fr] lg:gap-6 lg:items-start">

        {/* ══ LEFT COLUMN ══════════════════════════════════════════════ */}
        <div className="space-y-4">

          {/* ── Hero card ─────────────────────────────────────────────── */}
          <div className="hero-gradient rounded-3xl p-6 lg:p-5 text-white overflow-hidden relative">
            <div className="relative">
              {/* Bell logo */}
              <div className="absolute top-0 right-0 w-12 h-12 opacity-80">
                <Image src="/camapana.png" alt="" fill style={{ objectFit: 'contain' }} />
              </div>

              {/* Saludo + mes (una línea en desktop) */}
              <div className="flex items-baseline gap-2 mb-3 lg:mb-2">
                <p className="text-sm text-white font-bold">
                  {greeting}, {displayName} 👋
                </p>
                <p className="text-xs text-white/55 font-medium hidden lg:block">
                  · {monthName(month)} {year}
                </p>
              </div>
              <p className="text-xs text-white/55 font-medium mb-3 lg:hidden">
                {monthName(month)} {year}
              </p>

              {/* Monto principal */}
              <p className="text-[10px] text-white/80 font-semibold mb-1 uppercase tracking-wide">Gastado este mes</p>
              <p className="font-extrabold text-white tracking-tight leading-none" style={{ fontSize: 'clamp(26px, 7vw, 40px)' }}>
                {formatCLP(total)}
              </p>

              {/* Barra de presupuesto */}
              {budgetAmount && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-white/70 mb-1.5 font-medium">
                    <span>{isOver ? 'Sobre el presupuesto' : `Quedan ${formatCLP(budgetAmount - total)}`}</span>
                    <span>{formatCLP(budgetAmount)}</span>
                  </div>
                  <div className="h-2 bg-white/15 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${isOver ? 'bg-red-400' : progressPct >= 80 ? 'bg-amber-300' : 'bg-white/80'}`}
                      style={{ width: `${Math.min(100, progressPct)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Stats chips — 2 en mobile, 3 en desktop */}
              <div className="flex gap-2 mt-5">
                <div className="flex-1 bg-white/15 rounded-2xl px-3 py-3">
                  <p className="text-[10px] text-white/65 font-semibold mb-1">Por día</p>
                  <p className="font-extrabold text-white tabular-nums leading-none" style={{ fontSize: 'clamp(13px, 4vw, 20px)' }}>
                    {daysElapsed > 0 && total > 0 ? formatCLP(dailyAvg) : '–'}
                  </p>
                </div>
                <div className="flex-1 bg-white/15 rounded-2xl px-3 py-3">
                  <p className="text-[10px] text-white/65 font-semibold mb-1">Esta semana</p>
                  <p className="font-extrabold text-white tabular-nums leading-none" style={{ fontSize: 'clamp(13px, 4vw, 20px)' }}>
                    {weekTotal > 0 ? formatCLP(weekTotal) : '–'}
                  </p>
                </div>
                <div className="flex-1 bg-white/15 rounded-2xl px-3 py-3">
                  <p className="text-[10px] text-white/65 font-semibold mb-1">Proyección</p>
                  <p className={`font-extrabold tabular-nums leading-none ${budgetAmount && projection > budgetAmount ? 'text-red-300' : 'text-white'}`} style={{ fontSize: 'clamp(13px, 4vw, 20px)' }}>
                    {total > 0 ? formatCLP(projection) : '–'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Estados de cuenta tarjetas de crédito ─────────────────── */}
          {statementCards.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <h2 className="text-sm font-bold text-gray-600 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-indigo-500" />
                  Estado de cuenta
                </h2>
                <Link href="/historial?view=billing" className="text-sm font-semibold text-brand-600 hover:text-brand-700 transition-colors">
                  Ver detalle
                </Link>
              </div>
              <div className="card divide-y divide-gray-50 overflow-hidden">
                {statementCards.map(card => {
                  const closeDate = new Date(card.closesOn + 'T12:00:00')
                  const closesLabel = closeDate.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
                  const statementLabel = `${monthName(card.statementMonth).slice(0,3)} ${card.statementYear !== year ? card.statementYear : ''}`
                  return (
                    <div key={card.id} className="flex items-center gap-3 px-4 py-3.5">
                      <ServiceLogo domain={card.domain} name={card.name} size={36} className="flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{card.name}</p>
                        <p className="text-xs text-gray-400">
                          Estado {statementLabel.trim()} · cierra {closesLabel}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-gray-900 tabular-nums">{formatCLP(card.total)}</p>
                        <p className="text-[10px] text-gray-400">{card.count} compra{card.count !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Categorías ────────────────────────────────────────────── */}
          {catSummary.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <h2 className="text-sm font-bold text-gray-600">Por categoría</h2>
                <Link href="/analisis" className="text-sm font-semibold text-brand-600 hover:text-brand-700 transition-colors">Ver más</Link>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
                {catSummary.map(c => {
                  const limit   = catBudgetMap.get(c.id) ?? null
                  const catPct  = limit ? Math.min(100, Math.round((c.total / limit) * 100)) : null
                  const over    = limit ? c.total > limit : false
                  const barColor = over ? '#EF4444' : catPct !== null && catPct >= 80 ? '#F59E0B' : c.color
                  return (
                    <div key={c.id} className="card p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div
                          className="w-10 h-10 rounded-2xl flex items-center justify-center text-base flex-shrink-0"
                          style={{ backgroundColor: c.bg_color }}
                        >
                          {isEmoji(c.icon)
                            ? <span className="text-lg">{c.icon}</span>
                            : (() => { const Icon = getCategoryIcon(c.icon); return <Icon className="w-5 h-5" style={{ color: c.color }} /> })()
                          }
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-gray-400 truncate">{c.name}</p>
                          <p className="text-base font-extrabold text-gray-900 tabular-nums leading-tight">
                            {formatCLP(c.total)}
                          </p>
                        </div>
                      </div>
                      {limit ? (
                        <>
                          <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: `${barColor}20` }}>
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${catPct}%`, backgroundColor: barColor }}
                            />
                          </div>
                          <p className={`text-[10px] mt-1 font-medium ${over ? 'text-red-500' : 'text-gray-400'}`}>
                            {over ? `+${formatCLP(c.total - limit)}` : `${formatCLP(limit - c.total)} restante`}
                          </p>
                        </>
                      ) : (
                        <div className="h-1.5 rounded-full overflow-hidden bg-brand-100">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${pct(c.total, total)}%`, backgroundColor: c.color }}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

        </div>
        {/* ══ END LEFT COLUMN ══════════════════════════════════════════ */}

        {/* ══ RIGHT COLUMN (desktop) / continuation (mobile) ══════════ */}
        <div className="space-y-4 mt-4 lg:mt-0">

          {/* ── Recurrentes ───────────────────────────────────────────── */}
          {recurringWithCounts.length > 0 && (
            <RecurringWidget
              recurring={recurringWithCounts}
              registeredIds={registeredRecurringIds}
              userId={user!.id}
              month={month}
              year={year}
            />
          )}

          {/* ── Últimos gastos ────────────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h2 className="text-sm font-bold text-gray-600">
                Últimos gastos
                {typedExpenses.length > 0 && (
                  <span className="ml-1.5 text-[10px] font-bold text-gray-400 bg-gray-100 rounded-full px-1.5 py-0.5">
                    {typedExpenses.length}
                  </span>
                )}
              </h2>
              <Link href="/historial" className="text-sm font-semibold text-brand-600 hover:text-brand-700 transition-colors">
                Ver todos
              </Link>
            </div>

            {typedExpenses.length === 0 ? (
              <div className="card text-center py-14 flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-2xl bg-brand-50 flex items-center justify-center mb-1">
                  <Sparkles className="w-6 h-6 text-brand-400" />
                </div>
                <p className="text-sm font-bold text-gray-600">Sin gastos este mes</p>
                <p className="text-xs text-gray-400">Toca + para agregar el primero</p>
              </div>
            ) : (
              <ExpenseList expenses={typedExpenses.slice(0, 10)} />
            )}
          </div>

        </div>
        {/* ══ END RIGHT COLUMN ═════════════════════════════════════════ */}

      </div>

      <ExpenseSheet
        categories={categories ?? []}
        paymentMethods={paymentMethods ?? []}
      />
    </>
  )
}
