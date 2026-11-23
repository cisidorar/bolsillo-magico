'use client'

const usd = (n: number) => '$' + Math.abs(n).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * «Tu posición» en el detalle de una acción: el valor de hoy como protagonista, cuánto llevas ganado o perdido
 * y, debajo, lo que pusiste. Las acciones se muestran con hasta 4 decimales (antes salían «12.72837312 acc.»).
 */
export default function PositionSummary({ shares, avgCost, price }: { shares: number; avgCost: number; price: number }) {
  const value = shares * price
  const invested = shares * avgCost
  const gain = value - invested
  const pct = avgCost > 0 ? ((price - avgCost) / avgCost) * 100 : 0
  const up = gain >= 0
  const tone = up ? 'var(--mint-ink)' : 'var(--coral-ink)'
  const soft = up ? 'color-mix(in srgb, var(--mint) 14%, transparent)' : 'color-mix(in srgb, var(--coral) 14%, transparent)'

  return (
    <div className="rounded-2xl p-4" style={{ background: 'var(--surface-2)' }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Tu posición hoy</p>
          <p className="font-display text-3xl font-extrabold tabular-nums leading-none mt-1.5" style={{ color: 'var(--ink)' }}>{usd(value)}</p>
        </div>
        <div className="text-right flex-shrink-0 rounded-xl px-3 py-2" style={{ background: soft }}>
          <p className="text-sm font-extrabold tabular-nums" style={{ color: tone }}>{up ? '+' : '−'}{usd(gain)}</p>
          <p className="text-xs font-bold tabular-nums mt-0.5" style={{ color: tone }}>{up ? '+' : '−'}{Math.abs(pct).toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</p>
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-3 mt-4">
        {[
          { k: 'Acciones', v: shares.toLocaleString('es-CL', { maximumFractionDigits: 4 }) },
          { k: 'Costo promedio', v: usd(avgCost) },
          { k: 'Invertido', v: usd(invested) },
        ].map(i => (
          <div key={i.k}>
            <dt className="text-xs" style={{ color: 'var(--ink-3)' }}>{i.k}</dt>
            <dd className="text-sm font-semibold tabular-nums mt-0.5" style={{ color: 'var(--ink)' }}>{i.v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
