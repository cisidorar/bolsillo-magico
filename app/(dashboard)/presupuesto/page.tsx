import React from 'react'
import { createClient, getServerSession } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CategoryBudgetManager from '@/components/CategoryBudgetManager'
import MonthlyBudgetInput from '@/components/MonthlyBudgetInput'
import { formatCLP, billingPeriod, billingPeriodRange, getNowChile, monthName } from '@/lib/utils'
import { PiggyBank, Target, RefreshCw } from 'lucide-react'
import type { CategoryBudget } from '@/types'

export const dynamic = 'force-dynamic'

export default async function PresupuestoPage() {
  const [user, supabase] = await Promise.all([getServerSession(), createClient()])
  if (!user) redirect('/login')

  const { now, year, month } = getNowChile()

  // Buscar la tarjeta de crédito default para calcular el período de facturación anterior
  const { data: defaultCard } = await supabase
    .from('payment_methods')
    .select('billing_day')
    .eq('user_id', user.id)
    .eq('card_type', 'credit')
    .not('billing_day', 'is', null)
    .order('is_default', { ascending: false })
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle()

  // Calcular el rango de fechas del período anterior:
  // Si hay tarjeta de crédito → usar el período de facturación anterior
  // Si no → usar el mes calendario anterior
  let fetchStart: string
  let fetchEnd: string

  if (defaultCard?.billing_day) {
    const billingDay = defaultCard.billing_day as number
    // Período actual de facturación
    const currentBp = billingPeriod(now.toISOString().slice(0, 10), billingDay)
    // Período anterior
    const prevBpMonth = currentBp.month === 1 ? 12 : currentBp.month - 1
    const prevBpYear  = currentBp.month === 1 ? currentBp.year - 1 : currentBp.year
    const prevRange   = billingPeriodRange(prevBpMonth, prevBpYear, billingDay)
    fetchStart = prevRange.start
    fetchEnd   = prevRange.end
  } else {
    // Mes calendario anterior
    const prevMonth    = month === 1 ? 12 : month - 1
    const prevYear     = month === 1 ? year - 1 : year
    const prevMonthKey = String(prevMonth).padStart(2, '0')
    const nextOfPrev   = prevMonth === 12 ? 1 : prevMonth + 1
    const nextYearOfPrev = prevMonth === 12 ? prevYear + 1 : prevYear
    fetchStart = `${prevYear}-${prevMonthKey}-01`
    fetchEnd   = `${nextYearOfPrev}-${String(nextOfPrev).padStart(2, '0')}-01`
  }

  const [{ data: categories }, { data: budgets }, { data: lastPeriodExpenses }, { data: recurring }, { data: monthlyBudget }] = await Promise.all([
    supabase.from('categories').select('*').eq('user_id', user.id).order('sort_order'),
    supabase.from('category_budgets').select('*').eq('user_id', user.id),
    supabase
      .from('expenses')
      .select('category_id, amount, date')
      .eq('user_id', user.id)
      .gte('date', fetchStart)
      .lte('date', fetchEnd),
    supabase
      .from('recurring_expenses')
      .select('category_id, amount, billing_month, total_installments, paid_installments')
      .eq('user_id', user.id)
      .eq('is_active', true),
    supabase.from('budgets').select('amount, month, year')
      .eq('user_id', user.id).order('year', { ascending: false }).order('month', { ascending: false }).limit(12),
  ])

  // Mapa de gasto por categoría del período anterior
  const spendingMap = new Map<string, number>()
  for (const e of lastPeriodExpenses ?? []) {
    if (!e.category_id) continue
    // Si hay tarjeta con billing_day, filtrar solo los gastos que pertenecen al período correcto
    if (defaultCard?.billing_day) {
      const bp = billingPeriod(e.date, defaultCard.billing_day as number)
      const currentBp = billingPeriod(now.toISOString().slice(0, 10), defaultCard.billing_day as number)
      const prevBpMonth = currentBp.month === 1 ? 12 : currentBp.month - 1
      const prevBpYear  = currentBp.month === 1 ? currentBp.year - 1 : currentBp.year
      if (bp.month !== prevBpMonth || bp.year !== prevBpYear) continue
    }
    spendingMap.set(e.category_id, (spendingMap.get(e.category_id) ?? 0) + e.amount)
  }

  // Mapa de recurrentes activos por categoría
  const recurringByCategory: Record<string, number> = {}
  for (const r of recurring ?? []) {
    if (r.category_id) {
      recurringByCategory[r.category_id] = (recurringByCategory[r.category_id] ?? 0) + r.amount
    }
  }
  const totalRecurring = Object.values(recurringByCategory).reduce((s, v) => s + v, 0)

  // Piso comprometido de ESTE mes: fijos indefinidos + cuotas vigentes + anuales del mes.
  // Un límite menor que esto es imposible de cumplir desde el día 1.
  type RecLite = { amount: number; billing_month: number | null; total_installments: number | null; paid_installments: number | null }
  const committedFloor = ((recurring ?? []) as RecLite[]).reduce((s, r) => {
    if (r.total_installments != null) {
      const remaining = r.total_installments - (r.paid_installments ?? 0)
      return remaining > 0 ? s + r.amount : s
    }
    if (r.billing_month != null) return r.billing_month === month ? s + r.amount : s
    return s + r.amount
  }, 0)

  // Ordenar categorías de mayor a menor gasto del mes pasado
  const sortedCategories = [...(categories ?? [])].sort(
    (a, b) => (spendingMap.get(b.id) ?? 0) - (spendingMap.get(a.id) ?? 0)
  )

  const typedBudgets = (budgets ?? []) as CategoryBudget[]
  const totalBudgeted = typedBudgets.reduce((s, b) => s + b.amount, 0)
  const budgetsWithLimit = typedBudgets.length
  const totalCategories = sortedCategories.length

  // Presupuesto mensual: usar el del mes actual o el más reciente como default
  type BudgetRow = { amount: number; month: number; year: number }
  const allMonthlyBudgets = (monthlyBudget ?? []) as BudgetRow[]
  const thisMonthBudget = allMonthlyBudgets.find(b => b.month === month && b.year === year)
  const defaultBudgetAmount = thisMonthBudget?.amount ?? allMonthlyBudgets[0]?.amount ?? null
  const budgetBelowFloor = defaultBudgetAmount !== null && committedFloor > 0 && defaultBudgetAmount < committedFloor

  const monthLabelCap = monthName(month).charAt(0).toUpperCase() + monthName(month).slice(1) + ' ' + year

  return (
    <div className="px-4 lg:px-8 pt-2 lg:pt-8 pb-8">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-brand-900">Presupuesto — {monthLabelCap}</h1>
        <p className="text-sm text-gray-400 mt-1">
          Los límites aplican solo a este mes y se renuevan cada mes.
        </p>
      </div>

      {/* Presupuesto mensual total */}
      <MonthlyBudgetInput
        userId={user.id}
        month={month}
        year={year}
        currentAmount={defaultBudgetAmount}
        monthLabel={monthLabelCap}
      />

      {/* Piso comprometido: fijos + cuotas del mes que el límite debe cubrir sí o sí */}
      {committedFloor > 0 && (
        budgetBelowFloor ? (
          <div className="card p-4 mb-5 flex items-start gap-3"
            style={{ background: 'rgba(255,111,97,0.08)', border: '1.5px solid rgba(255,111,97,0.25)' }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(255,111,97,0.15)' }}>
              <RefreshCw className="w-4 h-4" style={{ color: 'var(--coral)' }} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold" style={{ color: 'var(--coral)' }}>
                Tu límite no alcanza para tus gastos fijos
              </p>
              <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--ink-2)' }}>
                Solo en fijos y cuotas este mes ya tienes comprometidos{' '}
                <span className="font-bold tabular-nums">{formatCLP(committedFloor)}</span>, pero tu límite es{' '}
                <span className="font-bold tabular-nums">{formatCLP(defaultBudgetAmount!)}</span>. Súbelo al menos a esa cifra
                o revisa tus recurrentes.
              </p>
            </div>
          </div>
        ) : (
          <p className="text-xs mb-5 px-1 flex items-center gap-1.5" style={{ color: 'var(--ink-3)' }}>
            <RefreshCw className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--ink-3)' }} />
            De tu límite, <span className="font-bold tabular-nums" style={{ color: 'var(--ink-2)' }}>{formatCLP(committedFloor)}</span>
            &nbsp;ya están comprometidos en fijos y cuotas este mes.
          </p>
        )
      )}

      <div className="lg:grid lg:gap-6 lg:items-start" style={{ gridTemplateColumns: '1fr 260px' }}>

        {/* Lista de categorías */}
        <CategoryBudgetManager
          categories={sortedCategories}
          budgets={typedBudgets}
          recurringByCategory={recurringByCategory}
          userId={user.id}
          month={month}
          year={year}
        />

        {/* Panel lateral — solo desktop */}
        <div className="hidden lg:flex flex-col gap-4">

          {/* Resumen */}
          <div className="card p-5">
            <p className="text-sm font-bold text-gray-700 mb-4">Resumen</p>
            <div className="space-y-4">

              <div className="flex items-center gap-3">
                <div
                  className="cat-icon-bg w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ '--cat-bg': 'var(--primary-soft)', '--cat-color': 'var(--primary)' } as React.CSSProperties}
                >
                  <PiggyBank className="w-4 h-4" style={{ color: 'var(--primary)' }} />
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 font-medium leading-tight">Total presupuestado</p>
                  <p className="text-base font-extrabold text-gray-900 tabular-nums">
                    {totalBudgeted > 0 ? formatCLP(totalBudgeted) : '—'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div
                  className="cat-icon-bg w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ '--cat-bg': '#F0FDF4', '--cat-color': '#16A34A' } as React.CSSProperties}
                >
                  <Target className="w-4 h-4" style={{ color: '#16A34A' }} />
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 font-medium leading-tight">Categorías con límite</p>
                  <p className="text-base font-extrabold text-gray-900 tabular-nums">
                    {budgetsWithLimit} <span className="text-sm font-medium text-gray-400">/ {totalCategories}</span>
                  </p>
                </div>
              </div>

              {totalRecurring > 0 && (
                <div className="flex items-center gap-3">
                  <div
                    className="cat-icon-bg w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ '--cat-bg': '#FFF7ED', '--cat-color': '#EA580C' } as React.CSSProperties}
                  >
                    <RefreshCw className="w-4 h-4" style={{ color: '#EA580C' }} />
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-400 font-medium leading-tight">Recurrentes comprometidos</p>
                    <p className="text-base font-extrabold text-gray-900 tabular-nums">
                      {formatCLP(totalRecurring)}
                    </p>
                  </div>
                </div>
              )}

            </div>

            {/* Coverage progress bar */}
            {totalCategories > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[11px] text-gray-400 font-medium">Cobertura</p>
                  <p className="text-[11px] font-bold text-gray-500">
                    {Math.round(budgetsWithLimit / totalCategories * 100)}%
                  </p>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.round(budgetsWithLimit / totalCategories * 100)}%`,
                      background: budgetsWithLimit === 0 ? '#D1D5DB' : 'var(--primary)',
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Tip */}
          <div className="card insight-card p-4">
            <p className="text-xs font-bold text-amber-800 mb-1">💡 Cómo funciona</p>
            <p className="text-xs text-amber-700 leading-relaxed">
              El total presupuestado se refleja como límite mensual en el dashboard. Deja un campo vacío para no poner límite a esa categoría.
            </p>
          </div>

        </div>
      </div>
    </div>
  )
}
