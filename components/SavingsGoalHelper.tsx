'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Sparkles, Check, Loader2 } from 'lucide-react'
import { formatCLP } from '@/lib/utils'

interface Props {
  userId: string
  month: number
  year: number
  avgIncome: number | null       // ingreso promedio de los últimos 6 meses cerrados
  committedFloor: number         // fijos + cuotas vigentes de este mes (piso imposible de bajar)
}

function formatInput(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  return parseInt(digits).toLocaleString('es-CL')
}

function parseDraft(s: string): number {
  return parseInt(s.replace(/\./g, '').replace(/,/g, '')) || 0
}

/**
 * P4 — "Pay yourself first": en vez de que el límite de gasto sea un número
 * arbitrario, se deriva de una meta de ahorro explícita usando el ingreso
 * promedio ya registrado (`incomes`): límite sugerido = ingreso − meta.
 */
export default function SavingsGoalHelper({ userId, month, year, avgIncome, committedFloor }: Props) {
  const router   = useRouter()
  const supabase = createClient()

  const [goalDraft, setGoalDraft] = useState('')
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)

  if (!avgIncome) {
    return (
      <div className="card p-4 mb-5 flex items-start gap-3" style={{ borderColor: 'var(--border)' }}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--primary-soft)' }}>
          <Sparkles className="w-4 h-4" style={{ color: 'var(--primary)' }} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Deriva tu límite de una meta de ahorro</p>
          <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--ink-3)' }}>
            Registra tus ingresos de los últimos meses en <a href="/ingresos" className="font-semibold hover:opacity-70" style={{ color: 'var(--primary)' }}>Ingresos</a> para
            calcular cuánto puedes gastar sin sacrificar tu ahorro.
          </p>
        </div>
      </div>
    )
  }

  const goal = parseDraft(goalDraft)
  const suggested = goal > 0 ? avgIncome - goal : null
  const belowFloor = suggested !== null && committedFloor > 0 && suggested < committedFloor

  async function applySuggested() {
    if (suggested === null || suggested <= 0) return
    setSaving(true)
    await supabase.from('budgets').upsert(
      { user_id: userId, month, year, amount: suggested },
      { onConflict: 'user_id,month,year' }
    )
    setSaving(false)
    setSaved(true)
    setTimeout(() => { setSaved(false); router.refresh() }, 800)
  }

  return (
    <div className="card p-4 lg:p-5 mb-5" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--primary-soft)' }}>
          <Sparkles className="w-4 h-4" style={{ color: 'var(--primary)' }} />
        </div>
        <div>
          <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Deriva tu límite de una meta de ahorro</p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-3)' }}>
            Tu ingreso promedio (6m): <span className="font-bold tabular-nums" style={{ color: 'var(--ink-2)' }}>{formatCLP(avgIncome)}</span>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-1.5 rounded-2xl px-3 py-2.5 text-sm font-bold flex-shrink-0"
          style={{ background: 'var(--surface-2)', border: '1.5px solid var(--border)' }}>
          <span style={{ color: 'var(--ink-3)' }}>Quiero ahorrar $</span>
          <input
            type="text"
            inputMode="numeric"
            value={goalDraft}
            onChange={e => { setGoalDraft(formatInput(e.target.value)); setSaved(false) }}
            placeholder="0"
            className="w-28 bg-transparent outline-none tabular-nums"
            style={{ color: 'var(--ink)' }}
          />
        </label>

        {suggested !== null && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs" style={{ color: 'var(--ink-3)' }}>→ tu límite sería</span>
            <span className="text-base font-extrabold tabular-nums"
              style={{ color: suggested > 0 ? 'var(--ink)' : 'var(--coral)' }}>
              {formatCLP(Math.max(suggested, 0))}
            </span>
            <button
              onClick={applySuggested}
              disabled={saving || suggested <= 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-opacity hover:opacity-85 disabled:opacity-40"
              style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <Check className="w-3.5 h-3.5" /> : null}
              {saved ? 'Aplicado' : 'Usar este límite'}
            </button>
          </div>
        )}
      </div>

      {belowFloor && (
        <p className="text-[11px] mt-2.5" style={{ color: 'var(--coral)' }}>
          Con esa meta tu límite ({formatCLP(Math.max(suggested!, 0))}) queda por debajo de lo que ya tienes comprometido en fijos y cuotas ({formatCLP(committedFloor)}) —
          no vas a poder cumplirlo sin bajar la meta o revisar tus recurrentes.
        </p>
      )}
    </div>
  )
}
