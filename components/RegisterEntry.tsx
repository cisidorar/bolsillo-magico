'use client'

import { useState } from 'react'
import { Plus, Pencil, Upload, PenLine, X, ChevronRight } from 'lucide-react'
import { useBackdropDialog } from '@/components/useBackdropClose'
import IncomeSheet from '@/components/IncomeSheet'
import PayslipUploader from '@/components/PayslipUploader'
import type { IncomeData } from '@/components/IncomeMonthEditor'

interface Props {
  userId:          string
  month:           number
  year:            number
  current:         IncomeData | null
  prevIncome:      IncomeData | null
  monthName:       string
  existingAmounts: Record<string, number>
}

// Una sola puerta para registrar el sueldo. Con la liquidación a mano es el
// camino más rápido y exacto, así que "Subir liquidación" es la primera
// opción; el monto a mano queda como alternativa. Editar un mes que ya existe
// salta directo al formulario: ahí no hay nada que elegir.
export default function RegisterEntry({ userId, month, year, current, prevIncome, monthName, existingAmounts }: Props) {
  const [chooserOpen, setChooserOpen] = useState(false)
  const [formOpen, setFormOpen]       = useState(false)
  const [uploadOpen, setUploadOpen]   = useState(false)

  const dialog = useBackdropDialog(() => setChooserOpen(false), `Registrar el sueldo de ${monthName}`)

  function start() {
    if (current) setFormOpen(true)
    else setChooserOpen(true)
  }

  return (
    <>
      <button
        onClick={start}
        className="flex items-center gap-1.5 px-4 min-h-[44px] text-sm font-bold rounded-xl transition-all active:scale-[.97] shrink-0"
        style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 6px 18px var(--shadow)' }}
      >
        {current ? <Pencil className="w-4 h-4" strokeWidth={2.5} /> : <Plus className="w-4 h-4" strokeWidth={2.5} />}
        {current ? 'Editar' : 'Registrar'}
      </button>

      {chooserOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.65)' }}
          {...dialog}
        >
          <div className="w-full lg:max-w-md rounded-t-3xl lg:rounded-3xl" style={{ background: 'var(--surface)' }}>
            <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-1 lg:hidden" style={{ background: 'var(--border)' }} />
            <div className="flex items-center justify-between px-5 pt-4 pb-3">
              <h2 className="text-base font-bold" style={{ color: 'var(--ink)' }}>Registrar el sueldo de {monthName}</h2>
              <button
                onClick={() => setChooserOpen(false)}
                aria-label="Cerrar"
                className="w-11 h-11 flex items-center justify-center rounded-full"
                style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 pb-6 space-y-3">
              <button
                onClick={() => { setChooserOpen(false); setUploadOpen(true) }}
                className="w-full flex items-center gap-3 text-left rounded-2xl px-4 py-4 min-h-[44px] transition-all active:scale-[.99]"
                style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 6px 16px var(--shadow)' }}
              >
                <Upload className="w-5 h-5 shrink-0" strokeWidth={2.5} aria-hidden />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold">Subir mi liquidación (PDF)</span>
                  <span className="block text-xs mt-0.5" style={{ opacity: 0.85 }}>Leemos los montos por ti y registramos tu líquido.</span>
                </span>
                <ChevronRight className="w-4 h-4 shrink-0" aria-hidden />
              </button>
              <button
                onClick={() => { setChooserOpen(false); setFormOpen(true) }}
                className="w-full flex items-center gap-3 text-left rounded-2xl px-4 py-4 min-h-[44px] border transition-colors"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--ink)' }}
              >
                <PenLine className="w-5 h-5 shrink-0" style={{ color: 'var(--ink-3)' }} aria-hidden />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold">Ingresar el monto a mano</span>
                  <span className="block text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>Si no tienes el PDF todavía.</span>
                </span>
                <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--ink-3)' }} aria-hidden />
              </button>
            </div>
          </div>
        </div>
      )}

      <PayslipUploader existingAmounts={existingAmounts} isOpen={uploadOpen} onOpenChange={setUploadOpen} hideTrigger />
      <IncomeSheet
        userId={userId} month={month} year={year}
        current={current} prevIncome={prevIncome} monthName={monthName}
        isOpen={formOpen} onOpenChange={setFormOpen} hideTrigger
      />
    </>
  )
}
