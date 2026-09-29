'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { X, ArrowRight } from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import { useBackdropClose } from './useBackdropClose'

// ── Pop-up resumen del Fondo de emergencia (sep 2026, Cas: "lo mismo con
// fondo de emergencia [que con Depósitos/Ahorro/Acciones], que se detalle
// cuánto es el total que se necesita y no se [ve]") ─────────────────────────
// La card ya mostraba "faltan $X" para el próximo hito, pero nunca decía
// cuál era la META completa (3 y 6 meses de gasto en CLP) — solo el hueco.
// Este pop-up, igual en estructura a CategoryDetailModal, responde:
// "¿cuánto necesito guardar en total?" y no solo "¿cuánto me falta?".

interface Props {
  icon:              ReactNode  // <ShieldCheck /> ya renderizado por el padre
  monthsCovered:     number
  coveredLabel:      string | null
  coveredColor:      string
  totalSavings:      number
  avgMonthlyExpense: number | null
}

function fmtMonths(v: number): string {
  return v.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

export default function EmergencyFundDetailModal({
  icon, monthsCovered, coveredLabel, coveredColor, totalSavings, avgMonthlyExpense,
}: Props) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  const backdropClose = useBackdropClose(close)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const goals = avgMonthlyExpense !== null
    ? [3, 6].map(months => {
        const target  = Math.round(avgMonthlyExpense * months)
        const missing = Math.max(target - totalSavings, 0)
        const done    = missing === 0
        return { months, target, missing, done }
      })
    : []

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-sm font-semibold hover:opacity-70 transition-opacity"
        style={{ color: 'var(--primary)' }}
      >
        Ver
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.65)' }}
          role="dialog" aria-modal="true" aria-label="Resumen del fondo de emergencia"
          {...backdropClose}
        >
          <div
            className="w-full lg:max-w-sm rounded-t-3xl lg:rounded-3xl overflow-hidden"
            style={{ background: 'var(--surface)', maxHeight: '85dvh' }}
          >
            <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-1 lg:hidden" style={{ background: 'var(--border)' }} />

            <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--surface-2)' }}>
                  {icon}
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-3)' }}>Fondo de emergencia</p>
                  <p className="text-xl font-extrabold tabular-nums leading-tight"
                    style={{ fontFamily: 'Fredoka, sans-serif', color: coveredColor }}>
                    {fmtMonths(monthsCovered)} {monthsCovered === 1 ? 'mes cubierto' : 'meses cubiertos'}
                  </p>
                </div>
              </div>
              <button
                onClick={close}
                aria-label="Cerrar"
                className="w-8 h-8 flex items-center justify-center rounded-full transition-colors flex-shrink-0"
                style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-5 space-y-4">
              {coveredLabel && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold"
                  style={{ background: 'var(--surface-2)', color: coveredColor }}>
                  <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: coveredColor }} />
                  {coveredLabel}
                </span>
              )}

              <div className="rounded-2xl px-3.5 py-3" style={{ background: 'var(--surface-2)' }}>
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-3)' }}>Guardado hoy</p>
                <p className="text-base font-extrabold tabular-nums mt-0.5" style={{ color: 'var(--ink)' }}>{formatCLP(totalSavings)}</p>
              </div>

              {goals.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-3)' }}>
                    Cuánto necesitas en total
                  </p>
                  {goals.map(g => (
                    <div key={g.months} className="rounded-2xl px-3.5 py-3" style={{
                      background: g.done ? 'rgba(31,190,141,0.08)' : 'var(--surface-2)',
                      border: g.done ? '1px solid rgba(31,190,141,0.2)' : undefined,
                    }}>
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold" style={{ color: g.done ? 'var(--mint)' : 'var(--ink-2)' }}>
                          Meta {g.months} meses de gasto
                        </p>
                        <p className="text-sm font-extrabold tabular-nums" style={{ color: g.done ? 'var(--mint)' : 'var(--ink)' }}>
                          {formatCLP(g.target)}
                        </p>
                      </div>
                      <p className="text-[11px] mt-1" style={{ color: g.done ? 'var(--mint)' : 'var(--ink-3)' }}>
                        {g.done ? 'Meta lograda' : `faltan ${formatCLP(g.missing)}`}
                      </p>
                    </div>
                  ))}
                  <p className="text-[10px]" style={{ color: 'var(--ink-3)' }}>
                    Meta = {formatCLP(avgMonthlyExpense!)} (tu gasto promedio mensual) × meses.
                  </p>
                </div>
              ) : (
                <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
                  Todavía no hay meses completos de gasto para calcular la meta en CLP.
                </p>
              )}

              <Link
                href="/inversiones?view=ahorro#ahorro"
                onClick={close}
                className="flex items-center justify-center gap-1.5 w-full px-4 py-2.5 rounded-xl text-xs font-bold transition-opacity hover:opacity-85"
                style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}
              >
                Ver cuentas de ahorro <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
