import { Gauge } from 'lucide-react'
import type { ScenarioImpact } from '@/lib/rate-scenarios'

// ── M3 (roadmap macro/tasas, jul 2026): "los posibles movimientos" ───────────
// Card colapsada por defecto — mismo patrón <details> nativo de
// WeekSnapshotCard, cero JS. Muestra el impacto estimado de tres escenarios
// de tasa (+25pb / mantiene / -25pb) sobre la cartera real, usando la
// sensibilidad empírica por ticker (lib/rate-sensitivity.ts). Es una
// aproximación de primer orden, no una predicción — el disclaimer va
// explícito en la UI, no solo en el código.
//
// Severidad: tope gold, NUNCA coral (UX5) — un escenario hipotético no es una
// acción para hoy, no compite con las alertas reales de la cartera.

function fmtUSDSigned(n: number): string {
  const s = Math.abs(n).toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  return (n >= 0 ? '+' : '−') + 'US$' + s
}
function fmtUSD(n: number): string {
  return 'US$' + Math.abs(n).toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
function fmtPctSigned(n: number): string {
  return (n >= 0 ? '+' : '') + n.toFixed(1) + '%'
}

const SCENARIO_UI: Record<ScenarioImpact['label'], { title: string; sub: string }> = {
  sube:     { title: 'Si la Fed sube 25pb',     sub: 'próxima reunión' },
  mantiene: { title: 'Si la Fed mantiene',       sub: 'sin cambio' },
  baja:     { title: 'Si la Fed baja 25pb',      sub: 'escenario menos probable' },
}

interface Props {
  scenarios:          ScenarioImpact[]     // 3: sube, mantiene, baja
  excludedTickers:    string[]
  consideredValueUsd: number
}

export default function RateScenariosCard({ scenarios, excludedTickers, consideredValueUsd }: Props) {
  if (consideredValueUsd <= 0) return null   // sin cartera con beta confiable: no hay nada que mostrar

  return (
    <details className="card overflow-hidden group">
      <summary className="flex items-center gap-2.5 px-4 lg:px-5 py-3.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <Gauge className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--primary)' }} />
        <p className="text-sm font-bold flex-1 min-w-0" style={{ color: 'var(--ink)' }}>Si la Fed se mueve</p>
        <span className="text-xs font-semibold flex-shrink-0" style={{ color: 'var(--ink-3)' }}>ver escenarios</span>
        <span className="text-[10px] font-bold flex-shrink-0 transition-transform group-open:rotate-180" style={{ color: 'var(--ink-3)' }}>▾</span>
      </summary>

      <div className="px-4 lg:px-5 pb-4 pt-1 space-y-2.5 border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="grid grid-cols-3 gap-2 pt-2">
          {scenarios.map(s => {
            const ui = SCENARIO_UI[s.label]
            // UX5: tope gold — un escenario hipotético no es acción-para-hoy.
            const color = s.label === 'mantiene' ? 'var(--ink-2)' : (s.totalImpactUsd < 0 ? 'var(--gold)' : 'var(--mint)')
            return (
              <div key={s.label} className="rounded-xl px-2.5 py-2.5" style={{ background: 'var(--surface-2)' }}>
                <p className="text-[10px] font-bold leading-tight" style={{ color: 'var(--ink-3)' }}>{ui.title}</p>
                <p className="text-sm font-extrabold tabular-nums mt-1" style={{ color }}>{fmtUSDSigned(s.totalImpactUsd)}</p>
                {s.totalImpactPct !== null && (
                  <p className="text-[10px] font-semibold tabular-nums" style={{ color }}>{fmtPctSigned(s.totalImpactPct)}</p>
                )}
              </div>
            )
          })}
        </div>

        <p className="text-[10px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>
          Estimado sobre {fmtUSD(consideredValueUsd)} de tu cartera, según cómo se movió cada acción HISTÓRICAMENTE
          con las tasas — una aproximación de primer orden, no una predicción de precio. No cambia tu plan de largo plazo.
        </p>

        {excludedTickers.length > 0 && (
          <p className="text-[10px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>
            Sin suficiente evidencia para {excludedTickers.length === 1 ? excludedTickers[0] : excludedTickers.join(', ')} — no se incluye{excludedTickers.length === 1 ? '' : 'n'} en el cálculo.
          </p>
        )}
      </div>
    </details>
  )
}
