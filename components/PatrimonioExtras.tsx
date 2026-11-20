import Link from 'next/link'
import { formatCLP } from '@/lib/utils'
import type { GainResult, LiquidityBucket, ActiveLease } from '@/lib/patrimonio-insights'
import type { SharedPosition } from '@/lib/shared-position'

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fmtMonthYear = (d: string) => `${MONTHS[parseInt(d.split('-')[1]) - 1]} ${d.split('-')[0]}`

// Tonos del azul de marca de más oscuro (disponible hoy) a más pálido (más lejos)
const RAMP: Record<LiquidityBucket['key'], string> = {
  now: 'var(--primary)',
  invested: 'color-mix(in srgb, var(--primary) 70%, var(--surface-2))',
  d30: 'color-mix(in srgb, var(--primary) 50%, var(--surface-2))',
  d90: 'color-mix(in srgb, var(--primary) 32%, var(--surface-2))',
  later: 'color-mix(in srgb, var(--primary) 18%, var(--surface-2))',
}

/**
 * Tres tarjetas que cruzan fuentes: si tu plata trabaja (ganancia sobre lo
 * aportado), cuándo puedes disponer de ella y otros activos/saldos que no
 * están en el patrimonio neto (arriendo, plata por cobrar de viajes).
 */
export default function PatrimonioExtras({
  gain, ladder, rentals, shared,
}: {
  gain: GainResult | null
  ladder: LiquidityBucket[]
  rentals: ActiveLease[]
  shared: SharedPosition | null
}) {
  const ladderTotal = ladder.reduce((s, b) => s + b.total, 0)
  const showOther = rentals.length > 0 || (shared && (shared.owed > 0 || shared.owe > 0))
  if (!gain && ladderTotal === 0 && !showOther) return null

  let running = 0

  return (
    <div className="grid gap-3 lg:grid-cols-2 lg:items-start mb-3">
      <div className="space-y-3">
        {gain && (
          <div className="card p-4 lg:p-5">
            <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>¿Tu plata en inversión está trabajando?</p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-2)' }}>
              Acciones y dólares, en pesos, desde {gain.since ? fmtMonthYear(gain.since) : 'tu primer aporte'}
            </p>
            <div className="flex items-baseline gap-3 flex-wrap mt-3">
              <p className="text-2xl lg:text-3xl font-extrabold tabular-nums leading-tight"
                style={{ color: gain.gain >= 0 ? 'var(--mint-ink)' : 'var(--coral-ink)' }}>
                {gain.gain >= 0 ? '+' : '−'}{formatCLP(Math.abs(gain.gain))}
              </p>
              {gain.pct !== null && (
                <span className="text-sm font-bold tabular-nums" style={{ color: gain.gain >= 0 ? 'var(--mint-ink)' : 'var(--coral-ink)' }}>
                  {gain.pct > 0 ? '+' : ''}{gain.pct.toLocaleString('es-CL')}%
                </span>
              )}
            </div>
            <p className="text-xs mt-2 tabular-nums" style={{ color: 'var(--ink-2)' }}>
              Pusiste {formatCLP(gain.contributed)} · hoy vale {formatCLP(gain.value)}
            </p>
            <p className="text-[11px] mt-2 leading-relaxed" style={{ color: 'var(--ink-2)' }}>
              Incluye el efecto del dólar. No descuenta dólares que hayas retirado a pesos.{' '}
              <Link href="/inversiones" className="font-semibold" style={{ color: 'var(--primary)' }}>Ver en dólares</Link>
            </p>
          </div>
        )}

        {showOther && (
          <div className="card p-4 lg:p-5">
            <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Fuera del patrimonio neto</p>
            <p className="text-[11px] mt-0.5 mb-1" style={{ color: 'var(--ink-2)' }}>Ingresos y saldos que no suman arriba</p>
            {rentals.map((r, i) => (
              <Link key={i} href="/propiedad" className="flex items-center justify-between gap-3 py-2 min-h-[44px] rounded-xl transition-colors hover:bg-black/5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>Arriendo · {r.property}</p>
                  <p className="text-[11px]" style={{ color: 'var(--ink-2)' }}>
                    Ingreso mensual bruto{r.end_date ? ` · contrato hasta ${fmtMonthYear(r.end_date)}` : ''}
                  </p>
                </div>
                <p className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--ink)' }}>{formatCLP(r.rent)}/mes</p>
              </Link>
            ))}
            {shared && shared.owed > 0 && (
              <Link href="/compartidos" className="flex items-center justify-between gap-3 py-2 min-h-[44px] rounded-xl transition-colors hover:bg-black/5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Te deben en viajes</p>
                  <p className="text-[11px] truncate" style={{ color: 'var(--ink-2)' }}>
                    {shared.groups.filter(g => g.net > 0).map(g => g.name).join(' · ')}
                  </p>
                </div>
                <p className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--mint-ink)' }}>+{formatCLP(shared.owed)}</p>
              </Link>
            )}
            {shared && shared.owe > 0 && (
              <Link href="/compartidos" className="flex items-center justify-between gap-3 py-2 min-h-[44px] rounded-xl transition-colors hover:bg-black/5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Debes en viajes</p>
                  <p className="text-[11px] truncate" style={{ color: 'var(--ink-2)' }}>
                    {shared.groups.filter(g => g.net < 0).map(g => g.name).join(' · ')}
                  </p>
                </div>
                <p className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--coral-ink)' }}>−{formatCLP(shared.owe)}</p>
              </Link>
            )}
          </div>
        )}
      </div>

      {ladderTotal > 0 && (
        <div className="card p-4 lg:p-5">
          <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Cuándo puedes usar tu plata</p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-2)' }}>Ahorro, depósitos a plazo y acciones, según cuándo se liberan</p>
          <div
            className="flex h-3 rounded-full overflow-hidden mt-3"
            style={{ background: 'var(--surface-2)' }}
            role="img"
            aria-label={ladder.map(b => `${b.label}: ${formatCLP(b.total)}`).join('. ')}
          >
            {ladder.map(b => (
              <div key={b.key} style={{ width: `${(b.total / ladderTotal) * 100}%`, background: RAMP[b.key] }} />
            ))}
          </div>
          <div className="mt-3">
            {ladder.map(b => {
              running += b.total
              return (
                <div key={b.key} className="flex items-center gap-3 py-2">
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: RAMP[b.key] }} aria-hidden />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{b.label}</p>
                    <p className="text-[11px] tabular-nums" style={{ color: 'var(--ink-2)' }}>
                      Acumulado {formatCLP(running)} · {Math.round((running / ladderTotal) * 100)}%
                    </p>
                  </div>
                  <p className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--ink)' }}>{formatCLP(b.total)}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
