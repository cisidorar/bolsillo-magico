'use client'

import { formatCLP } from '@/lib/utils'
import { committedPct, type CommittedMonth } from '@/lib/committed-timeline'
import { CalendarClock, PartyPopper } from 'lucide-react'

const MONTH_SHORT = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']

interface Props {
  months: CommittedMonth[]  // N meses consecutivos, empezando por el actual
  income: number | null     // último ingreso registrado, para el % comprometido
}

/**
 * E2 — Barra por mes del compromiso fijo conocido (cuotas + fijos +
 * anuales), con marcador cuando en ese mes termina una cuota y se libera
 * plata. El valor no es el gasto total del mes (eso ya vive en /analisis) —
 * es específicamente lo que YA está comprometido antes de gastar nada.
 */
export default function CommittedTimeline({ months, income }: Props) {
  if (months.length === 0) return null

  const maxVal = Math.max(...months.map(m => m.total), 1)
  const current = months[0]
  const pct = committedPct(current.total, income)
  const nextRelease = months.find(m => m.freesUp)

  return (
    <div className="card overflow-hidden">
      <div className="px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--primary)' }} />
          <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Ya comprometido</p>
        </div>
        <p className="text-xs mt-1" style={{ color: 'var(--ink-3)' }}>
          {pct !== null
            ? <>De tu próximo sueldo, <strong style={{ color: 'var(--ink)' }}>{formatCLP(current.total)}</strong> ya están comprometidos ({pct}%).</>
            : <>Este mes tienes <strong style={{ color: 'var(--ink)' }}>{formatCLP(current.total)}</strong> comprometidos en cuotas y fijos.</>
          }
        </p>
      </div>

      <div className="px-5 pt-4 pb-2">
        <div className="flex items-end justify-between" style={{ gap: '4px', minHeight: '90px' }}>
          {months.map((m, i) => {
            const barH = m.total > 0 ? Math.max(6, Math.round((m.total / maxVal) * 84)) : 2
            const isCurrent = i === 0
            return (
              <div key={`${m.year}-${m.month}`} className="flex-1 flex flex-col items-center justify-end" style={{ height: '90px' }}>
                <div
                  className="w-full rounded-t-[3px]"
                  style={{
                    height: `${barH}px`,
                    maxWidth: '22px',
                    background: isCurrent ? 'var(--primary)' : m.freesUp ? 'var(--mint)' : 'color-mix(in srgb, var(--primary) 28%, transparent)',
                  }}
                  title={`${MONTH_SHORT[m.month - 1]}: ${formatCLP(m.total)}`}
                />
              </div>
            )
          })}
        </div>
        <div className="flex justify-between mt-1.5" style={{ gap: '4px' }}>
          {months.map((m, i) => (
            <span key={`${m.year}-${m.month}-label`} className="flex-1 text-center text-[9px] leading-none capitalize"
              style={{ color: i === 0 ? 'var(--primary)' : 'var(--ink-3)', fontWeight: i === 0 ? 700 : 400 }}>
              {MONTH_SHORT[m.month - 1]}
            </span>
          ))}
        </div>
      </div>

      {nextRelease && (
        <div className="flex items-start gap-2.5 mx-5 mb-4 mt-2 px-3.5 py-3 rounded-xl" style={{ background: 'rgba(31,190,141,0.10)', border: '1px solid rgba(31,190,141,0.22)' }}>
          <PartyPopper className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--mint)' }} />
          <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-2)' }}>
            <strong className="capitalize" style={{ color: 'var(--mint)' }}>{MONTH_SHORT[nextRelease.month - 1]}</strong> — se te liberan{' '}
            {formatCLP(nextRelease.releasing.reduce((s, r) => s + r.amount, 0))}/mes{' '}
            ({nextRelease.releasing.map(r => `última cuota de ${r.name}`).join(', ')})
          </p>
        </div>
      )}
    </div>
  )
}
