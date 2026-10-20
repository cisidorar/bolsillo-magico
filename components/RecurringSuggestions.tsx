'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Repeat } from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import { useToast } from '@/components/ToastProvider'
import { createRecurringFromSuggestion } from '@/app/actions/recurring-suggestions'
import type { RecurringCandidate } from '@/lib/recurring-detect'

const DISMISS_KEY = 'recurring-suggestions-dismissed'

const cadence = (n: number) =>
  n === 1 ? 'cada mes' : n === 2 ? 'cada 2 meses' : n === 3 ? 'cada 3 meses' : 'cada 6 meses'

/**
 * Gastos que se repiten y no tienen recurrente. Es una oportunidad accionable
 * pero no urgente: va como pastilla gold + lista, nunca como banner (UX5).
 */
export default function RecurringSuggestions({
  candidates, categoryNames, methodNames,
}: {
  candidates: RecurringCandidate[]
  categoryNames: Record<string, string>
  methodNames: Record<string, string>
}) {
  const router = useRouter()
  const { showToast } = useToast()
  const [dismissed, setDismissed] = useState<string[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  // Preferencia ligera de este navegador: si no hay storage, simplemente no se recuerda.
  useEffect(() => {
    try { setDismissed(JSON.parse(localStorage.getItem(DISMISS_KEY) ?? '[]')) } catch { /* sin storage */ }
  }, [])

  function dismiss(key: string) {
    const next = [...dismissed, key]
    setDismissed(next)
    try { localStorage.setItem(DISMISS_KEY, JSON.stringify(next)) } catch { /* sin storage */ }
  }

  async function create(c: RecurringCandidate) {
    setBusy(c.key); setError('')
    const res = await createRecurringFromSuggestion({
      name: c.name, amount: c.amount, billingDay: c.billingDay, intervalMonths: c.intervalMonths,
      categoryId: c.categoryId, paymentMethodId: c.paymentMethodId, expenseIds: c.expenseIds,
    })
    setBusy(null)
    if (!res.ok) { setError(res.error); return }
    showToast(`${c.name} ahora es un gasto recurrente`)
    router.refresh()
  }

  const visible = candidates.filter(c => !dismissed.includes(c.key))
  if (visible.length === 0) return null

  return (
    <div className="card p-4 mb-6">
      <div className="flex items-center gap-2 mb-1">
        <Repeat className="w-4 h-4" style={{ color: 'var(--primary)' }} />
        <h2 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Se repiten y no son recurrentes</h2>
      </div>
      <p className="text-xs mb-2" style={{ color: 'var(--ink-3)' }}>
        Los encontré en tu historial. Si los creas, entran a tu carga mensual y al flujo de caja.
      </p>

      <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
        {visible.map(c => (
          <div key={c.key} className="py-3 flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{c.name}</p>
              <p className="text-xs tabular-nums" style={{ color: 'var(--ink-3)' }}>
                {formatCLP(c.amount)} · el {c.billingDay} {cadence(c.intervalMonths)} · {c.occurrences} veces
                {c.paymentMethodId && methodNames[c.paymentMethodId] ? ` · ${methodNames[c.paymentMethodId]}` : ''}
                {c.categoryId && categoryNames[c.categoryId] ? ` · ${categoryNames[c.categoryId]}` : ''}
              </p>
            </div>
            <button onClick={() => dismiss(c.key)} disabled={busy === c.key}
              className="px-3 min-h-[44px] text-xs font-semibold disabled:opacity-50" style={{ color: 'var(--ink-3)' }}>
              No lo es
            </button>
            <button onClick={() => create(c)} disabled={busy !== null}
              className="px-4 min-h-[44px] rounded-xl text-xs font-bold disabled:opacity-50"
              style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}>
              {busy === c.key ? 'Creando…' : 'Crear recurrente'}
            </button>
          </div>
        ))}
      </div>
      {error && <p className="text-xs font-medium mt-2" style={{ color: 'var(--coral)' }}>{error}</p>}
    </div>
  )
}
