'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCLP, relativeDate, isEmoji } from '@/lib/utils'
import { getCategoryIcon } from '@/lib/category-icons'
import { getExpenseIcon } from '@/lib/expense-icons'
import { detectDomain } from '@/lib/services'
import { Receipt } from 'lucide-react'
import ServiceLogo from './ServiceLogo'
import ExpenseSheet from './ExpenseSheet'
import { cn } from '@/lib/utils'
import type { ExpenseWithRelations, Category, PaymentMethod } from '@/types'

interface Props {
  expenses: ExpenseWithRelations[]
  categories: Category[]
  paymentMethods: PaymentMethod[]
}

export default function StatementView({ expenses, categories, paymentMethods }: Props) {
  const router = useRouter()
  const [editingExpense, setEditingExpense] = useState<ExpenseWithRelations | null>(null)

  if (expenses.length === 0) {
    return (
      <div className="card flex flex-col items-center justify-center py-14 text-center gap-2">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-1" style={{ background: '#EEF4FF' }}>
          <Receipt className="w-6 h-6" style={{ color: '#1B6DD4' }} />
        </div>
        <p className="text-sm font-bold text-gray-600">Sin movimientos</p>
        <p className="text-xs text-gray-400">No hay gastos registrados en este período</p>
      </div>
    )
  }

  // Agrupar por fecha
  const grouped = expenses.reduce<Record<string, ExpenseWithRelations[]>>((acc, e) => {
    const key = e.date
    if (!acc[key]) acc[key] = []
    acc[key].push(e)
    return acc
  }, {})

  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">
            Movimientos
          </p>
          <p className="text-xs text-gray-400 font-medium">{expenses.length} transacciones</p>
        </div>

        {sortedDates.map(date => {
          const dayExpenses = grouped[date]
          const dayTotal    = dayExpenses.reduce((s, e) => s + e.amount, 0)
          const label       = relativeDate(date)

          return (
            <div key={date}>
              {/* Cabecera de día */}
              <div className="flex items-center justify-between px-0.5 mb-1.5">
                <span className="text-xs font-bold text-gray-500 capitalize">{label}</span>
                <span className="text-xs font-semibold text-gray-400 tabular-nums">{formatCLP(dayTotal)}</span>
              </div>

              <div className="card overflow-hidden divide-y divide-gray-50">
                {dayExpenses.map((e, idx) => {
                  const catColor = e.category?.color ?? '#1B6DD4'
                  const catBg    = e.category?.bg_color ?? '#EEF4FF'

                  const recurDomain = e.recurring_expense?.domain
                  const descDomain  = e.description ? detectDomain(e.description) : null
                  const logoDomain  = recurDomain ?? descDomain
                  const logoName    = e.recurring_expense?.name ?? e.description ?? e.category?.name ?? ''

                  return (
                    <button
                      key={e.id}
                      onClick={() => setEditingExpense(e)}
                      className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-gray-50/50 active:bg-gray-100/60"
                    >
                      {/* Color accent */}
                      <div className="w-1 h-8 rounded-full flex-shrink-0 -ml-1" style={{ backgroundColor: catColor }} />

                      {/* Icono */}
                      {logoDomain ? (
                        <ServiceLogo domain={logoDomain} name={logoName} size={40} className="flex-shrink-0" />
                      ) : (
                        <div className="cat-icon-bg w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ '--cat-bg': catBg, '--cat-color': catColor } as React.CSSProperties}>
                          {(() => {
                            const { icon: Icon, color } = getExpenseIcon(e.description ?? null, e.category?.name ?? null)
                            return <Icon className="w-5 h-5" style={{ color }} />
                          })()}
                        </div>
                      )}

                      {/* Texto */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate leading-tight">
                          {e.description ?? e.category?.name ?? 'Gasto'}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {e.category && (
                            <span
                              className="cat-badge inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
                              style={{ '--cat-bg': e.category.bg_color, '--cat-color': e.category.color } as React.CSSProperties}
                            >
                              {isEmoji(e.category.icon)
                                ? <span className="text-[9px]">{e.category.icon}</span>
                                : (() => { const CatIcon = getCategoryIcon(e.category!.icon); return <CatIcon className="w-2.5 h-2.5 flex-shrink-0" /> })()
                              }
                              <span>{e.category.name}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Monto */}
                      <p className="text-base font-bold text-gray-900 tabular-nums flex-shrink-0">
                        {formatCLP(e.amount)}
                      </p>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <ExpenseSheet
        fetchData
        isOpen={!!editingExpense}
        onClose={() => { setEditingExpense(null); router.refresh() }}
        editExpense={editingExpense}
        categories={categories}
        paymentMethods={paymentMethods}
      />
    </>
  )
}
