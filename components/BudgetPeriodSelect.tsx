'use client'

import { useState, useTransition } from 'react'
import { CalendarRange, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { currentStatementRange } from '@/lib/utils'

interface CreditCardLite {
  id:          string
  name:        string
  billing_day: number
}

interface Props {
  userId:       string
  budgetPeriod: string          // 'calendar' | 'billing'
  periodCardId: string | null
  creditCards:  CreditCardLite[]
}

/**
 * Preferencia: cómo mide el inicio — mes calendario o período de facturación
 * de la tarjeta (Fase 2 del plan de configuración).
 */
export default function BudgetPeriodSelect({ userId, budgetPeriod: initPeriod, periodCardId: initCard, creditCards }: Props) {
  const supabase = createClient()
  const [isPending, startTransition] = useTransition()
  const [period, setPeriod] = useState(initPeriod)
  const [cardId, setCardId] = useState<string | null>(initCard)
  const [saved,  setSaved]  = useState(false)

  const hasCards = creditCards.length > 0
  const activeCard = creditCards.find(c => c.id === cardId) ?? creditCards[0] ?? null

  const save = (nextPeriod: string, nextCardId: string | null) => {
    setPeriod(nextPeriod)
    setCardId(nextCardId)
    setSaved(false)
    startTransition(async () => {
      await supabase.from('profiles')
        .update({ budget_period: nextPeriod, period_card_id: nextCardId })
        .eq('id', userId)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  const fmtShort = (d: string) =>
    new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }).replace('.', '')
  const range = period === 'billing' && activeCard ? currentStatementRange(activeCard.billing_day) : null

  return (
    <div className="card p-4">
      <div className="flex items-center gap-4">
        <div className="cat-icon-bg w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ '--cat-bg': '#EEF4FF', '--cat-color': '#2B7CF6' } as React.CSSProperties}>
          <CalendarRange className="w-5 h-5" style={{ color: '#2B7CF6' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Período del presupuesto</p>
            {saved && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold" style={{ color: 'var(--mint)' }}>
                <Check className="w-3 h-3" /> Guardado
              </span>
            )}
          </div>
          <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--ink-3)' }}>
            {period === 'billing' && range
              ? `Tu inicio mide del ${fmtShort(range.start)} al ${fmtShort(range.end)} (corte de ${activeCard!.name}).`
              : 'Tu inicio mide por mes calendario (del 1 al último día).'}
          </p>
        </div>
      </div>

      {/* Selector de modo */}
      <div className="flex items-center gap-1.5 flex-wrap mt-3 pl-[56px]">
        <button
          type="button"
          onClick={() => save('calendar', cardId)}
          disabled={isPending}
          className="px-3 py-1.5 rounded-full text-[11px] font-bold transition-all active:scale-95"
          style={period === 'calendar'
            ? { background: 'var(--primary)', color: 'var(--primary-ink)' }
            : { background: 'var(--surface-2)', color: 'var(--ink-3)' }}
        >
          Mes calendario
        </button>
        <button
          type="button"
          onClick={() => hasCards && save('billing', cardId ?? creditCards[0].id)}
          disabled={isPending || !hasCards}
          className="px-3 py-1.5 rounded-full text-[11px] font-bold transition-all active:scale-95 disabled:opacity-40"
          style={period === 'billing'
            ? { background: 'var(--primary)', color: 'var(--primary-ink)' }
            : { background: 'var(--surface-2)', color: 'var(--ink-3)' }}
        >
          Facturación de tarjeta
        </button>
      </div>

      {/* Selector de tarjeta (solo modo billing con más de una) */}
      {period === 'billing' && creditCards.length > 1 && (
        <div className="flex items-center gap-1.5 flex-wrap mt-2 pl-[56px]">
          <span className="text-[11px] font-semibold" style={{ color: 'var(--ink-3)' }}>Corte de</span>
          {creditCards.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => save('billing', c.id)}
              disabled={isPending}
              className="px-2.5 py-1 rounded-full text-[11px] font-bold transition-all active:scale-95"
              style={(cardId ?? creditCards[0].id) === c.id
                ? { background: 'var(--primary)', color: 'var(--primary-ink)' }
                : { background: 'var(--surface-2)', color: 'var(--ink-3)' }}
            >
              {c.name} · día {c.billing_day}
            </button>
          ))}
        </div>
      )}

      {/* Sin tarjetas de crédito: explicar por qué billing está deshabilitado */}
      {!hasCards && (
        <p className="text-[11px] mt-2 pl-[56px]" style={{ color: 'var(--ink-3)' }}>
          Para medir por facturación necesitas una tarjeta de crédito con día de corte en Métodos de pago.
        </p>
      )}
    </div>
  )
}
