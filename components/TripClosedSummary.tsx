import { PartyPopper } from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import { TRIP_CATEGORIES, type TripCategory } from '@/lib/shared-split'

/** Resumen al cerrar el viaje: lo que costó, lo tuyo y contra el presupuesto. */
export default function TripClosedSummary({
  total, myShare, myPaid, budget, spent, people, count, startDate, endDate, hideTotal = false, hideMine = false,
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
  /** El total ya está en el encabezado de la página: aquí solo se cuenta de qué se compone. */
  hideTotal?: boolean
  /** «Tu parte» y «Pusiste tú» ya los muestra la cuadratura de cuentas. */
  hideMine?:  boolean
}) {
  const days = startDate && endDate
    ? Math.max(1, Math.round((new Date(endDate + 'T12:00:00').getTime() - new Date(startDate + 'T12:00:00').getTime()) / 86400000) + 1)
    : null
  const diff = budget > 0 ? total - budget : null
  const top = TRIP_CATEGORIES.map(c => ({ ...c, v: spent[c.key] })).filter(c => c.v > 0).sort((a, b) => b.v - a.v)

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <PartyPopper className="w-4 h-4" style={{ color: 'var(--mint-ink)' }} />
        <h2 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Resumen del viaje</h2>
      </div>

      <div>
        {!hideTotal && <p className="font-display text-3xl font-extrabold tabular-nums leading-none" style={{ color: 'var(--ink)' }}>{formatCLP(total)}</p>}
        <p className={hideTotal ? 'text-sm' : 'text-xs mt-1.5'} style={{ color: hideTotal ? 'var(--ink-2)' : 'var(--ink-3)' }}>
          en {count} {count === 1 ? 'gasto' : 'gastos'}{people > 1 ? ` · ${people} personas` : ''}
          {days ? ` · ${days} ${days === 1 ? 'día' : 'días'} (${formatCLP(Math.round(total / days))} al día)` : ''}
        </p>
        {diff != null && (
          <p className="text-xs mt-1 font-semibold" style={{ color: diff > 0 ? 'var(--gold-ink)' : 'var(--mint-ink)' }}>
            {diff > 0 ? `${formatCLP(diff)} sobre` : `${formatCLP(-diff)} bajo`} el presupuesto de {formatCLP(budget)}
          </p>
        )}
      </div>

      {people > 1 && !hideMine && <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl p-3" style={{ background: 'var(--surface-2)' }}>
          <p className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Tu parte</p>
          <p className="text-lg font-bold tabular-nums mt-0.5" style={{ color: 'var(--ink)' }}>{formatCLP(myShare)}</p>
        </div>
        <div className="rounded-2xl p-3" style={{ background: 'var(--surface-2)' }}>
          <p className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Pusiste tú</p>
          <p className="text-lg font-bold tabular-nums mt-0.5" style={{ color: 'var(--ink)' }}>{formatCLP(myPaid)}</p>
        </div>
      </div>}

      {top.length > 0 && (
        <div className="space-y-3">
          {top.map((c, i) => (
            <div key={c.key}>
              <div className="flex justify-between gap-2 text-sm">
                <span style={{ color: 'var(--ink-2)' }}>{c.label}</span>
                <span className="tabular-nums font-semibold" style={{ color: 'var(--ink)' }}>
                  {formatCLP(c.v)} <span style={{ color: 'var(--ink-3)' }}>· {Math.round((c.v / total) * 100)}%</span>
                </span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full" style={{ background: 'var(--surface-2)' }} aria-hidden>
                <div className="h-full rounded-full rc-grow" style={{ width: `${Math.max(2, (c.v / top[0].v) * 100)}%`, background: 'var(--primary)', opacity: i === 0 ? 1 : 0.55, ['--d' as string]: `${i * 40}ms` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
