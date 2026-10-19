import { PartyPopper } from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import { TRIP_CATEGORIES, type TripCategory } from '@/lib/shared-split'

/** Resumen al cerrar el viaje: lo que costó, lo tuyo y contra el presupuesto. */
export default function TripClosedSummary({
  total, myShare, myPaid, budget, spent, people, count, startDate, endDate,
}: {
  total:     number
  myShare:   number
  myPaid:    number
  budget:    number
  spent:     Record<TripCategory, number>
  people:    number
  count:     number
  startDate: string | null
  endDate:   string | null
}) {
  const days = startDate && endDate
    ? Math.max(1, Math.round((new Date(endDate + 'T12:00:00').getTime() - new Date(startDate + 'T12:00:00').getTime()) / 86400000) + 1)
    : null
  const diff = budget > 0 ? total - budget : null
  const top = TRIP_CATEGORIES.map(c => ({ ...c, v: spent[c.key] })).filter(c => c.v > 0).sort((a, b) => b.v - a.v)

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <PartyPopper className="w-4 h-4" style={{ color: 'var(--mint)' }} />
        <h2 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Resumen del viaje</h2>
      </div>

      <div>
        <p className="font-display text-3xl font-extrabold tabular-nums leading-none" style={{ color: 'var(--ink)' }}>{formatCLP(total)}</p>
        <p className="text-xs mt-1.5" style={{ color: 'var(--ink-3)' }}>
          en {count} {count === 1 ? 'gasto' : 'gastos'}{people > 1 ? ` · ${people} personas` : ''}
          {days ? ` · ${days} ${days === 1 ? 'día' : 'días'} (${formatCLP(Math.round(total / days))} al día)` : ''}
        </p>
        {diff != null && (
          <p className="text-xs mt-1 font-semibold" style={{ color: diff > 0 ? 'var(--gold)' : 'var(--mint)' }}>
            {diff > 0 ? `${formatCLP(diff)} sobre` : `${formatCLP(-diff)} bajo`} el presupuesto de {formatCLP(budget)}
          </p>
        )}
      </div>

      {people > 1 && <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl p-3" style={{ background: 'var(--surface-2)' }}>
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-3)' }}>Tu parte</p>
          <p className="text-lg font-bold tabular-nums mt-0.5" style={{ color: 'var(--ink)' }}>{formatCLP(myShare)}</p>
        </div>
        <div className="rounded-2xl p-3" style={{ background: 'var(--surface-2)' }}>
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-3)' }}>Pusiste tú</p>
          <p className="text-lg font-bold tabular-nums mt-0.5" style={{ color: 'var(--ink)' }}>{formatCLP(myPaid)}</p>
        </div>
      </div>}

      {top.length > 0 && (
        <div className="space-y-1.5">
          {top.map(c => (
            <div key={c.key} className="flex justify-between text-xs">
              <span style={{ color: 'var(--ink-2)' }}>{c.label}</span>
              <span className="tabular-nums font-semibold" style={{ color: 'var(--ink)' }}>
                {formatCLP(c.v)} <span style={{ color: 'var(--ink-3)' }}>· {Math.round((c.v / total) * 100)}%</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
