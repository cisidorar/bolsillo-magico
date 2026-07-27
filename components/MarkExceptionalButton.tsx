'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { markExpensesAsExceptional } from '@/app/actions/mark-expense-exceptional'

/**
 * CTA "Marcar como único" de una Oportunidad de tipo one_time_purchase.
 * Excluye los gastos vinculados del análisis IA hacia adelante (no toca
 * ningún total visible — ver migración 20260725) y descarta esta oportunidad
 * para que no siga ocupando un espacio los próximos meses.
 */
export default function MarkExceptionalButton({
  insightId,
  expenseIds,
  label,
}: {
  insightId: string
  expenseIds: string[]
  label: string
}) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')

  async function handleClick() {
    if (state === 'loading' || state === 'done') return
    setState('loading')
    const res = await markExpensesAsExceptional(expenseIds, insightId)
    if (res.ok) {
      setState('done')
      router.refresh()
    } else {
      setState('error')
      setTimeout(() => setState('idle'), 2000)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={state === 'loading' || state === 'done'}
      className={cn(
        'text-xs font-semibold flex items-center gap-1 transition-opacity',
        state === 'loading' ? 'opacity-60 cursor-wait' : state === 'done' ? '' : 'hover:opacity-70'
      )}
      style={{ color: state === 'done' ? 'var(--mint)' : state === 'error' ? 'var(--coral)' : 'var(--primary)' }}
    >
      {state === 'done'
        ? <><Check className="w-3 h-3" /> Marcado como único</>
        : state === 'error'
          ? 'No se pudo — intenta de nuevo'
          : state === 'loading'
            ? 'Marcando…'
            : label}
    </button>
  )
}
