'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCLP } from '@/lib/utils'
import { CalendarDays, ChevronRight, X, Trash2, RefreshCw, FileText } from 'lucide-react'
import { useBackdropDialog } from '@/components/useBackdropClose'
import { DELETE_ERROR } from '@/lib/db-error'
import IncomeSheet from './IncomeSheet'
import PayslipInlineDetail, { type PayslipData } from './PayslipDetailSheet'
import type { IncomeData } from './IncomeMonthEditor'

interface Props {
  userId:     string
  month:      number
  year:       number
  monthName:  string
  income:     IncomeData | null
  prevIncome: IncomeData | null   // para "copiar mes anterior" al registrar uno faltante
  surplus:    number | null
  expense:    number
  payslip:    PayslipData | null
  /** Un mes sin registrar solo se marca en dorado si es el último cerrado:
   *  uno de hace 8 meses ya no es "pronto", es historia. */
  missingTone?: 'gold' | 'neutral'
  /** El mes en curso: su gasto es parcial, así que no se calcula Sobró/Déficit. */
  isCurrent?: boolean
}

// ago 2026 (Cas: "quiero que ingresos... también sea la misma lógica, tocar
// ver contenido y con botones para editar y eliminar") — mismo patrón que
// la Billetera USD y el Historial de gastos: tocar la fila abre un detalle
// de solo lectura, con Eliminar (confirmación inline) y Editar (abre el
// formulario real, IncomeSheet, ahora controlable desde afuera) en el footer.
export default function IncomeHistoryRow({
  userId, month, year, monthName, income, prevIncome, surplus, expense, payslip,
  missingTone = 'neutral', isCurrent = false,
}: Props) {
  const router   = useRouter()
  const supabase = createClient()

  const [detailOpen, setDetailOpen]     = useState(false)
  const [formOpen,   setFormOpen]       = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting,   setDeleting]       = useState(false)
  const [deleteError, setDeleteError]   = useState('')

  const isReg = income !== null
  const chipLabel = isReg ? 'Registrado' : isCurrent ? 'Aún no llega' : 'Sin registrar'
  const chipStyle: React.CSSProperties = isReg
    ? { background: 'color-mix(in srgb, var(--mint) 14%, var(--surface))', color: 'var(--mint-ink)' }
    : missingTone === 'gold'
    ? { background: 'color-mix(in srgb, var(--gold) 16%, var(--surface))', color: 'var(--gold-ink)' }
    : { background: 'var(--surface-2)', color: 'var(--ink-3)' }
  function closeDetail() { setDetailOpen(false); setConfirmDelete(false); setDeleteError('') }
  const dialog = useBackdropDialog(closeDetail, `Ingreso de ${monthName} ${year}`)

  async function handleDelete() {
    setDeleting(true); setDeleteError('')
    const { error } = await supabase.from('incomes').delete()
      .eq('user_id', userId).eq('month', month).eq('year', year)
    setDeleting(false)
    if (error) { setDeleteError(DELETE_ERROR); return }
    closeDetail()
    router.refresh()
  }

  return (
    <>
      <button
        onClick={() => setDetailOpen(true)}
        className="w-full text-left group px-4 lg:px-6 py-4 flex items-center gap-3 lg:gap-5 transition-colors hover:bg-[var(--surface-2)] border-t"
        style={{ borderColor: 'color-mix(in srgb, var(--border) 55%, transparent)' }}
      >
        {/* Mes */}
        <div className="flex items-center gap-2 w-32 shrink-0">
          <CalendarDays className="w-3.5 h-3.5 shrink-0" aria-hidden style={{ color: 'var(--ink-3)' }} />
          <div>
            <span className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{monthName}</span>
            <span className="text-[11px] ml-1.5" style={{ color: 'var(--ink-3)' }}>{year}</span>
            <div className="sm:hidden mt-1 flex items-center gap-1.5">
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={chipStyle}>{chipLabel}</span>
              {payslip && <FileText className="w-3.5 h-3.5" aria-label="Con liquidación" style={{ color: 'var(--primary)' }} strokeWidth={2.5} />}
            </div>
          </div>
        </div>

        {/* Badge — en móvil vive bajo el mes (ahí no cabe una columna aparte) */}
        <span className="hidden sm:inline text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0" style={chipStyle}>
          {chipLabel}
        </span>
        {payslip && (
          <FileText className="hidden sm:block w-3.5 h-3.5 shrink-0" aria-label="Con liquidación" style={{ color: 'var(--primary)' }} strokeWidth={2.5} />
        )}

        {/* Monto + surplus */}
        <div className="flex-1 min-w-0">
          {income
            ? <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(income.amount)}</p>
            : <p className="text-sm" style={{ color: 'var(--ink-3)' }}>—</p>
          }
          {!isCurrent && surplus !== null && expense > 0 && prevIncome && (
            <p className="text-[11px] font-semibold tabular-nums mt-0.5"
              style={{ color: surplus >= 0 ? 'var(--mint-ink)' : 'var(--ink-2)' }}>
              {surplus >= 0 ? 'Sobró ' : 'Déficit '}{formatCLP(Math.abs(surplus))}
              {' '}· {surplus >= 0 ? '' : '−'}{Math.abs(Math.round((surplus / prevIncome.amount) * 100))}% del sueldo anterior
            </p>
          )}
        </div>

        <ChevronRight className="w-4 h-4 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden style={{ color: 'var(--ink-3)' }} />
      </button>

      {/* ── Detalle de solo lectura ─────────────────────────────────────── */}
      {detailOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.65)' }}
          {...dialog}
        >
          <div
            className="w-full lg:max-w-md rounded-t-3xl lg:rounded-3xl overflow-hidden"
            style={{ background: 'var(--surface)', maxHeight: '92dvh' }}
          >
            <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-1 lg:hidden" style={{ background: 'var(--border)' }} />

            <div className="flex items-center gap-3 px-5 pt-4 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: 'color-mix(in srgb, var(--mint) 14%, var(--surface))' }}>
                <CalendarDays className="w-4 h-4" aria-hidden style={{ color: 'var(--mint-ink)' }} strokeWidth={2.5} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-bold truncate" style={{ color: 'var(--ink)' }}>Ingreso de {monthName}</h2>
                <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>{chipLabel} · {year}</p>
              </div>
              <button
                onClick={closeDetail}
                aria-label="Cerrar"
                className="w-11 h-11 flex items-center justify-center rounded-full transition-colors"
                style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(92dvh - 190px)' }}>
              <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Monto</span>
                  <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                    {income ? formatCLP(income.amount) : 'Sin registrar'}
                  </span>
                </div>
                {income && income.breakdown.length > 0 && income.breakdown.map((it, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs" style={{ color: 'var(--ink-3)' }}>{it.label || 'Sin nombre'}</span>
                    <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--ink-2)' }}>{formatCLP(it.amount)}</span>
                  </div>
                ))}
              </div>

              <div>
                <p className="text-[11px] font-bold mb-1" style={{ color: 'var(--ink-3)' }}>
                  Nota
                </p>
                <p className="text-sm" style={{ color: income?.description ? 'var(--ink-2)' : 'var(--ink-3)' }}>
                  {income?.description || (isReg ? 'Sin nota — agrégala al editar.' : 'Todavía no hay un ingreso registrado para este mes.')}
                </p>
              </div>

              {payslip && (
                <PayslipInlineDetail month={month} year={year} monthName={monthName} payslip={payslip} />
              )}

              {confirmDelete && (
                <div className="rounded-2xl p-4 space-y-3" style={{ background: 'color-mix(in srgb, var(--coral) 8%, var(--surface))' }}>
                  <p className="text-sm text-center font-medium" style={{ color: 'var(--ink-2)' }}>
                    ¿Eliminar el ingreso de {monthName}?
                  </p>
                  {deleteError && (
                    <p className="text-xs text-center font-medium" role="alert" style={{ color: 'var(--coral-ink)' }}>{deleteError}</p>
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="flex-1 py-3 text-sm font-semibold rounded-2xl border transition-colors"
                      style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', background: 'var(--surface)' }}
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-bold rounded-2xl"
                      style={{ background: 'var(--coral)', color: 'white' }}
                    >
                      {deleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      {deleting ? 'Eliminando…' : 'Eliminar'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {!confirmDelete && (
              <div className="border-t px-5 py-3 flex items-center gap-2 flex-shrink-0" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                {isReg && (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="w-11 h-11 flex items-center justify-center rounded-2xl border shrink-0 transition-colors"
                    style={{ borderColor: 'var(--border)', color: 'var(--coral-ink)', background: 'var(--surface-2)' }}
                    aria-label="Eliminar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={closeDetail}
                  className="flex-1 py-3 text-sm font-semibold rounded-2xl border transition-colors"
                  style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', background: 'var(--surface-2)' }}
                >
                  Cerrar
                </button>
                <button
                  onClick={() => { setDetailOpen(false); setConfirmDelete(false); setFormOpen(true) }}
                  className="flex-1 py-3 text-sm font-bold rounded-2xl transition-all active:scale-[.98]"
                  style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 6px 16px var(--shadow)' }}
                >
                  {isReg ? 'Editar' : 'Registrar'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Formulario real — controlado desde acá, sin trigger propio */}
      <IncomeSheet
        userId={userId}
        month={month}
        year={year}
        current={income}
        prevIncome={prevIncome}
        monthName={monthName}
        isOpen={formOpen}
        onOpenChange={setFormOpen}
        hideTrigger
      />
    </>
  )
}
