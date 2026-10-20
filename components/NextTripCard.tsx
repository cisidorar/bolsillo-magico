import Link from 'next/link'
import { Plane, ChevronRight } from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import type { NextTrip, TripToSettle } from '@/lib/next-trip'

/** "Próximo viaje" en /inicio. Gold/mint solamente (UX5): nunca es urgencia del día. */
export default function NextTripCard({ trip }: { trip: NextTrip }) {
  const when = trip.inProgress ? 'En viaje ahora'
    : trip.daysToStart == null ? 'Fechas por definir'
    : trip.daysToStart === 0 ? 'Sale hoy'
    : trip.daysToStart === 1 ? 'Sale mañana'
    : trip.daysToStart < 60 ? `Sale en ${trip.daysToStart} días`
    : `Sale en ${Math.round(trip.daysToStart / 30)} meses`
  const pct = trip.goal && trip.goal.target > 0 ? Math.min(100, Math.round((trip.goal.current / trip.goal.target) * 100)) : 0

  return (
    <Link href={`/compartidos?g=${trip.id}`} className="card p-4 block transition-colors hover:brightness-[.99]">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--primary-soft)' }}>
          <Plane className="w-5 h-5" style={{ color: 'var(--primary)' }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-3)' }}>Próximo viaje · {when}</p>
          <p className="text-sm font-bold truncate" style={{ color: 'var(--ink)' }}>{trip.name}</p>
        </div>
        <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ink-3)' }} />
      </div>

      {trip.budgetTotal > 0 ? (
        <div className="mt-3">
          <p className="text-xs" style={{ color: 'var(--ink-2)' }}>
            Tu parte estimada <b className="tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(trip.myShare)}</b>
            {trip.myPaid > 0 && <span style={{ color: 'var(--ink-3)' }}> · ya van {formatCLP(trip.myPaid)}</span>}
          </p>
          {trip.goal ? (
            <>
              <div className="h-1.5 rounded-full mt-2 overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--mint)' }} />
              </div>
              <p className="text-[11px] mt-1 tabular-nums" style={{ color: 'var(--ink-3)' }}>
                Ahorrado {formatCLP(trip.goal.current)} de {formatCLP(trip.goal.target)}
                {trip.perMonth != null && trip.perMonth > 0 && !trip.inProgress && (
                  <span style={{ color: 'var(--gold-ink)' }}> · aparta {formatCLP(trip.perMonth)} al mes</span>
                )}
              </p>
            </>
          ) : (
            <p className="text-[11px] mt-1" style={{ color: 'var(--ink-3)' }}>Crea una meta de ahorro para llegar con la plata lista.</p>
          )}
        </div>
      ) : (
        <p className="text-xs mt-3" style={{ color: 'var(--ink-3)' }}>Aún sin presupuesto estimado.</p>
      )}
      <p className="text-[10px] mt-2" style={{ color: 'var(--ink-3)' }}>Los gastos del viaje no cuentan en tu presupuesto del mes.</p>
    </Link>
  )
}

/** Después del viaje: chip gold (UX5: atención pronto, no urgencia del día). */
export function TripSettleChips({ trips }: { trips: TripToSettle[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {trips.map(t => (
        <Link key={t.id} href={`/compartidos?g=${t.id}`}
          className="inline-flex items-center gap-1.5 px-3 min-h-[36px] rounded-full text-xs font-semibold"
          style={{ background: 'rgba(255,194,60,0.14)', color: 'var(--gold)' }}>
          <Plane className="w-3.5 h-3.5" />
          {t.name}: {t.net < 0 ? `debes ${formatCLP(-t.net)}` : `te deben ${formatCLP(t.net)}`}
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      ))}
    </div>
  )
}
