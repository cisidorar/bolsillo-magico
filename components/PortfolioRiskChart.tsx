'use client'

import { RISK_TIER_LABEL, RISK_TIER_COLOR, RISK_TIER_ORDER, type RiskTier } from '@/lib/risk-tiers'
import { useToast } from '@/components/ToastProvider'

// ── Gráfico de riesgo de la cartera (sep 2026, a pedido de Cas) ─────────────
// "quiero un gráfico de torta con acciones de riesgo, no riesgo o ETF" — pero
// iterando el pedido con ella, la categoría correcta resultó ser el riesgo
// real del activo, no si el vehículo es un ETF o una acción individual (su
// propio ejemplo: AVUV es un ETF pero "menos riesgo"; SOXL también es un ETF
// pero apalancado 3×). Ver lib/risk-tiers.ts para la clasificación.
//
// Torta hecha a mano en SVG (CLAUDE.md: nunca librerías de gráficos) — arcos
// calculados a partir del % acumulado de cada categoría.

function fmtUSD(n: number): string {
  return '$' + n.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function polarPoint(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

/** Wedge de torta (no anillo): del centro al borde y de vuelta, para un pie chart clásico. */
function wedgePath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarPoint(cx, cy, r, startAngle)
  const end   = polarPoint(cx, cy, r, endAngle)
  const largeArc = endAngle - startAngle > 180 ? 1 : 0
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y} Z`
}

export default function PortfolioRiskChart({ data }: { data: { tier: RiskTier; valueUsd: number }[] }) {
  const { showToast } = useToast()
  const total = data.reduce((s, d) => s + d.valueUsd, 0)

  if (total <= 0) return null

  const cx = 60, cy = 60, r = 56
  let angle = 0
  const slices = RISK_TIER_ORDER
    .map(tier => {
      const value = data.find(d => d.tier === tier)?.valueUsd ?? 0
      const pct = (value / total) * 100
      const startAngle = angle
      angle += pct * 3.6
      return { tier, value, pct, startAngle, endAngle: angle }
    })
    .filter(s => s.value > 0)

  const explain = () => showToast(
    'Clasificación propia de la app por riesgo real del activo (no del vehículo): ' +
    'ETFs diversificados y acciones defensivas cuentan como bajo riesgo, acciones de crecimiento como riesgo, ' +
    'y apalancados o cripto como riesgo alto. Puedes corregir la de cualquier posición editándola. No es una recomendación de inversión.'
  )

  return (
    <div className="card p-4 lg:p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Riesgo de la cartera</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>Cuánto tienes en cada nivel de riesgo</p>
        </div>
        <button
          onClick={explain}
          className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-lg flex-shrink-0"
          style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}
        >
          ¿Cómo se arma?
        </button>
      </div>

      <div className="flex items-center gap-6 flex-wrap sm:flex-nowrap">
        <svg viewBox="0 0 120 120" className="flex-shrink-0" style={{ width: 120, height: 120 }}>
          {slices.length === 1 ? (
            <circle cx={cx} cy={cy} r={r} fill={RISK_TIER_COLOR[slices[0].tier]} />
          ) : (
            slices.map(s => (
              <path key={s.tier} d={wedgePath(cx, cy, r, s.startAngle, s.endAngle)} fill={RISK_TIER_COLOR[s.tier]} />
            ))
          )}
        </svg>

        <div className="flex-1 min-w-[160px] space-y-2.5">
          {RISK_TIER_ORDER.map(tier => {
            const value = data.find(d => d.tier === tier)?.valueUsd ?? 0
            const pct = total > 0 ? (value / total) * 100 : 0
            return (
              <div key={tier} className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: RISK_TIER_COLOR[tier] }} />
                <span className="text-xs font-semibold flex-1" style={{ color: 'var(--ink-2)' }}>
                  {RISK_TIER_LABEL[tier]}
                </span>
                <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--ink-3)' }}>
                  {pct.toFixed(0)}%
                </span>
                <span className="text-xs font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--ink)', minWidth: 64, textAlign: 'right' }}>
                  {fmtUSD(value)}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
