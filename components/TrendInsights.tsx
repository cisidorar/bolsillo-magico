import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import type { FixedShare, Rising, BudgetMismatch } from '@/lib/trend-insights'

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const label = (key: string) => MONTHS[parseInt(key.split('-')[1]) - 1]

/**
 * Tendencia sobre meses completos: qué está creciendo en silencio (fijos,
 * categorías al alza) y qué presupuestos no sirven como señal. Cada bloque se
 * oculta solo si no hay nada que decir.
 */
export default function TrendInsights({
  fixed,
  rising,
  mismatches,
  savingsAvg,
}: {
  fixed: FixedShare[]
  rising: Rising[]
  mismatches: BudgetMismatch[]
  savingsAvg: { avg6: number | null; avg12: number | null; months12: number }
}) {
  const fixedMonths = fixed.filter(f => f.total > 0)
  const showFixed = fixedMonths.length >= 3 && fixedMonths.some(f => f.fixed > 0)
  const hasSavings = savingsAvg.avg6 !== null || savingsAvg.avg12 !== null
  if (!showFixed && rising.length === 0 && mismatches.length === 0 && !hasSavings) return null

  const first = fixedMonths[0]
  const last = fixedMonths[fixedMonths.length - 1]
  const fixedMax = Math.max(...fixedMonths.map(f => f.fixed), 1)
  const fixedGrowth = showFixed && first.fixed > 0 ? Math.round(((last.fixed - first.fixed) / first.fixed) * 100) : null

  return (
    <div className="card p-4 lg:p-6 space-y-6">
      <div>
        <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Qué está cambiando en silencio</p>
        <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-2)' }}>Solo meses completos; el mes en curso no cuenta</p>
      </div>

      {hasSavings && (
        <div>
          <p className="text-xs font-semibold mb-1" style={{ color: 'var(--ink-2)' }}>Ahorro del sueldo</p>
          <p className="text-sm" style={{ color: 'var(--ink)' }}>
            {savingsAvg.avg6 !== null && <>Últimos 6 meses: <span className="font-extrabold tabular-nums">{savingsAvg.avg6}%</span></>}
            {savingsAvg.avg6 !== null && savingsAvg.avg12 !== null && ' · '}
            {savingsAvg.avg12 !== null && <>{savingsAvg.months12} meses: <span className="font-extrabold tabular-nums">{savingsAvg.avg12}%</span></>}
          </p>
        </div>
      )}

      {showFixed && (
        <div>
          <div className="flex items-baseline justify-between gap-2 mb-2">
            <p className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Gasto fijo por mes</p>
            {fixedGrowth !== null && Math.abs(fixedGrowth) >= 5 && (
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full tabular-nums"
                style={fixedGrowth > 0
                  ? { background: 'rgba(255,194,60,0.15)', color: 'var(--gold-ink)' }
                  : { background: 'rgba(31,190,141,0.12)', color: 'var(--mint-ink)' }}
              >
                {fixedGrowth > 0 ? '+' : ''}{fixedGrowth}% desde {label(first.key)}
              </span>
            )}
          </div>
          <div className="space-y-1.5">
            {fixedMonths.map(f => (
              <div key={f.key} className="flex items-center gap-2">
                <span className="text-[11px] w-8 capitalize" style={{ color: 'var(--ink-2)' }}>{label(f.key)}</span>
                <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.max(2, Math.round((f.fixed / fixedMax) * 100))}%`, background: 'var(--primary)' }} />
                </div>
                <span className="text-[11px] tabular-nums text-right w-28" style={{ color: 'var(--ink)' }}>
                  {formatCLP(f.fixed)} <span style={{ color: 'var(--ink-2)' }}>· {f.pct}%</span>
                </span>
              </div>
            ))}
          </div>
          <p className="text-[11px] mt-1.5" style={{ color: 'var(--ink-2)' }}>% del gasto total del mes que ya estaba comprometido</p>
        </div>
      )}

      {rising.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-1" style={{ color: 'var(--ink-2)' }}>Subiendo 3 meses seguidos</p>
          {rising.map(r => (
            <Link
              key={r.category.id}
              href={`/analisis/${r.category.id}`}
              className="flex items-center justify-between gap-3 py-2 min-h-[44px] rounded-xl transition-colors hover:bg-black/5"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{r.category.name}</p>
                <p className="text-[11px] tabular-nums" style={{ color: 'var(--ink-2)' }}>
                  {r.totals.map(formatCLP).join(' → ')}
                </p>
              </div>
              <span className="text-[11px] font-bold tabular-nums flex items-center gap-0.5 flex-shrink-0" style={{ color: 'var(--gold-ink)' }}>
                <ArrowUpRight className="w-3 h-3" aria-hidden />+{r.growthPct}%
              </span>
            </Link>
          ))}
        </div>
      )}

      {mismatches.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-1" style={{ color: 'var(--ink-2)' }}>Presupuestos que no calzan con tu gasto real</p>
          {mismatches.map(m => (
            <Link
              key={m.category.id}
              href="/presupuesto"
              className="flex items-center justify-between gap-3 py-2 min-h-[44px] rounded-xl transition-colors hover:bg-black/5"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{m.category.name}</p>
                <p className="text-[11px] tabular-nums" style={{ color: 'var(--ink-2)' }}>
                  Límite {formatCLP(m.limit)} · gastas ~{formatCLP(m.typical)} al mes
                </p>
              </div>
              <span className="text-[11px] font-semibold flex-shrink-0" style={{ color: 'var(--primary)' }}>
                {m.kind === 'low' ? 'Subir límite' : 'Bajar límite'}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
