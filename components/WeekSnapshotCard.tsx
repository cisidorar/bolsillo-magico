import { Newspaper, TrendingUp, TrendingDown, Calendar } from 'lucide-react'
import type { SpyBenchmarkResult } from '@/lib/benchmark'
import type { FedMeetingProbability } from '@/lib/fed-probability'

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
function whenLabel(dateStr: string, today: string): string {
  const days = Math.round(
    (new Date(dateStr + 'T12:00:00').getTime() - new Date(today + 'T12:00:00').getTime()) / 86_400_000,
  )
  return days <= 0 ? 'hoy' : days === 1 ? 'mañana' : `en ${days} días`
}

/** Casilla de probabilidad — mismo patrón visual que RateScenariosCard
 *  (grid de 3 con fondo --surface-2), para que "Sube/Mantiene/Baja" se lea
 *  de un vistazo en vez de perderse en una frase. */
function ProbBox({ label, pct }: { label: string; pct: number }) {
  return (
    <div className="rounded-xl px-2.5 py-2.5 text-center" style={{ background: 'var(--surface-2)' }}>
      <p className="text-[10px] font-bold" style={{ color: 'var(--ink-3)' }}>{label}</p>
      <p className="text-base font-extrabold tabular-nums mt-0.5" style={{ color: 'var(--ink)' }}>{pct}%</p>
    </div>
  )
}

export interface UpcomingEvent {
  label: string   // "Decisión de tasas de la Fed" / "TSM reporta resultados"
  date:  string    // YYYY-MM-DD
}

interface Props {
  spyBenchmark:       SpyBenchmarkResult | null
  fedSentence:        string | null
  // sep 2026 (Cas: "cuando hay proxima tasa fed y cuanta es la probabilidad
  // que suba o baje"): datos crudos, no una frase — esto se pinta como
  // tarjeta destacada de 3 casillas, no como una línea más del párrafo de
  // contexto (ahí quedaba invisible entre fedSentence/inflationSentence).
  fedMeetingDate:     string | null
  fedMeetingProb:     FedMeetingProbability | null
  today:              string
  inflationSentence:  string | null
  yieldCurveInverted: boolean
  upcoming:           UpcomingEvent[]   // ya ordenados por fecha, más cercano primero
}

export default function WeekSnapshotCard({ spyBenchmark, fedSentence, fedMeetingDate, fedMeetingProb, today, inflationSentence, yieldCurveInverted, upcoming }: Props) {
  const hasFedMeeting = !!(fedMeetingDate && fedMeetingProb)
  const hasMacro = !!(fedSentence || hasFedMeeting || inflationSentence)
  if (!spyBenchmark && !hasMacro && upcoming.length === 0) return null

  const vsMarketUp = spyBenchmark !== null && spyBenchmark.diffUsd >= 0
  // ago 2026 (Cas: "¿cómo le voy a ganar eso si yo he ingresado como 4000
  // USD?"): este header nunca había mirado degenerate/distorted — mostraba
  // el $ diff siempre, aunque la sombra de SPY hubiera quedado vaciada o casi
  // vaciada por una venta que le ganó por mucho al mercado. Mismo criterio
  // que PerformanceSection: en ese caso ni el % ni el $ son un veredicto
  // confiable.
  const unreliable = spyBenchmark !== null && (spyBenchmark.degenerate || spyBenchmark.distorted)

  return (
    <details className="card overflow-hidden group">
      <summary className="flex items-center gap-2.5 px-4 lg:px-5 py-3.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <Newspaper className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--primary)' }} />
        <p className="text-sm font-bold flex-1 min-w-0" style={{ color: 'var(--ink)' }}>Tu semana</p>
        {spyBenchmark && !unreliable ? (
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
          unreliable ? (
            <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-2)' }}>
              Comparación no confiable por ahora: una venta le ganó por mucho a SPY y descuadró la base de comparación. Se recupera sola con tus próximos movimientos.
            </p>
          ) : (
            <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-2)' }}>
              vs. haber puesto la misma plata, en las mismas fechas, en SPY — al cierre del {fmtDateShort(spyBenchmark.asOfDate)}
              {spyBenchmark.diffPct !== null && <> ({spyBenchmark.diffPct >= 0 ? '+' : ''}{spyBenchmark.diffPct.toFixed(1)}%)</>}
            </p>
          )
        )}

        {hasFedMeeting && (
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-xs font-bold" style={{ color: 'var(--ink)' }}>Próxima reunión de la Fed</p>
              <p className="text-[11px] font-semibold flex-shrink-0" style={{ color: 'var(--ink-3)' }}>
                {fmtDateShort(fedMeetingDate!)} · {whenLabel(fedMeetingDate!, today)}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <ProbBox label="Sube" pct={fedMeetingProb!.pHikePct} />
              <ProbBox label="Mantiene" pct={fedMeetingProb!.pHoldPct} />
              <ProbBox label="Baja" pct={fedMeetingProb!.pCutPct} />
            </div>
            <p className="text-[10px] leading-relaxed mt-1.5" style={{ color: 'var(--ink-3)' }}>
              Precio de mercado (Kalshi) — no es una predicción.
            </p>
          </div>
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
