'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCLP, cn, type DateFormat } from '@/lib/utils'
import { detectDomain } from '@/lib/services'
import { getExpenseIcon } from '@/lib/expense-icons'
import { Square, CheckSquare, Trash2, X, Loader2, ChevronUp, ChevronDown } from 'lucide-react'
import { isEmoji } from '@/lib/utils'
import { getCategoryIcon } from '@/lib/category-icons'
import { PaymentIcon } from './PaymentIcon'
import ExpenseList from './ExpenseList'
import ServiceLogo from './ServiceLogo'
import type { ExpenseWithRelations } from '@/types'

interface Group {
  date: string
  label: string
  dayTotal: number
  expenses: ExpenseWithRelations[]
}

export default function HistorialExpenses({ groups, dateFormat, propertyExpenseIds = [] }: { groups: Group[]; dateFormat?: DateFormat; propertyExpenseIds?: string[] }) {
  const router = useRouter()
  const supabase = createClient()

  const [selectMode, setSelectMode]     = useState(false)
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set())
  const [deleting, setDeleting]         = useState(false)
  const [confirming, setConfirming]     = useState(false)
  const [deleteError, setDeleteError]   = useState<string | null>(null)
  const [excludeIds, setExcludeIds]     = useState<Set<string>>(new Set())
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set())

  function toggleCollapse(date: string) {
    setCollapsedDates(prev => {
      const next = new Set(prev)
      next.has(date) ? next.delete(date) : next.add(date)
      return next
    })
  }

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
    setConfirming(false)
    setDeleteError(null)
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0 || deleting) return
    setDeleting(true)
    setDeleteError(null)
    const ids = [...selectedIds]
    try {
      const { error } = await supabase.from('expenses').delete().in('id', ids)
      if (error) throw error
      setExcludeIds(prev => new Set([...prev, ...ids]))
      setSelectedIds(new Set())
      setSelectMode(false)
      setConfirming(false)
      router.refresh()
    } catch {
      setConfirming(false)
      setDeleteError('No se pudo eliminar. Revisa tu conexión e inténtalo de nuevo.')
    } finally {
      setDeleting(false)
    }
  }

  if (visibleGroups.length === 0) return null

  const totalExpenses = visibleGroups.reduce((s, g) => s + g.expenses.length, 0)

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: 'var(--surface-2)', color: 'var(--ink-2)' }}>
          {totalExpenses} registro{totalExpenses !== 1 ? 's' : ''}
        </span>
        <div className="flex items-center gap-3">
          {selectMode ? (
            <>
              <button
                onClick={toggleAll}
                className="text-xs font-semibold hover:opacity-70 transition-opacity min-h-[44px]" style={{ color: 'var(--primary)' }}
              >
                {allSelected ? 'Deseleccionar todo' : 'Seleccionar todo'}
              </button>
              <button
                onClick={cancel}
                className="flex items-center gap-1 text-xs font-semibold hover:opacity-70 transition-opacity min-h-[44px]" style={{ color: 'var(--ink-3)' }}
              >
                <X className="w-3 h-3" />
                Cancelar
              </button>
            </>
          ) : (
            <button
              onClick={() => setSelectMode(true)}
              className="flex items-center gap-1.5 text-xs font-semibold hover:opacity-70 transition-opacity min-h-[44px]" style={{ color: 'var(--ink-3)' }}
            >
              <CheckSquare className="w-3.5 h-3.5" />
              Seleccionar
            </button>
          )}
        </div>
      </div>

      {/* Grouped list */}
      {visibleGroups.map(group => {
        const allGroupSelected  = group.expenses.every(e => selectedIds.has(e.id))
        const someGroupSelected = group.expenses.some(e  => selectedIds.has(e.id))
        const isCollapsed = collapsedDates.has(group.date)

        return (
          <div key={group.date} className="mb-4">
            {/* Date header */}
            <div className="flex items-center gap-2.5 mb-2 px-0.5">
              {/* Checkbox (select mode) */}
              {selectMode && (
                <button
                  onClick={() => toggleGroup(group.expenses)}
                  className="flex-shrink-0"
                  aria-label="Seleccionar todos del día"
                >
                  {allGroupSelected ? (
                    <CheckSquare className="w-4 h-4" style={{ color: 'var(--primary)' }} />
                  ) : someGroupSelected ? (
                    <div className="w-4 h-4 rounded border-2 flex items-center justify-center" style={{ borderColor: 'var(--primary)', background: 'var(--primary-soft)' }}>
                      <div className="w-2 h-0.5 rounded" style={{ background: 'var(--primary)' }} />
                    </div>
                  ) : (
                    <Square className="w-4 h-4" style={{ color: 'var(--ink-3)' }} />
                  )}
                </button>
              )}

              {/* Left accent */}
              <div className="w-0.5 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: 'var(--primary)', opacity: 0.4 }} />

              {/* Date label */}
              <span className="text-sm font-bold capitalize flex-1" style={{ color: 'var(--ink)' }}>
                {group.label}
              </span>

              {/* Count chip */}
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ color: 'var(--ink-3)', background: 'var(--surface-2)' }}>
                {group.expenses.length}
              </span>

              {/* Day total */}
              <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink-2)' }}>
                {formatCLP(group.dayTotal)}
              </span>

              {/* Collapse toggle */}
              <button
                onClick={() => toggleCollapse(group.date)}
                className="p-0.5 rounded-lg hover:bg-[var(--surface-2)] transition-colors flex-shrink-0" style={{ color: 'var(--ink-3)' }}
                aria-label={isCollapsed ? 'Expandir' : 'Colapsar'}
              >
                {isCollapsed
                  ? <ChevronDown className="w-4 h-4" />
                  : <ChevronUp className="w-4 h-4" />
                }
              </button>
            </div>

            {/* Expense rows */}
            {!isCollapsed && selectMode ? (
              <div className="card overflow-hidden">
                {group.expenses.map((e, idx) => {
                  const isSelected  = selectedIds.has(e.id)
                  const catColor    = e.category?.color ?? 'var(--primary)'
                  const catBg       = e.category?.bg_color ?? 'var(--primary-soft)'

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
                      className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[var(--surface-2)]"
                      style={{
                        borderTop: idx > 0 ? '1px solid var(--border)' : undefined,
                        background: isSelected ? 'var(--primary-soft)' : undefined,
                      }}
                    >
                      {/* Checkbox */}
                      <div className="flex-shrink-0">
                        {isSelected
                          ? <CheckSquare className="w-5 h-5" style={{ color: 'var(--primary)' }} />
                          : <Square className="w-5 h-5" style={{ color: 'var(--ink-3)' }} />
                        }
                      </div>

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
                          <Icon className="w-5 h-5" style={{ color }} />
                        </div>
                      )}

                      {/* Text */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold truncate" style={{ color: 'var(--ink)' }}>
                          {e.description ?? e.category?.name ?? 'Gasto'}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {e.category && (
                            <span
                              className="cat-badge inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
                              style={{ '--cat-bg': catBg, '--cat-color': catColor } as React.CSSProperties}
                            >
                              {isEmoji(e.category.icon)
                                ? <span className="text-[9px] leading-none">{e.category.icon}</span>
                                : (() => { const CatIcon = getCategoryIcon(e.category!.icon); return <CatIcon className="w-2.5 h-2.5 flex-shrink-0" /> })()
                              }
                              <span>{e.category.name}</span>
                            </span>
                          )}
                          {e.payment_method && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ color: 'var(--ink-2)', background: 'var(--surface-2)' }}>
                              <PaymentIcon cardType={e.payment_method.card_type} />
                              {e.payment_method.name}
                            </span>
                          )}
                          {propertyExpenseIds.includes(e.id) && (
                            <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
                              style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                              Propiedad
                            </span>
                          )}
                          {e.shared_expense_id && (
                            <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
                              style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                              Compartido{(e.card_extra ?? 0) > 0 ? ` · tarjeta cobró ${formatCLP(e.amount + (e.card_extra ?? 0))}` : ''}
                            </span>
                          )}
                          {!e.shared_expense_id && (e.card_extra ?? 0) > 0 && (
                            <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
                              style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                              Dividido · tarjeta cobró {formatCLP(e.amount + (e.card_extra ?? 0))}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Amount */}
                      <p className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--coral-ink)' }}>
                        −{formatCLP(e.amount)}
                      </p>
                    </button>
                  )
                })}
              </div>
            ) : !isCollapsed ? (
              <ExpenseList expenses={group.expenses} dateFormat={dateFormat} />
            ) : null}
          </div>
        )
      })}

      {/* Floating bulk action bar */}
      {selectMode && selectedIds.size > 0 && (
        <div className="fixed bottom-24 lg:bottom-8 left-0 lg:left-60 right-0 z-[60] px-4 lg:px-8 pointer-events-none">
          <div className="pointer-events-auto">
            <div
              className="flex flex-col gap-2.5 px-5 py-3.5 rounded-2xl text-white"
              style={{ background: 'var(--ink)', boxShadow: '0 8px 18px var(--shadow)' }}
              role="region" aria-label="Acciones sobre los gastos seleccionados"
            >
              <p className="text-sm font-bold" aria-live="polite">
                {confirming
                  ? `¿Eliminar ${selectedIds.size} gasto${selectedIds.size !== 1 ? 's' : ''}? No se puede deshacer.`
                  : `${selectedIds.size} gasto${selectedIds.size !== 1 ? 's' : ''} seleccionado${selectedIds.size !== 1 ? 's' : ''}`}
              </p>
              {deleteError && (
                <p role="alert" className="text-xs font-semibold" style={{ color: 'var(--coral-on-brand-soft)' }}>
                  {deleteError}
                </p>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={confirming ? () => setConfirming(false) : cancel}
                  disabled={deleting}
                  className="flex-1 min-h-[44px] rounded-xl text-sm font-semibold border border-white/30 text-white/90 hover:bg-white/10 transition-colors disabled:opacity-60"
                >
                  {confirming ? 'No, volver' : 'Cancelar'}
                </button>
                <button
                  onClick={confirming ? handleBulkDelete : () => { setDeleteError(null); setConfirming(true) }}
                  disabled={deleting}
                  className="flex-1 min-h-[44px] flex items-center justify-center gap-2 active:scale-95 transition-all px-4 rounded-xl text-sm font-bold disabled:opacity-60"
                  style={{ background: 'var(--coral)', color: 'white' }}
                >
                  {deleting
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Trash2 className="w-4 h-4" />
                  }
                  {deleting ? 'Eliminando...' : confirming ? 'Sí, eliminar' : `Eliminar ${selectedIds.size}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
