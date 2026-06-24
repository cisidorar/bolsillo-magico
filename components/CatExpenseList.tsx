'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCLP } from '@/lib/utils'
import { getExpenseIcon } from '@/lib/expense-icons'
import ExpenseSheet from './ExpenseSheet'
import type { ExpenseWithRelations } from '@/types'

interface DayGroup {
  date: string
  label: string
  dayTotal: number
  expenses: ExpenseWithRelations[]
}

interface Props {
  groups: DayGroup[]
  categoryName: string
  compact?: boolean
}

export default function CatExpenseList({ groups, categoryName, compact = false }: Props) {
  const router = useRouter()
  const [editingExpense, setEditingExpense] = useState<ExpenseWithRelations | null>(null)

  return (
    <>
      <div className={compact ? 'divide-y divide-gray-50 dark:divide-[#1a2744]' : 'space-y-4'}>
        {groups.map(({ date, label, dayTotal, expenses }) => (
          <div key={date}>
            {!compact && (
              <div className="flex items-center justify-between mb-2 px-1">
                <p className="text-xs font-bold text-gray-400 capitalize">{label}</p>
                <p className="text-xs font-bold text-gray-500 tabular-nums">{formatCLP(dayTotal)}</p>
              </div>
            )}
            <div className={compact ? '' : 'card divide-y divide-gray-50 overflow-hidden'}>
              {expenses.map(e => {
                const { icon: Icon, color, bg } = getExpenseIcon(e.description ?? null, categoryName)
                return (
                  <button
                    key={e.id}
                    onClick={() => setEditingExpense(e)}
                    className="flex items-center gap-3 px-4 py-3.5 w-full text-left hover:bg-gray-50/60 active:bg-brand-50/40 transition-colors"
                  >
                    <div
                      className="cat-icon-bg w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ '--cat-bg': bg, '--cat-color': color } as React.CSSProperties}
                    >
                      <Icon className="w-4 h-4" style={{ color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">
                        {e.description || categoryName}
                      </p>
                      {e.payment_method && (
                        <p className="text-xs text-gray-400">{e.payment_method.name}</p>
                      )}
                    </div>
                    <p className="text-sm font-bold text-gray-900 tabular-nums flex-shrink-0">
                      {formatCLP(e.amount)}
                    </p>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <ExpenseSheet
        fetchData
        isOpen={!!editingExpense}
        onClose={() => { setEditingExpense(null); router.refresh() }}
        editExpense={editingExpense}
      />
    </>
  )
}
