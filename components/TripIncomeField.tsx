'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { formatCLP } from '@/lib/utils'

/**
 * «¿Cuánto ganas al mes, en promedio?»: lo que se pide para repartir un viaje según sueldo.
 * Es privado: los demás del viaje solo ven el porcentaje que sale del reparto, nunca este monto.
 */
export default function TripIncomeField({ onSubmit, label, busy, error }: {
  onSubmit: (amount: number) => void
  label: string
  busy?: boolean
  error?: string
}) {
  const [digits, setDigits] = useState('')
  const amount = Number(digits || 0)
  const bad = digits.length > 0 && amount <= 0

  return (
    <form
      onSubmit={e => { e.preventDefault(); if (amount > 0 && !busy) onSubmit(amount) }}
      className="space-y-2.5"
    >
      <div>
        <label htmlFor="trip-income" className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--ink)' }}>
          ¿Cuánto ganas al mes, en promedio?
        </label>
        <input
          id="trip-income" inputMode="numeric" autoComplete="off" enterKeyHint="go"
          value={digits ? formatCLP(amount) : ''}
          onChange={e => setDigits(e.target.value.replace(/\D/g, '').slice(0, 10))}
          placeholder="$1.200.000"
          aria-invalid={bad || !!error || undefined}
          aria-describedby="trip-income-hint"
          className="w-full min-h-[48px] rounded-xl px-4 text-base font-semibold tabular-nums outline-none"
          style={{ background: 'var(--surface-2)', color: 'var(--ink)' }}
        />
        <p id="trip-income-hint" className="text-xs mt-1.5" style={{ color: 'var(--ink-3)' }}>
          Líquido, en pesos. Es privado: los demás solo ven tu porcentaje, nunca este monto. Puedes cambiarlo cuando quieras.
        </p>
      </div>
      {error && <p role="alert" className="text-sm font-semibold" style={{ color: 'var(--coral-ink)' }}>{error}</p>}
      <button type="submit" disabled={busy || amount <= 0}
        className="px-5 min-h-[44px] rounded-xl text-sm font-bold disabled:opacity-50 inline-flex items-center gap-2 transition-transform active:scale-[.98]"
        style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}>
        {busy ? <><Loader2 className="w-4 h-4 auth-spinner" aria-hidden /> Guardando…</> : label}
      </button>
    </form>
  )
}
