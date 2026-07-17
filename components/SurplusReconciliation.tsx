'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PiggyBank, DollarSign, Wallet, HelpCircle, Check } from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import { recordMonthSweep, type SweepDecision } from '@/app/actions/month-sweep'

interface Props {
  month: number
  year: number
  monthLabel: string          // 'Julio'
  surplus: number             // CLP, siempre > 0 acá (mes cerrado con sobrante)
  netWorthDelta: number       // Δ patrimonio neto real (net_clp) del mismo mes
  existingDecision: SweepDecision | null   // ya registrado en month_sweeps, si aplica
}

const DECISION_LABEL: Record<SweepDecision, string> = {
  saved:       'Dijiste que la guardaste o invertiste',
  wallet_usd:  'Dijiste que fue a la billetera USD',
  kept_liquid: 'Dijiste que quedó en la cuenta corriente',
  dismissed:   'Marcaste que no quisiste responder',
}

/**
 * P2 reconectado (jul 2026) — reconcilia el FLUJO (surplus: sueldo M-1 menos
 * gasto de M) contra el STOCK (Δ patrimonio neto real del mismo mes, ya
 * historizado en net_worth_snapshots). Antes la tasa de ahorro decía
 * "sobraron $X" sin que nada verificara que ese dinero aterrizó en un activo
 * — el sobrante que no se mueve a ningún lado tiende a gastarse solo, sin que
 * el usuario lo note. Vive en /analisis (no como banner diario en /inicio,
 * que fue desactivado por intrusivo) y solo aparece para un mes ya CERRADO.
 */
export default function SurplusReconciliation({
  month, year, monthLabel, surplus, netWorthDelta, existingDecision,
}: Props) {
  const router = useRouter()
  const [busy, setBusy]         = useState<SweepDecision | null>(null)
  const [decision, setDecision] = useState<SweepDecision | null>(existingDecision)

  const gap = surplus - netWorthDelta
  // Si el patrimonio subió tanto o más que el sobrante, no hay nada que explicar
  if (gap <= 0 && decision === null) return null

  async function choose(d: SweepDecision) {
    setBusy(d)
    await recordMonthSweep(month, year, surplus, d)
    setBusy(null)
    setDecision(d)
    router.refresh()
  }

  return (
    <div className="card p-4 lg:p-5 mb-3" style={{ background: 'rgba(255,194,60,0.06)', borderColor: 'rgba(255,194,60,0.30)' }}>
      <div className="flex items-start gap-3 mb-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,194,60,0.18)' }}>
          <HelpCircle className="w-4 h-4" style={{ color: 'var(--gold)' }} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
            {monthLabel} sobraron {formatCLP(surplus)}, pero tu patrimonio subió {formatCLP(Math.max(netWorthDelta, 0))}
          </p>
          <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--ink-2)' }}>
            {decision === null ? (
              <>Hay <span className="font-bold">{formatCLP(gap)}</span> que no se ven reflejados en tus activos registrados. ¿A dónde fueron?</>
            ) : (
              DECISION_LABEL[decision]
            )}
          </p>
        </div>
      </div>

      {decision === null ? (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => choose('saved')}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-opacity hover:opacity-85 disabled:opacity-40"
            style={{ background: 'var(--mint)', color: 'white' }}
          >
            <PiggyBank className="w-3.5 h-3.5" />
            La guardé o invertí en otro lado
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
          <button
            onClick={() => choose('dismissed')}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-opacity hover:opacity-70 disabled:opacity-40"
            style={{ color: 'var(--ink-3)' }}
          >
            No sé / prefiero no decir
          </button>
        </div>
      ) : (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold"
          style={{ background: 'rgba(31,190,141,0.14)', color: 'var(--mint)' }}>
          <Check className="w-3 h-3" /> Registrado
        </span>
      )}
    </div>
  )
}
