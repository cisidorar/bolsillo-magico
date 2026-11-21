'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, ChevronRight } from 'lucide-react'
import ExpenseSheet from '@/components/ExpenseSheet'
import type { Category, PaymentMethod } from '@/types'

/**
 * Primeros pasos para una cuenta nueva (primeros 30 días). Tres cosas concretas, con lo que
 * ya hizo marcado; desaparece sola cuando están las tres. Todo se deduce de los datos reales
 * (no guarda estado), así que no hay nada que "descartar" ni que quede pegado.
 */
export default function GettingStartedCard({ hasExpense, hasMethod, hasPayday, categories, paymentMethods }: {
  hasExpense: boolean
  hasMethod:  boolean
  hasPayday:  boolean
  categories:     Category[]
  paymentMethods: PaymentMethod[]
}) {
  const [open, setOpen] = useState(false)
  const done = [hasExpense, hasMethod, hasPayday].filter(Boolean).length

  const rowCls = 'w-full flex items-center gap-3 py-2.5 min-h-[48px] text-left'
  const mark = (ok: boolean) => (
    <span className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 border-2"
      style={ok
        ? { background: 'var(--mint)', borderColor: 'var(--mint)', color: 'white' }
        : { borderColor: 'var(--border)', color: 'transparent' }}>
      <Check className="w-3.5 h-3.5" aria-hidden />
    </span>
  )
  const label = (title: string, sub: string, ok: boolean) => (
    <span className="flex-1 min-w-0">
      <span className="block text-sm font-semibold" style={{ color: ok ? 'var(--ink-3)' : 'var(--ink)', textDecoration: ok ? 'line-through' : 'none' }}>{title}</span>
      {!ok && <span className="block text-xs" style={{ color: 'var(--ink-3)' }}>{sub}</span>}
    </span>
  )

  return (
    <div className="card p-5">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h2 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Para empezar</h2>
        <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--ink-3)' }}>{done} de 3</span>
      </div>

      <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
        <button type="button" onClick={() => !hasExpense && setOpen(true)} disabled={hasExpense} className={rowCls}>
          {mark(hasExpense)}
          {label('Registra tu primer gasto', 'Toma 10 segundos y ya ves tu mes.', hasExpense)}
          {!hasExpense && <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ink-3)' }} aria-hidden />}
        </button>
        {hasMethod ? (
          <div className={rowCls}>{mark(true)}{label('Cómo pagas', '', true)}</div>
        ) : (
          <Link href="/metodos" className={rowCls}>
            {mark(false)}
            {label('Agrega cómo pagas', 'Tu tarjeta o efectivo: así cuadras lo que cobra el banco.', false)}
            <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ink-3)' }} aria-hidden />
          </Link>
        )}
        {hasPayday ? (
          <div className={rowCls}>{mark(true)}{label('Día de pago', '', true)}</div>
        ) : (
          <Link href="/ajustes" className={rowCls}>
            {mark(false)}
            {label('Dinos cuándo te llega el sueldo', 'Para mostrarte cuánto falta y cuánto te queda.', false)}
            <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ink-3)' }} aria-hidden />
          </Link>
        )}
      </div>

      {open && (
        <ExpenseSheet categories={categories} paymentMethods={paymentMethods} isOpen={open} onClose={() => setOpen(false)} />
      )}
    </div>
  )
}
