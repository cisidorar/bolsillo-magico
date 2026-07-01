'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Check, Loader2 } from 'lucide-react'

interface Props {
  userId: string
  month: number
  year: number
  currentAmount: number | null
  monthLabel: string
}

function formatInput(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  return parseInt(digits).toLocaleString('es-CL')
}

function parseDraft(s: string): number {
  return parseInt(s.replace(/\./g, '').replace(/,/g, '')) || 0
}

export default function MonthlyBudgetInput({ userId, month, year, currentAmount, monthLabel }: Props) {
  const router  = useRouter()
  const supabase = createClient()

  const [draft,  setDraft]  = useState(currentAmount ? currentAmount.toLocaleString('es-CL') : '')
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function save(value: string) {
    const amount = parseDraft(value)
    if (amount <= 0) {
      // Si está vacío, borrar el presupuesto mensual
      await supabase.from('budgets').delete().eq('user_id', userId).eq('month', month).eq('year', year)
      setSaving(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
      router.refresh()
      return
    }
    setSaving(true)
    await supabase.from('budgets').upsert(
      { user_id: userId, month, year, amount },
      { onConflict: 'user_id,month,year' }
    )
    setSaving(false)
    setSaved(true)
    setTimeout(() => { setSaved(false); router.refresh() }, 800)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const formatted = formatInput(e.target.value)
    setDraft(formatted)
    setSaved(false)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => save(formatted), 900)
  }

  function handleBlur() {
    if (timer.current) clearTimeout(timer.current)
    save(draft)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      if (timer.current) clearTimeout(timer.current)
      save(draft);
      (e.target as HTMLInputElement).blur()
    }
  }

  return (
    <div className="card p-5 mb-6" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold uppercase tracking-widest mb-0.5" style={{ color: 'var(--ink-3)' }}>
            Presupuesto total — {monthLabel}
          </p>
          <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
            Este límite aparece en el dashboard y controla la barra de progreso mensual.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div
            className="flex items-center gap-1.5 rounded-2xl px-3 py-2.5 text-sm font-bold"
            style={{ background: 'var(--surface-2)', border: '1.5px solid var(--border)' }}
          >
            <span style={{ color: 'var(--ink-3)' }}>$</span>
            <input
              type="text"
              inputMode="numeric"
              value={draft}
              onChange={handleChange}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              placeholder="0"
              className="w-28 bg-transparent outline-none tabular-nums text-right"
              style={{ color: 'var(--ink)' }}
            />
          </div>
          <div className="w-8 h-8 flex items-center justify-center rounded-xl flex-shrink-0"
            style={{ background: saved ? 'rgba(31,190,141,0.12)' : 'transparent' }}>
            {saving
              ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--ink-3)' }} />
              : saved
                ? <Check className="w-4 h-4" style={{ color: 'var(--mint)' }} />
                : null
            }
          </div>
        </div>
      </div>
    </div>
  )
}
