import Link from 'next/link'
import { ArrowUp, ArrowDown } from 'lucide-react'
import { formatCLP, isEmoji } from '@/lib/utils'
import { getCategoryIcon } from '@/lib/category-icons'
import type { CategoryDriver, DriversResult } from '@/lib/analysis-drivers'

interface Props {
  drivers: DriversResult
  prevLabel: string        // "Septiembre"
  prevTotal: number
  partial: boolean         // mes en curso: comparado hasta el mismo día
  month: number
  year: number
}

function Row({ d, maxAbs, month, year }: { d: CategoryDriver; maxAbs: number; month: number; year: number }) {
  const up = d.delta > 0
  const Icon = isEmoji(d.icon) ? null : getCategoryIcon(d.icon)
  const Arrow = up ? ArrowUp : ArrowDown
  return (
    <Link
      href={`/analisis/${d.id}?month=${month}&year=${year}`}
      className="flex items-center gap-3 py-2 min-h-[44px] rounded-xl transition-colors hover:bg-black/5 active:bg-black/10"
    >
      <div
        className="cat-icon-bg w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ '--cat-bg': d.bg_color, '--cat-color': d.color } as React.CSSProperties}
      >
        {isEmoji(d.icon)
          ? <span className="text-sm leading-none">{d.icon}</span>
          : Icon ? <Icon className="w-4 h-4" style={{ color: d.color }} /> : null}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{d.name}</p>
          <p
            className="text-sm font-bold tabular-nums whitespace-nowrap flex items-center gap-0.5"
            style={{ color: up ? 'var(--ink)' : 'var(--mint-ink)' }}
          >
            <Arrow className="w-3 h-3" aria-hidden />
            <span className="sr-only">{up ? 'Subió' : 'Bajó'}</span>
            {formatCLP(Math.abs(d.delta))}
          </p>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden mt-1.5" style={{ background: 'var(--surface-2)' }}>
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.max(4, Math.round((Math.abs(d.delta) / maxAbs) * 100))}%`, background: d.color }}
          />
        </div>
        <p className="text-[11px] mt-1 tabular-nums" style={{ color: 'var(--ink-2)' }}>
          {formatCLP(d.prevTotal)} → {formatCLP(d.total)}
          {d.deltaPct !== null ? ` · ${d.deltaPct > 0 ? '+' : ''}${d.deltaPct}%` : ' · nueva este mes'}
        </p>
      </div>
    </Link>
  )
}

export default function CategoryDrivers({ drivers, prevLabel, prevTotal, partial, month, year }: Props) {
  const { netDelta, up, down } = drivers
  if (prevTotal <= 0 || (up.length === 0 && down.length === 0)) return null

  const top = up[0]
  const explains =
    netDelta > 0 && top && top.shareOfChange !== null && top.shareOfChange >= 30 && top.shareOfChange <= 100
      ? top.shareOfChange
      : null
  const maxAbs = Math.max(...[...up, ...down].map(d => Math.abs(d.delta)), 1)
  const netPct = Math.round((netDelta / prevTotal) * 100)

  const headline =
    netDelta === 0 ? `Gastas lo mismo que en ${prevLabel}`
    : explains !== null ? `${top.name} explica el ${explains}% del ${netDelta > 0 ? 'aumento' : 'cambio'}`
    : netDelta > 0 ? `Gastas ${formatCLP(netDelta)} más que en ${prevLabel}`
    : `Gastas ${formatCLP(Math.abs(netDelta))} menos que en ${prevLabel}`

  return (
    <div className="card p-4 lg:p-6 mb-5">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="min-w-0">
          <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Qué cambió vs. {prevLabel}</p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-2)' }}>
            {partial ? 'Comparado hasta el mismo día de cada mes' : 'Mes completo contra mes completo'}
          </p>
        </div>
        <p className="text-sm font-extrabold tabular-nums whitespace-nowrap text-right" style={{ color: 'var(--ink)' }}>
          {netDelta > 0 ? '+' : netDelta < 0 ? '−' : ''}{formatCLP(Math.abs(netDelta))}
          <span className="block text-[11px] font-semibold" style={{ color: 'var(--ink-2)' }}>
            {netPct > 0 ? '+' : ''}{netPct}%
          </span>
        </p>
      </div>
      <p className="text-sm mt-3 mb-2" style={{ color: 'var(--ink)' }}>{headline}</p>

      <div className="lg:grid lg:grid-cols-2 lg:gap-x-8">
        {up.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold mt-2 mb-1" style={{ color: 'var(--ink-2)' }}>Subieron</p>
            {up.map(d => <Row key={d.id} d={d} maxAbs={maxAbs} month={month} year={year} />)}
          </div>
        )}
        {down.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold mt-2 mb-1" style={{ color: 'var(--ink-2)' }}>Bajaron</p>
            {down.map(d => <Row key={d.id} d={d} maxAbs={maxAbs} month={month} year={year} />)}
          </div>
        )}
      </div>
    </div>
  )
}
