'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCLP, relativeDate, isEmoji, type DateFormat } from '@/lib/utils'
import { getCategoryIcon } from '@/lib/category-icons'
import { detectDomain } from '@/lib/services'
import { getExpenseIcon } from '@/lib/expense-icons'
import type { ExpenseWithRelations } from '@/types'
import ExpenseSheet from './ExpenseSheet'
import ServiceLogo from './ServiceLogo'
import { cn } from '@/lib/utils'
import { PaymentIcon } from './PaymentIcon'
import { useBackdropClose } from '@/components/useBackdropClose'
import { useToast } from '@/components/ToastProvider'
import { X, Trash2, ChevronRight, RefreshCw } from 'lucide-react'

interface Props {
  expenses: ExpenseWithRelations[]
  showDate?: boolean
  dateFormat?: DateFormat
}

function fmtDateLong(d: string): string {
  try {
    const s = new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    return s.charAt(0).toUpperCase() + s.slice(1)
  } catch { return d }
}

// ago 2026 (Cas: "quiero que ingresos y en historial de gastos también sea
// la misma lógica, tocar ver contenido y con botones para editar y
// eliminar") — mismo patrón que la Billetera USD y el detalle de acciones:
// tocar una fila abre un detalle de solo lectura primero, con Editar (abre
// el formulario real, ExpenseSheet) y Eliminar (con confirmación inline y
// deshacer) en el footer, en vez de saltar directo al formulario de edición.
export default function ExpenseList({ expenses, showDate, dateFormat }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const { showToast } = useToast()

  const [editingExpense, setEditingExpense] = useState<ExpenseWithRelations | null>(null)
  const [detailExpense, setDetailExpense]   = useState<ExpenseWithRelations | null>(null)
  const [confirmDelete, setConfirmDelete]   = useState(false)
  const [deleting, setDeleting]             = useState(false)

  function closeDetail() { setDetailExpense(null); setConfirmDelete(false) }
  const detailBackdropClose = useBackdropClose(closeDetail)

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

  if (expenses.length === 0) return null

  return (
    <>
      <div className="card overflow-hidden">
        {expenses.map((e, idx) => {
          const catBg    = e.category?.bg_color ?? '#EEF4FF'
          const catColor = e.category?.color ?? '#4D93FF'

          const recurringDomain = e.recurring_expense?.domain
          const descDomain = e.description ? detectDomain(e.description) : null
          const logoDomain = recurringDomain ?? descDomain
          const logoName = e.recurring_expense?.name ?? e.description ?? e.category?.name ?? ''

          return (
            <button
              key={e.id}
              onClick={() => setDetailExpense(e)}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-gray-50/50 active:bg-gray-100/60 group',
                idx > 0 && 'border-t border-gray-50'
              )}
            >
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
                      <span>{e.category.name}</span>
                    </span>
                  )}
                  {e.payment_method && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full flex-shrink-0">
                      <PaymentIcon cardType={e.payment_method.card_type} />
                      {e.payment_method.name}
                    </span>
                  )}
                  {showDate && (
                    <span className="text-[10px] text-gray-400">· {relativeDate(e.date, dateFormat)}</span>
                  )}
                </div>
              </div>

              {/* Amount + date */}
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--coral)' }}>
                  −{formatCLP(e.amount)}
                </p>
                {!showDate && (
                  <p className="text-[10px] text-gray-400 mt-0.5 lg:hidden">{relativeDate(e.date, dateFormat)}</p>
                )}
              </div>

              <ChevronRight className="w-4 h-4 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5" />
            </button>
          )
        })}
      </div>

      {/* ── Detalle de un gasto (ago 2026, a pedido de Cas) ──────────────────
          Tocar una fila abre esto primero — mismo patrón que la Billetera
          USD: ver antes de editar/eliminar. */}
      {detailExpense && (() => {
        const e = detailExpense
        const catBg    = e.category?.bg_color ?? '#EEF4FF'
        const catColor = e.category?.color ?? '#4D93FF'
        const { icon: Icon, color, bg } = getExpenseIcon(e.description ?? null, e.category?.name ?? null)

        return (
          <div
            className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center bg-black/50"
            {...detailBackdropClose}
            role="dialog"
            aria-modal="true"
            aria-label="Detalle de gasto"
          >
            <div
              className="w-full lg:max-w-2xl bg-white rounded-t-3xl lg:rounded-3xl overflow-hidden"
              style={{ maxHeight: '92dvh' }}
            >
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 mb-1 lg:hidden" />

              {/* Header — mismos tokens que ExpenseSheet (px-5 pt-3 pb-3 lg:px-6,
                  border-gray-100, título text-base font-bold text-gray-900,
                  cierre w-11 h-11) para que detalle y edición se sientan la
                  misma superficie, no dos modales distintos. */}
              <div className="flex items-center gap-3 px-5 pt-3 pb-3 lg:px-6 border-b border-gray-100">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: bg }}>
                  <Icon className="w-5 h-5" style={{ color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-bold truncate text-gray-900">
                    {e.description ?? e.category?.name ?? 'Gasto'}
                  </h2>
                  <p className="text-xs text-gray-400">{fmtDateLong(e.date)}</p>
                </div>
                <button
                  onClick={closeDetail}
                  className="w-11 h-11 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
                  aria-label="Cerrar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-5 lg:px-6 py-4 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(92dvh - 190px)' }}>
                <div className="rounded-2xl overflow-hidden divide-y divide-gray-100 bg-gray-50">
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs font-semibold text-gray-500">Monto</span>
                    <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--coral)' }}>
                      −{formatCLP(e.amount)}
                    </span>
                  </div>
                  {e.category && (
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-xs font-semibold text-gray-500">Categoría</span>
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
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-xs font-semibold text-gray-500">Método de pago</span>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700">
                        <PaymentIcon cardType={e.payment_method.card_type} />
                        {e.payment_method.name}
                      </span>
                    </div>
                  )}
                  {e.recurring_expense && (
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-xs font-semibold text-gray-500">Recurrente</span>
                      <span className="text-sm font-bold text-gray-700">{e.recurring_expense.name}</span>
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1">Descripción</p>
                  <p className={cn('text-sm', e.description ? 'text-gray-700' : 'text-gray-400')}>
                    {e.description || 'Descripción (opcional) — agrégala al editar.'}
                  </p>
                </div>

                {/* Confirmación de eliminar — copia exacta del bloque de
                    ExpenseSheet.editActions, sin caja de color de fondo. */}
                {confirmDelete && (
                  <div className="space-y-2">
                    <p className="text-sm text-center text-gray-500">¿Seguro que quieres eliminar este gasto?</p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setConfirmDelete(false)}
                        className="flex-1 py-3 text-sm font-semibold text-gray-600 bg-gray-100 rounded-2xl hover:bg-gray-200 transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => handleDelete(e)}
                        disabled={deleting}
                        className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold text-white bg-red-500 rounded-2xl hover:bg-red-600 transition-colors disabled:opacity-60"
                      >
                        {deleting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        {deleting ? 'Eliminando...' : 'Sí, eliminar'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {!confirmDelete && (
                <div className="border-t border-gray-100 px-5 lg:px-6 py-3 flex items-center gap-3 flex-shrink-0 bg-white">
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="logout-btn flex items-center justify-center w-11 h-11 text-red-500 border rounded-2xl transition-colors flex-shrink-0"
                    aria-label="Eliminar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={closeDetail}
                    className="px-4 py-3 text-sm font-semibold text-gray-600 bg-gray-100 rounded-2xl hover:bg-gray-200 transition-colors"
                  >
                    Cerrar
                  </button>
                  <button
                    onClick={() => { setDetailExpense(null); setConfirmDelete(false); setEditingExpense(e) }}
                    className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold text-white rounded-2xl transition-colors"
                    style={{ backgroundColor: 'var(--primary)' }}
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
        onClose={() => setEditingExpense(null)}
        editExpense={editingExpense}
      />
    </>
  )
}
