import { ArrowUp, ArrowDown } from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import type { UpcomingCharge, PriceMove, CategoryWeight } from '@/lib/recurring-insights'

const when = (days: number, date: string) =>
  days === 0 ? 'Hoy' : days === 1 ? 'Mañana'
  : new Date(date + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric' }).replace('.', '')

/**
 * Qué mirar en tus recurrentes: lo que se cobra esta semana, cuánto te están
 * subiendo (o bajando) los precios al año y qué categoría pesa más. Cada bloque
 * se oculta solo si no hay nada que decir.
 */
export default function RecurringInsights({
  upcoming, priceMoves, netAnnual, weights,
}: {
  upcoming: UpcomingCharge[]
  priceMoves: PriceMove[]
  netAnnual: number
  weights: CategoryWeight[]
}) {
  const showWeights = weights.length >= 2
  if (upcoming.length === 0 && priceMoves.length === 0 && !showWeights) return null
  const weekTotal = upcoming.reduce((s, c) => s + c.amount, 0)
  const topW = weights.slice(0, 4)

  return (
    <div className="card p-4 lg:p-5 mb-6">
      <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Qué mirar</p>
      <div className="mt-3 grid gap-6 lg:grid-cols-3">
        {upcoming.length > 0 && (
          <div>
            <p className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Esta semana</p>
            <p className="text-lg font-extrabold tabular-nums mt-0.5" style={{ color: 'var(--ink)' }}>
              {formatCLP(weekTotal)}
              <span className="text-xs font-semibold ml-1.5" style={{ color: 'var(--ink-2)' }}>
                en {upcoming.length} cargo{upcoming.length !== 1 ? 's' : ''}
              </span>
            </p>
            <ul className="mt-2 space-y-1">
              {upcoming.slice(0, 4).map(c => (
                <li key={c.id} className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate" style={{ color: 'var(--ink)' }}>
                    <span className="font-semibold capitalize">{when(c.days, c.date)}</span> · {c.name}
                  </span>
                  <span className="tabular-nums flex-shrink-0" style={{ color: 'var(--ink-2)' }}>{formatCLP(c.amount)}</span>
                </li>
              ))}
              {upcoming.length > 4 && (
                <li className="text-[11px]" style={{ color: 'var(--ink-2)' }}>y {upcoming.length - 4} más</li>
              )}
            </ul>
          </div>
        )}

        {priceMoves.length > 0 && (
          <div>
            <p className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Cambios de precio</p>
            <p className="text-lg font-extrabold tabular-nums mt-0.5" style={{ color: netAnnual > 0 ? 'var(--gold-ink)' : netAnnual < 0 ? 'var(--mint-ink)' : 'var(--ink)' }}>
              {netAnnual > 0 ? '+' : netAnnual < 0 ? '−' : ''}{formatCLP(Math.abs(netAnnual))}
              <span className="text-xs font-semibold ml-1.5" style={{ color: 'var(--ink-2)' }}>al año</span>
            </p>
            <ul className="mt-2 space-y-1">
              {priceMoves.slice(0, 3).map(m => (
                <li key={m.id} className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate flex items-center gap-1" style={{ color: 'var(--ink)' }}>
                    {m.delta > 0
                      ? <ArrowUp className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--gold-ink)' }} aria-label="Subió" />
                      : <ArrowDown className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--mint-ink)' }} aria-label="Bajó" />}
                    {m.name}
                  </span>
                  <span className="tabular-nums flex-shrink-0" style={{ color: 'var(--ink-2)' }}>
                    {m.annualImpact > 0 ? '+' : '−'}{formatCLP(Math.abs(m.annualImpact))}/año
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {showWeights && (
          <div>
            <p className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Dónde se va tu carga mensual</p>
            <ul className="mt-2 space-y-2">
              {topW.map(w => (
                <li key={w.key}>
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="truncate" style={{ color: 'var(--ink)' }}>{w.name} <span style={{ color: 'var(--ink-2)' }}>({w.count})</span></span>
                    <span className="tabular-nums flex-shrink-0" style={{ color: 'var(--ink-2)' }}>{formatCLP(w.monthly)} · {w.pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden mt-1" style={{ background: 'var(--surface-2)' }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.max(w.pct, 2)}%`, background: w.color }} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
