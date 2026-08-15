import { Newspaper, TrendingUp, TrendingDown, Calendar } from 'lucide-react'
import type { SpyBenchmarkResult } from '@/lib/benchmark'

// ── P3 (roadmap largo plazo, jul 2026): reemplaza la pestaña Semanal completa.
// Esa vista duplicaba el Radar ticker por ticker (mismo rating, mismas
// señales, un día después) y agregaba jerga que Cas no pidió (Fibonacci, POC).
// Lo único que aportaba y que Acciones no tenía — tu semana vs. el mercado, la
// Fed en cotidiano, el calendario de lo que viene — cabe en una card chica,
// colapsada por defecto (<details> nativo, sin JS): el resumen siempre visible
// es la única línea que de verdad se mira seguido; el resto es profundización
// opcional. El informe completo por ticker sigue vivo en el correo semanal
// (cron weekly-report + lib/weekly-report.ts), que es el formato natural de
// algo semanal — se lee una vez, no hay que acordarse de abrir una pestaña.

function fmtUSDSigned(n: number): string {
  return (n >= 0 ? '+US$' : '-US$') + Math.abs(n).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDateShort(d: string): string {
  const [, m, day] = d.split('-').map(Number)
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${day} ${MES[m - 1]}`
}

export interface UpcomingEvent {
  label: string   // "Decisión de tasas de la Fed" / "TSM reporta resultados"
  date:  string    // YYYY-MM-DD
}

interface Props {
  spyBenchmark:       SpyBenchmarkResult | null
  fedSentence:        string | null
  inflationSentence:  string | null
  yieldCurveInverted: boolean
  upcoming:           UpcomingEvent[]   // ya ordenados por fecha, más cercano primero
}

export default function WeekSnapshotCard({ spyBenchmark, fedSentence, inflationSentence, yieldCurveInverted, upcoming }: Props) {
  const hasMacro = !!(fedSentence || inflationSentence)
  if (!spyBenchmark && !hasMacro && upcoming.length === 0) return null

  const vsMarketUp = spyBenchmark !== null && spyBenchmark.diffUsd >= 0

  return (
    <details className="card overflow-hidden group">
      <summary className="flex items-center gap-2.5 px-4 lg:px-5 py-3.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <Newspaper className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--primary)' }} />
        <p className="text-sm font-bold flex-1 min-w-0" style={{ color: 'var(--ink)' }}>Tu semana</p>
        {spyBenchmark ? (
          <span className="text-xs font-extrabold tabular-nums flex items-center gap-1 flex-shrink-0" style={{ color: vsMarketUp ? 'var(--mint)' : 'var(--coral)' }}>
            {vsMarketUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            {fmtUSDSigned(spyBenchmark.diffUsd)} vs. el mercado
          </span>
        ) : (
          <span className="text-xs font-semibold flex-shrink-0" style={{ color: 'var(--ink-3)' }}>ver detalle</span>
        )}
        <span className="text-[10px] font-bold flex-shrink-0 transition-transform group-open:rotate-180" style={{ color: 'var(--ink-3)' }}>▾</span>
      </summary>

      <div className="px-4 lg:px-5 pb-4 pt-1 space-y-3 border-t" style={{ borderColor: 'var(--border)' }}>
        {spyBenchmark && (
          <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-2)' }}>
            vs. haber puesto la misma plata, en las mismas fechas, en SPY — al cierre del {fmtDateShort(spyBenchmark.asOfDate)}
            {spyBenchmark.diffPct !== null && !spyBenchmark.distorted && <> ({spyBenchmark.diffPct >= 0 ? '+' : ''}{spyBenchmark.diffPct.toFixed(1)}%)</>}
          </p>
        )}

        {hasMacro && (
          <div className="space-y-1.5">
            {fedSentence && <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-2)' }}>{fedSentence}</p>}
            {inflationSentence && <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-2)' }}>{inflationSentence}</p>}
            {yieldCurveInverted && (
              <p className="text-xs leading-relaxed font-semibold" style={{ color: 'var(--gold)' }}>
                La curva de tasas está invertida (el bono a 10 años rinde menos que el de 2) — el mercado anticipa una desaceleración. No cambia tu plan de largo plazo, pero es una señal a tener presente.
              </p>
            )}
          </div>
        )}

        {upcoming.length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--ink-3)' }}>Lo que viene</p>
            <div className="space-y-1">
              {upcoming.map((e, i) => (
                <p key={i} className="text-xs flex items-center gap-1.5" style={{ color: 'var(--ink-2)' }}>
                  <Calendar className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--ink-3)' }} />
                  {e.label} <span className="font-semibold">· {fmtDateShort(e.date)}</span>
                </p>
              ))}
            </div>
          </div>
        )}

        <p className="text-[10px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>
          Contexto informativo, no es asesoría de inversión.
        </p>
      </div>
    </details>
  )
}
