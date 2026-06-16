'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCLP, cn } from '@/lib/utils'
import { detectDomain } from '@/lib/services'
import { getExpenseIcon } from '@/lib/expense-icons'
import { Square, CheckSquare, Trash2, X, Loader2 } from 'lucide-react'
import ExpenseList from './ExpenseList'
import ServiceLogo from './ServiceLogo'
import type { ExpenseWithRelations } from '@/types'

interface Group {
  date: string
  label: string
  dayTotal: number
  expenses: ExpenseWithRelations[]
}

export default function HistorialExpenses({ groups }: { groups: Group[] }) {
  const router = useRouter()
  const supabase = createClient()

  const [selectMode, setSelectMode]   = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleting, setDeleting]       = useState(false)
  const [excludeIds, setExcludeIds]   = useState<Set<string>>(new Set())

  // Filter out optimistically-deleted items
  const visibleGroups = groups
    .map(g => ({
      ...g,
      expenses: g.expenses.filter(e => !excludeIds.has(e.id)),
      dayTotal: g.expenses.filter(e => !excludeIds.has(e.id)).reduce((s, e) => s + e.amount, 0),
    }))
    .filter(g => g.expenses.length > 0)

  const allExpenses = visibleGroups.flatMap(g => g.expenses)
  const allSelected = allExpenses.length > 0 && allExpenses.every(e => selectedIds.has(e.id))

  function toggle(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleGroup(expenses: ExpenseWithRelations[]) {
    const allGroupSelected = expenses.every(e => selectedIds.has(e.id))
    setSelectedIds(prev => {
      const next = new Set(prev)
      expenses.forEach(e => allGroupSelected ? next.delete(e.id) : next.add(e.id))
      return next
    })
  }

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(allExpenses.map(e => e.id)))
    }
  }

  function cancel() {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0 || deleting) return
    setDeleting(true)
    const ids = [...selectedIds]
    try {
      const { error } = await supabase.from('expenses').delete().in('id', ids)
      if (error) throw error
      setExcludeIds(prev => new Set([...prev, ...ids]))
      setSelectedIds(new Set())
      setSelectMode(false)
      router.refresh()
    } catch {
      // Delete failed — keep selection so user can retry
    } finally {
      setDeleting(false)
    }
  }

  if (visibleGroups.length === 0) return null

  return (
    <>
      {/* Select mode toggle */}
      <div className="flex items-center justify-end gap-3 -mt-1">
        {selectMode ? (
          <>
            <button
              onClick={toggleAll}
              className="text-xs font-semibold text-brand-600 hover:text-brand-700 transition-colors py-1"
            >
              {allSelected ? 'Deseleccionar todo' : 'Seleccionar todo'}
            </button>
            <button
              onClick={cancel}
              className="flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-gray-600 transition-colors py-1"
            >
              <X className="w-3 h-3" />
              Cancelar
            </button>
          </>
        ) : (
          <button
            onClick={() => setSelectMode(true)}
            className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700 transition-colors py-1"
          >
            <CheckSquare className="w-3.5 h-3.5" />
            Seleccionar
          </button>
        )}
      </div>

      {/* Grouped list */}
      {visibleGroups.map(group => {
        const allGroupSelected  = group.expenses.every(e => selectedIds.has(e.id))
        const someGroupSelected = group.expenses.some(e  => selectedIds.has(e.id))

        return (
          <div key={group.date}>
            {/* Date header */}
            <div className="flex items-center justify-between mb-2 px-0.5">
              <div className="flex items-center gap-2">
                {selectMode && (
                  <button
                    onClick={() => toggleGroup(group.expenses)}
                    className="flex-shrink-0"
                    aria-label="Seleccionar todos del día"
                  >
                    {allGroupSelected ? (
                      <CheckSquare className="w-4 h-4 text-brand-600" />
                    ) : someGroupSelected ? (
                      <div className="w-4 h-4 rounded border-2 border-brand-400 bg-brand-100 flex items-center justify-center">
                        <div className="w-2 h-0.5 bg-brand-600 rounded" />
                      </div>
                    ) : (
                      <Square className="w-4 h-4 text-gray-300" />
                    )}
                  </button>
                )}
                <span className="text-sm font-bold text-gray-600 capitalize">
                  {group.label}
                </span>
              </div>
              <span className="text-sm font-semibold text-gray-400 tabular-nums">
                {formatCLP(group.dayTotal)}
              </span>
            </div>

            {/* Expense rows */}
            {selectMode ? (
              <div className="card overflow-hidden">
                {group.expenses.map((e, idx) => {
                  const isSelected  = selectedIds.has(e.id)
                  const catColor    = e.category?.color ?? '#1B6DD4'

                  const recurDomain = e.recurring_expense?.domain
                  const descDomain  = e.description ? detectDomain(e.description) : null
                  const logoDomain  = recurDomain ?? descDomain
                  const logoName    = e.recurring_expense?.name ?? e.description ?? e.category?.name ?? ''

                  const { icon: Icon, color, bg } = getExpenseIcon(
                    e.description ?? null,
                    e.category?.name ?? null
                  )

                  return (
                    <button
                      key={e.id}
                      onClick={() => toggle(e.id)}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors',
                        idx > 0 && 'border-t border-gray-50',
                        isSelected ? 'bg-brand-50/60' : 'hover:bg-gray-50/50'
                      )}
                    >
                      {/* Checkbox */}
                      <div className="flex-shrink-0">
                        {isSelected
                          ? <CheckSquare className="w-5 h-5 text-brand-600" />
                          : <Square className="w-5 h-5 text-gray-300" />
                        }
                      </div>

                      {/* Category color accent */}
                      <div
                        className="w-1 h-8 rounded-full flex-shrink-0 -ml-1"
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
                          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: bg }}
                        >
                          <Icon className="w-5 h-5" style={{ color }} />
                        </div>
                      )}

                      {/* Text */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate leading-tight">
                          {e.description ?? e.category?.name ?? 'Gasto'}
                        </p>
                        <p className="text-xs text-gray-400 truncate mt-0.5">
                          {[e.category?.name, e.payment_method?.name].filter(Boolean).join(' · ')}
                        </p>
                      </div>

                      {/* Amount */}
                      <p className="text-base font-bold text-gray-900 tabular-nums flex-shrink-0">
                        {formatCLP(e.amount)}
                      </p>
                    </button>
                  )
                })}
              </div>
            ) : (
              <ExpenseList expenses={group.expenses} />
            )}
          </div>
        )
      })}

      {/* Floating bulk action bar */}
      {selectMode && selectedIds.size > 0 && (
        <div className="fixed bottom-24 lg:bottom-8 left-0 lg:left-60 right-0 z-[60] px-4 lg:px-8 pointer-events-none">
          <div className="max-w-6xl mx-auto pointer-events-auto">
            <div
              className="flex items-center gap-3 px-5 py-3.5 rounded-2xl text-white shadow-2xl"
              style={{ background: '#0A1F44', boxShadow: '0 8px 32px rgba(10,31,68,.45)' }}
            >
              <p className="flex-1 text-sm font-bold">
                {selectedIds.size} gasto{selectedIds.size !== 1 ? 's' : ''} seleccionado{selectedIds.size !== 1 ? 's' : ''}
              </p>
              <button
                onClick={cancel}
                className="text-sm font-semibold text-white/50 hover:text-white/80 transition-colors px-2 py-1"
              >
                Cancelar
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={deleting}
                className="flex items-center gap-2 bg-red-500 hover:bg-red-600 active:scale-95 transition-all px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-60"
              >
                {deleting
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Trash2 className="w-4 h-4" />
                }
                {deleting ? 'Eliminando...' : `Eliminar ${selectedIds.size}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
