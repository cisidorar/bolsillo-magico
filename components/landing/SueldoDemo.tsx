'use client'

import { useState } from 'react'
import { formatCLP } from '@/lib/utils'
import PayCycleTimeline, { type PayCycleProps } from '@/components/PayCycleTimeline'

// Pilar "Tu sueldo, y lo que te queda de él": la cifra reacciona a lo que
// mueves, igual que la demo. Ficticio.
export default function SueldoDemo({ cycle, sueldo = 1450000, gastado = 831800 }: {
  cycle: PayCycleProps; sueldo?: number; gastado?: number
}) {
  const [extra, setExtra] = useState(0)
  const queda = sueldo - gastado - extra
  const pct = Math.min(100, Math.round(((gastado + extra) / sueldo) * 100))

  return (
    <div className="space-y-4">
      <div className="card p-5 lg:p-6">
        <p className="text-xs font-bold" style={{ color: 'var(--ink-3)' }}>Lo que queda de tu sueldo de {cycle.paidMonthName}</p>
        <p className="text-4xl font-extrabold tabular-nums mt-1 transition-colors" style={{ fontFamily: 'var(--font-fredoka), sans-serif', color: 'var(--ink)' }}>
          {queda >= 0 ? formatCLP(queda) : `−${formatCLP(-queda)}`}
        </p>
        <div className="h-2 rounded-full overflow-hidden mt-3" style={{ background: 'var(--surface-2)' }}>
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--primary)', transition: 'width .5s cubic-bezier(.16,1,.3,1)' }} />
        </div>
        <p className="text-xs mt-1.5 tabular-nums" style={{ color: 'var(--ink-3)' }}>
          Llevas gastado {formatCLP(gastado + extra)} de {formatCLP(sueldo)}{queda < 0 && ' · te pasaste'}
        </p>
        <label htmlFor="ld-extra" className="flex items-baseline justify-between mt-5 text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>
          <span>¿Y si gastas algo más este mes?</span>
          <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(extra)}</span>
        </label>
        <input id="ld-extra" type="range" min={0} max={800000} step={10000} value={extra}
          onChange={e => setExtra(Number(e.target.value))} className="w-full h-11 accent-[var(--primary)] cursor-pointer" />
      </div>
      <PayCycleTimeline {...cycle} />
    </div>
  )
}
