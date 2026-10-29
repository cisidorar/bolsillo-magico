import Link from 'next/link'
import { formatCLP, isEmoji } from '@/lib/utils'
import { getCategoryIcon } from '@/lib/category-icons'
import type { Anomaly, Merchant } from '@/lib/analysis-drivers'

function shortDate(date: string): string {
  const [, m, d] = date.split('-')
  return `${parseInt(d)}/${parseInt(m)}`
}

/**
 * Dos lecturas deterministas del mes: compras que se salen de lo habitual de su
 * categoría y comercios donde el gasto se repite. Cada una se oculta sola si no
 * hay nada que decir (nunca se muestra una tarjeta vacía).
 */
export default function SpendingPatterns({
  anomalies,
  merchants,
  prevLabel,
}: {
  anomalies: Anomaly[]
  merchants: Merchant[]
  prevLabel: string
}) {
  if (anomalies.length === 0 && merchants.length === 0) return null

  return (
    <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start space-y-5 lg:space-y-0 mb-5">
      {anomalies.length > 0 && (
        <div className="card p-4 lg:p-5">
          <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Compras fuera de lo normal</p>
          <p className="text-[11px] mt-0.5 mb-2" style={{ color: 'var(--ink-2)' }}>
            Mucho sobre lo que sueles gastar en la misma categoría
          </p>
          {anomalies.map(a => {
            const Icon = isEmoji(a.category.icon) ? null : getCategoryIcon(a.category.icon)
            return (
              <Link
                key={a.id}
                href={`/analisis/${a.category.id}?month=${parseInt(a.date.split('-')[1])}&year=${a.date.split('-')[0]}`}
                className="flex items-center gap-3 py-2 min-h-[44px] rounded-xl transition-colors hover:bg-black/5 active:bg-black/10"
              >
                <div
                  className="cat-icon-bg w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ '--cat-bg': a.category.bg_color, '--cat-color': a.category.color } as React.CSSProperties}
                >
                  {isEmoji(a.category.icon)
                    ? <span className="text-sm leading-none">{a.category.icon}</span>
                    : Icon ? <Icon className="w-4 h-4" style={{ color: a.category.color }} /> : null}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{a.description}</p>
                  <p className="text-[11px] tabular-nums" style={{ color: 'var(--ink-2)' }}>
                    {shortDate(a.date)} · {a.category.name} · lo típico es {formatCLP(a.typical)}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(a.amount)}</p>
                  <p className="text-[11px] font-semibold tabular-nums" style={{ color: 'var(--gold-ink)' }}>{a.multiple.toLocaleString('es-CL')}× lo típico</p>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {merchants.length > 0 && (
        <div className="card p-4 lg:p-5">
          <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Dónde se repite tu gasto</p>
          <p className="text-[11px] mt-0.5 mb-2" style={{ color: 'var(--ink-2)' }}>
            Compras variables con la misma descripción, 2 veces o más en el mes
          </p>
          {merchants.map(m => (
            <div key={m.key} className="flex items-center gap-3 py-2 min-h-[44px]">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{m.label}</p>
                <p className="text-[11px] tabular-nums" style={{ color: 'var(--ink-2)' }}>
                  {m.count} veces · {formatCLP(m.avg)} promedio
                  {m.prevCount > 0 ? ` · ${m.prevCount} en ${prevLabel}` : ''}
                </p>
              </div>
              <p className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--ink)' }}>{formatCLP(m.total)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
