'use client'

import React, { useState } from 'react'
import { formatCLP, relativeDate, isEmoji } from '@/lib/utils'
import { getCategoryIcon } from '@/lib/category-icons'
import { detectDomain } from '@/lib/services'
import { getExpenseIcon } from '@/lib/expense-icons'
import type { ExpenseWithRelations } from '@/types'
import ExpenseSheet from './ExpenseSheet'
import ServiceLogo from './ServiceLogo'
import { cn } from '@/lib/utils'

interface Props {
  expenses: ExpenseWithRelations[]
  showDate?: boolean
}

export default function ExpenseList({ expenses, showDate }: Props) {
  const [editingExpense, setEditingExpense] = useState<ExpenseWithRelations | null>(null)

  if (expenses.length === 0) return null

  return (
    <>
      <div className="card overflow-hidden">
        {expenses.map((e, idx) => {
          const catColor = e.category?.color ?? '#1B6DD4'
          const catBg    = e.category?.bg_color ?? '#EEF4FF'

          const recurringDomain = e.recurring_expense?.domain
          const descDomain = e.description ? detectDomain(e.description) : null
          const logoDomain = recurringDomain ?? descDomain
          const logoName = e.recurring_expense?.name ?? e.description ?? e.category?.name ?? ''

          return (
            <button
              key={e.id}
              onClick={() => setEditingExpense(e)}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-gray-50/50 active:bg-gray-100/60',
                idx > 0 && 'border-t border-gray-50'
              )}
            >
              {/* Category color accent */}
              <div
                className="w-1 h-8 rounded-full flex-shrink-0 -ml-1 mr-0"
                style={{ backgroundColor: catColor }}
              />

              {/* Icon */}
              {logoDomain ? (
                <ServiceLogo
                  domain={logoDomain}
                  name={logoName}
                  size={40}
                  className="flex-shrink-0"
                />
              ) : (
                <div
                  className="cat-icon-bg w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ '--cat-bg': catBg, '--cat-color': catColor } as React.CSSProperties}
                >
                  {(() => {
                    const { icon: Icon, color } = getExpenseIcon(e.description ?? null, e.category?.name ?? null)
                    return <Icon className="w-5 h-5" style={{ color }} />
                  })()}
                </div>
              )}

              {/* Text */}
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
                        ? <span className="text-[9px] leading-none">{e.category.icon}</span>
                        : (() => { const CatIcon = getCategoryIcon(e.category!.icon); return <CatIcon className="w-2.5 h-2.5 flex-shrink-0" /> })()
                      }
                      <span className="truncate max-w-[72px]">{e.category.name}</span>
                    </span>
                  )}
                  {e.payment_method && (
                    <span className="text-[10px] text-gray-400 truncate">
                      {e.payment_method.name}
                    </span>
                  )}
                  {showDate && (
                    <span className="text-[10px] text-gray-400">· {relativeDate(e.date)}</span>
                  )}
                </div>
              </div>

              {/* Amount + date */}
              <div className="text-right flex-shrink-0">
                <p className="text-base font-bold text-gray-900 tabular-nums">
                  {formatCLP(e.amount)}
                </p>
                {!showDate && (
                  <p className="text-xs text-gray-400 mt-0.5">{relativeDate(e.date)}</p>
                )}
              </div>
            </button>
          )
        })}
      </div>

      <ExpenseSheet
        fetchData
        isOpen={!!editingExpense}
        onClose={() => setEditingExpense(null)}
        editExpense={editingExpense}
      />
    </>
  )
}
