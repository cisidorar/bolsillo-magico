'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PiggyBank, DollarSign, Wallet, X } from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import { recordMonthSweep, type SweepDecision } from '@/app/actions/month-sweep'

interface Props {
  month: number
  year: number
  monthLabel: string   // 'Julio'
  surplus: number       // CLP, siempre > 0 acá
}

/**
 * P2 — al abrir el dashboard después de que cierra un mes con sobrante,
 * pregunta a dónde fue esa plata. Reconcilia la tasa de ahorro (flujo) con
 * el patrimonio (stock): el sobrante que no se mueve a ningún lado tiende a
 * gastarse solo, sin que el usuario lo note.
 */
export default function MonthSweepBanner({ month, year, monthLabel, surplus }: Props) {
  const router = useRouter()
  const [busy, setBusy]         = useState<SweepDecision | null>(null)
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  async function choose(decision: SweepDecision) {
    setBusy(decision)
    await recordMonthSweep(month, year, surplus, decision)
    setBusy(null)
    setDismissed(true)
    router.refresh()
  }

  return (
    <div className="card p-4 lg:p-5 mb-4" style={{ background: 'rgba(31,190,141,0.06)', borderColor: 'rgba(31,190,141,0.25)' }}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(31,190,141,0.15)' }}>
            <PiggyBank className="w-4 h-4" style={{ color: 'var(--mint)' }} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
              {monthLabel} cerró con {formatCLP(surplus)} de sobrante
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>
              ¿A dónde fue esa plata?
            </p>
          </div>
        </div>
        <button
          onClick={() => choose('dismissed')}
          disabled={busy !== null}
          className="w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0 hover:opacity-70 transition-opacity"
          aria-label="Cerrar"
        >
          <X className="w-4 h-4" style={{ color: 'var(--ink-3)' }} />
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => choose('saved')}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-opacity hover:opacity-85 disabled:opacity-40"
          style={{ background: 'var(--mint)', color: 'white' }}
        >
          <PiggyBank className="w-3.5 h-3.5" />
          La guardé o invertí
        </button>
        <button
          onClick={() => choose('wallet_usd')}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-opacity hover:opacity-85 disabled:opacity-40"
          style={{ background: 'var(--surface-2)', border: '1.5px solid var(--border)', color: 'var(--ink-2)' }}
        >
          <DollarSign className="w-3.5 h-3.5" />
          A la billetera USD
        </button>
        <button
          onClick={() => choose('kept_liquid')}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-opacity hover:opacity-85 disabled:opacity-40"
          style={{ background: 'var(--surface-2)', border: '1.5px solid var(--border)', color: 'var(--ink-2)' }}
        >
          <Wallet className="w-3.5 h-3.5" />
          Quedó en la cuenta corriente
        </button>
      </div>
    </div>
  )
}
