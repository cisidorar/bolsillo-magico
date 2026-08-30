'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCLP, isEmoji } from '@/lib/utils'
import { getExpenseIcon } from '@/lib/expense-icons'
import { getCategoryIcon } from '@/lib/category-icons'
import { detectDomain } from '@/lib/services'
import ExpenseSheet from './ExpenseSheet'
import ServiceLogo from './ServiceLogo'
import { PaymentIcon } from './PaymentIcon'
import { useBackdropClose } from '@/components/useBackdropClose'
import { useToast } from '@/components/ToastProvider'
import { X, Trash2, ChevronRight, RefreshCw } from 'lucide-react'
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

function fmtDateLong(d: string): string {
  try {
    const s = new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    return s.charAt(0).toUpperCase() + s.slice(1)
  } catch { return d }
}

// ago 2026 (Cas: "quiero que al presionar pueda ver el gasto y haya un botón
// para editar") — mismo patrón que Historial/Ingresos: tocar una fila abre
// un detalle de solo lectura primero, con Eliminar (confirmación inline +
// deshacer) y Editar (abre ExpenseSheet) en el footer.
export default function CatExpenseList({ groups, categoryName, compact = false }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const { showToast } = useToast()

  const [editingExpense, setEditingExpense] = useState<ExpenseWithRelations | null>(null)
  const [detailExpense, setDetailExpense]   = useState<ExpenseWithRelations | null>(null)
  const [confirmDelete, setConfirmDelete]   = useState(false)
  const [deleting, setDeleting]             = useState(false)

  function closeDetail() { setDetailExpense(null); setConfirmDelete(false) }
  const backdropClose = useBackdropClose(closeDetail)

  async function handleDelete(e: ExpenseWithRelations) {
    setDeleting(true)
    const { error } = await supabase.from('expenses').delete().eq('id', e.id)
    setDeleting(false)
    if (error) return
    router.refresh()
    closeDetail()
    showToast('Gasto eliminado', {
      action: {
        label: 'Deshacer',
        onClick: async () => {
          const { error: undoErr } = await supabase.from('expenses').insert({
            user_id: e.user_id,
            amount: e.amount,
            category_id: e.category_id,
            payment_method_id: e.payment_method_id,
            recurring_expense_id: e.recurring_expense_id,
            description: e.description,
            date: e.date,
            tags: e.tags,
          })
          if (!undoErr) { router.refresh(); showToast('Gasto restaurado') }
        },
      },
    })
  }

  let globalIdx = -1

  return (
    <>
      <div className={compact ? '' : 'space-y-4'}>
        {groups.map(({ date, label, dayTotal, expenses }) => (
          <div key={date}>
            {!compact && (
              <div className="flex items-center justify-between mb-2 px-1">
                <p className="text-xs font-bold capitalize" style={{ color: 'var(--ink-3)' }}>{label}</p>
                <p className="text-xs font-bold tabular-nums" style={{ color: 'var(--ink-3)' }}>{formatCLP(dayTotal)}</p>
              </div>
            )}
            <div className={compact ? '' : 'card overflow-hidden'}>
              {expenses.map((e, i) => {
                globalIdx++
                const isFirst = compact ? globalIdx === 0 : i === 0
                const { icon: Icon, color, bg } = getExpenseIcon(e.description ?? null, categoryName)
                return (
                  <button
                    key={e.id}
                    onClick={() => setDetailExpense(e)}
                    className="flex items-center gap-3 px-4 py-3.5 w-full text-left transition-colors hover:bg-[var(--surface-2)] group"
                    style={{ borderTop: isFirst ? undefined : '1px solid var(--border)' }}
                  >
                    <div
                      className="cat-icon-bg w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ '--cat-bg': bg, '--cat-color': color } as React.CSSProperties}
                    >
                      <Icon className="w-4 h-4" style={{ color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>
                        {e.description || categoryName}
                      </p>
                      {e.payment_method && (
                        <p className="text-xs" style={{ color: 'var(--ink-3)' }}>{e.payment_method.name}</p>
                      )}
                    </div>
                    <p className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--ink)' }}>
                      {formatCLP(e.amount)}
                    </p>
                    <ChevronRight
                      className="w-4 h-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                      style={{ color: 'var(--ink-3)' }}
                    />
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ── Detalle de solo lectura ──────────────────────────────────────── */}
      {detailExpense && (() => {
        const e = detailExpense
        const catBg    = e.category?.bg_color ?? '#EEF4FF'
        const catColor = e.category?.color ?? '#4D93FF'
        const { icon: Icon, color, bg } = getExpenseIcon(e.description ?? null, e.category?.name ?? null)
        const recurringDomain = e.recurring_expense?.domain
        const descDomain = e.description ? detectDomain(e.description) : null
        const logoDomain = recurringDomain ?? descDomain
        const logoName = e.recurring_expense?.name ?? e.description ?? e.category?.name ?? ''

        return (
          <div
            className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.65)' }}
            {...backdropClose}
            role="dialog"
            aria-modal="true"
            aria-label="Detalle de gasto"
          >
            <div
              className="w-full lg:max-w-md rounded-t-3xl lg:rounded-3xl overflow-hidden"
              style={{ background: 'var(--surface)', maxHeight: '92dvh' }}
            >
              <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-1 lg:hidden" style={{ background: 'var(--border)' }} />

              <div className="flex items-center gap-3 px-5 pt-4 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
                {logoDomain ? (
                  <ServiceLogo domain={logoDomain} name={logoName} size={40} className="flex-shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: bg }}>
                    <Icon className="w-5 h-5" style={{ color }} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-bold truncate" style={{ color: 'var(--ink)' }}>
                    {e.description ?? e.category?.name ?? 'Gasto'}
                  </h2>
                  <p className="text-xs" style={{ color: 'var(--ink-3)' }}>{fmtDateLong(e.date)}</p>
                </div>
                <button
                  onClick={closeDetail}
                  className="w-8 h-8 flex items-center justify-center rounded-full transition-colors flex-shrink-0"
                  style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}
                  aria-label="Cerrar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-5 py-4 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(92dvh - 190px)' }}>
                <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Monto</span>
                    <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--coral)' }}>
                      −{formatCLP(e.amount)}
                    </span>
                  </div>
                  {e.category && (
                    <div className="flex items-center justify-between px-4 py-2.5" style={{ borderTop: '1px solid var(--border)' }}>
                      <span className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Categoría</span>
                      <span
                        className="cat-badge inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ '--cat-bg': catBg, '--cat-color': catColor } as React.CSSProperties}
                      >
                        {isEmoji(e.category.icon)
                          ? <span className="text-[10px] leading-none">{e.category.icon}</span>
                          : (() => { const CatIcon = getCategoryIcon(e.category!.icon); return <CatIcon className="w-3 h-3" /> })()
                        }
                        {e.category.name}
                      </span>
                    </div>
                  )}
                  {e.payment_method && (
                    <div className="flex items-center justify-between px-4 py-2.5" style={{ borderTop: '1px solid var(--border)' }}>
                      <span className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Método de pago</span>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>
                        <PaymentIcon cardType={e.payment_method.card_type} />
                        {e.payment_method.name}
                      </span>
                    </div>
                  )}
                  {e.recurring_expense && (
                    <div className="flex items-center justify-between px-4 py-2.5" style={{ borderTop: '1px solid var(--border)' }}>
                      <span className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Recurrente</span>
                      <span className="text-sm font-bold" style={{ color: 'var(--ink-2)' }}>{e.recurring_expense.name}</span>
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-xs font-semibold mb-1" style={{ color: 'var(--ink-3)' }}>Descripción</p>
                  <p className="text-sm" style={{ color: e.description ? 'var(--ink-2)' : 'var(--ink-3)' }}>
                    {e.description || 'Descripción (opcional) — agrégala al editar.'}
                  </p>
                </div>

                {confirmDelete && (
                  <div className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(255,111,97,0.08)', border: '1px solid rgba(255,111,97,0.25)' }}>
                    <p className="text-sm text-center font-medium" style={{ color: 'var(--ink-2)' }}>¿Seguro que quieres eliminar este gasto?</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setConfirmDelete(false)}
                        className="flex-1 py-3 text-sm font-semibold rounded-2xl border transition-colors"
                        style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', background: 'var(--surface)' }}
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => handleDelete(e)}
                        disabled={deleting}
                        className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold rounded-2xl disabled:opacity-50"
                        style={{ background: 'var(--coral)', color: 'white' }}
                      >
                        {deleting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        {deleting ? 'Eliminando…' : 'Sí, eliminar'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {!confirmDelete && (
                <div className="px-5 py-3 flex items-center gap-2 flex-shrink-0" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="w-11 h-11 flex items-center justify-center rounded-2xl border shrink-0 transition-colors"
                    style={{ borderColor: 'var(--border)', color: 'var(--coral)', background: 'var(--surface-2)' }}
                    aria-label="Eliminar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={closeDetail}
                    className="flex-1 py-3 text-sm font-semibold rounded-2xl border transition-colors"
                    style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', background: 'var(--surface-2)' }}
                  >
                    Cerrar
                  </button>
                  <button
                    onClick={() => { setDetailExpense(null); setConfirmDelete(false); setEditingExpense(e) }}
                    className="flex-1 py-3 text-sm font-bold rounded-2xl transition-all active:scale-[.98]"
                    style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 6px 16px var(--shadow)' }}
                  >
                    Editar
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      })()}

      <ExpenseSheet
        fetchData
        isOpen={!!editingExpense}
        onClose={() => { setEditingExpense(null); router.refresh() }}
        editExpense={editingExpense}
      />
    </>
  )
}
