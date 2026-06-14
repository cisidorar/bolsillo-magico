'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCLP, relativeDate } from '@/lib/utils'
import { detectDomain } from '@/lib/services'
import { getExpenseIcon } from '@/lib/expense-icons'
import { Pencil, Trash2, X, Check } from 'lucide-react'
import type { ExpenseWithRelations } from '@/types'
import ExpenseSheet from './ExpenseSheet'
import ServiceLogo from './ServiceLogo'
import { cn } from '@/lib/utils'

interface Props {
  expenses: ExpenseWithRelations[]
  showDate?: boolean
}

export default function ExpenseList({ expenses, showDate }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [expandedId, setExpandedId]       = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [deleting, setDeleting]           = useState<string | null>(null)
  const [excludeIds, setExcludeIds]       = useState<Set<string>>(new Set())
  const [editingExpense, setEditingExpense] = useState<ExpenseWithRelations | null>(null)

  const visible = expenses.filter(e => !excludeIds.has(e.id))

  function toggleExpand(id: string) {
    setExpandedId(prev => prev === id ? null : id)
    setPendingDelete(null)
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    await supabase.from('expenses').delete().eq('id', id)
    setExcludeIds(prev => new Set([...prev, id]))
    setExpandedId(null)
    setPendingDelete(null)
    setDeleting(null)
    router.refresh()
  }

  function handleEdit(expense: ExpenseWithRelations) {
    setEditingExpense(expense)
    setExpandedId(null)
  }

  if (visible.length === 0) return null

  return (
    <>
      <div className="card overflow-hidden">
        {visible.map((e, idx) => {
          const isExpanded = expandedId === e.id
          const isPending  = pendingDelete === e.id
          const isDeleting = deleting === e.id
          const catColor   = e.category?.color ?? '#00AEDC'
          const catBg      = e.category?.bg_color ?? '#E1F7FD'

          return (
            <div
              key={e.id}
              className={cn(
                idx > 0 && 'border-t border-gray-50'
              )}
            >
              {/* Main row */}
              <button
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors',
                  isExpanded ? 'bg-gray-50/80' : 'hover:bg-gray-50/50'
                )}
                onClick={() => toggleExpand(e.id)}
              >
                {/* Category color accent */}
                <div
                  className="w-1 h-8 rounded-full flex-shrink-0 -ml-1 mr-0"
                  style={{ backgroundColor: catColor }}
                />

                {/* Icon — prioridad: recurrente → descripción conocida → icono por descripción/categoría */}
                {(() => {
                  const recurringDomain = e.recurring_expense?.domain
                  const descDomain = e.description ? detectDomain(e.description) : null
                  const logoDomain = recurringDomain ?? descDomain
                  const logoName = e.recurring_expense?.name ?? e.description ?? e.category?.name ?? ''

                  if (logoDomain) {
                    return (
                      <ServiceLogo
                        domain={logoDomain}
                        name={logoName}
                        size={40}
                        className="flex-shrink-0"
                      />
                    )
                  }

                  const { icon: Icon, color, bg } = getExpenseIcon(e.description ?? null, e.category?.name ?? null)
                  return (
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: bg }}
                    >
                      <Icon className="w-5 h-5" style={{ color }} />
                    </div>
                  )
                })()}

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate leading-tight">
                    {e.description ?? e.category?.name ?? 'Gasto'}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {e.payment_method && (
                      <ServiceLogo
                        domain={e.payment_method.domain ?? null}
                        name={e.payment_method.name}
                        size={14}
                        className="rounded-sm"
                      />
                    )}
                    <p className="text-xs text-gray-400 truncate">
                      {e.description ? (e.category?.name ?? '–') : ''}
                      {e.description && e.payment_method ? ' · ' : ''}
                      {e.payment_method?.name ?? ''}
                      {showDate && (
                        <span className="text-gray-400"> · {relativeDate(e.date)}</span>
                      )}
                    </p>
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

              {/* Action bar */}
              {isExpanded && (
                <div className="flex items-center gap-2 px-4 pb-3 pt-2 bg-gray-50/80 border-t border-gray-100">
                  <button
                    onClick={() => handleEdit(e)}
                    className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-brand-700 bg-brand-50 border border-brand-100 rounded-xl hover:bg-brand-100 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Editar
                  </button>

                  {isPending ? (
                    <div className="flex items-center gap-1.5 ml-auto">
                      <span className="text-xs text-red-500 font-medium">¿Eliminar?</span>
                      <button
                        onClick={() => setPendingDelete(null)}
                        className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-200 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(e.id)}
                        disabled={isDeleting}
                        className="p-1.5 rounded-lg text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-60"
                      >
                        {isDeleting
                          ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          : <Check className="w-3.5 h-3.5" />
                        }
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setPendingDelete(e.id)}
                      className="flex items-center gap-1.5 ml-auto px-3.5 py-2 text-xs font-semibold text-red-500 bg-red-50 border border-red-100 rounded-xl hover:bg-red-100 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Eliminar
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {editingExpense && (
        <ExpenseSheet
          isOpen
          onClose={() => setEditingExpense(null)}
          editExpense={editingExpense}
          fetchData
        />
      )}
    </>
  )
}
