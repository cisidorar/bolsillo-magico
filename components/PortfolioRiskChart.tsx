'use client'

import { useState } from 'react'
import { RISK_TIER_LABEL, RISK_TIER_COLOR, RISK_TIER_ORDER, type RiskTier } from '@/lib/risk-tiers'

// ── Gráfico de riesgo de la cartera (sep 2026, a pedido de Cas) ─────────────
// "quiero un gráfico de torta con acciones de riesgo, no riesgo o ETF" — pero
// iterando el pedido con ella, la categoría correcta resultó ser el riesgo
// real del activo, no si el vehículo es un ETF o una acción individual (su
// propio ejemplo: AVUV es un ETF pero "menos riesgo"; SOXL también es un ETF
// pero apalancado 3×). Ver lib/risk-tiers.ts para la clasificación.
//
// Torta hecha a mano en SVG (CLAUDE.md: nunca librerías de gráficos). El
// detalle ticker por ticker vive en un panel de ALTURA FIJA debajo de la
// leyenda, no expandiendo cada fila: la primera versión insertaba la lista
// bajo la fila de la categoría, y como cada categoría tiene una cantidad
// distinta de tickers, la tarjeta entera crecía y encogía al pasar el mouse
// de una porción a otra ("se sube y se baja", reportado por Cas). Un panel
// fijo con scroll interno si hace falta deja la tarjeta siempre del mismo
// alto, sin importar cuál categoría esté activa.

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

export interface RiskTierBucket {
  tier:     RiskTier
  valueUsd: number
  holdings: { ticker: string; valueUsd: number }[]
}

export default function PortfolioRiskChart({ data }: { data: RiskTierBucket[] }) {
  const [hover, setHover] = useState<RiskTier | null>(null)
  const total = data.reduce((s, d) => s + d.valueUsd, 0)

  if (total <= 0) return null

  const cx = 60, cy = 60, r = 56
  let angle = 0
  const slices = RISK_TIER_ORDER
    .map(tier => {
      const bucket = data.find(d => d.tier === tier)
      const value = bucket?.valueUsd ?? 0
      const pct = (value / total) * 100
      const startAngle = angle
      angle += pct * 3.6
      return { tier, value, pct, startAngle, endAngle: angle }
    })
    .filter(s => s.value > 0)

  const hoverBucket = hover ? data.find(d => d.tier === hover) ?? null : null
  // Alto fijo (nunca cambia con el hover, ver comentario de arriba), pero
  // calculado para que la categoría con más tickers entre igual sin scroll —
  // antes un valor fijo de 96px dejaba la mitad de "Riesgo" (6 tickers) tapada.
  // overflow-y sigue de respaldo por si algún día una categoría crece más.
  const maxHoldings = Math.max(1, ...data.map(d => d.holdings.length))
  const DETAIL_HEIGHT = Math.max(72, Math.min(220, 28 + maxHoldings * 22))

  return (
    <div className="card p-4 lg:p-5">
      <div className="mb-4">
        <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Riesgo de la cartera</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>Pasa el mouse por una porción para ver el detalle</p>
      </div>

      <div className="flex items-center gap-6 flex-wrap sm:flex-nowrap">
        <svg viewBox="0 0 120 120" className="flex-shrink-0" style={{ width: 120, height: 120 }}>
          {slices.length === 1 ? (
            <circle
              cx={cx} cy={cy} r={r} fill={RISK_TIER_COLOR[slices[0].tier]}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHover(slices[0].tier)}
              onMouseLeave={() => setHover(null)}
            />
          ) : (
            slices.map(s => (
              <path
                key={s.tier}
                d={wedgePath(cx, cy, r, s.startAngle, s.endAngle)}
                fill={RISK_TIER_COLOR[s.tier]}
                opacity={hover && hover !== s.tier ? 0.4 : 1}
                style={{ cursor: 'pointer', transition: 'opacity 120ms' }}
                onMouseEnter={() => setHover(s.tier)}
                onMouseLeave={() => setHover(null)}
              />
            ))
          )}
        </svg>

        <div className="flex-1 min-w-[200px] space-y-1">
          {RISK_TIER_ORDER.map(tier => {
            const bucket = data.find(d => d.tier === tier)
            const value = bucket?.valueUsd ?? 0
            const pct = total > 0 ? (value / total) * 100 : 0
            const isHover = hover === tier

            return (
              <div
                key={tier}
                className="flex items-center gap-2.5 -mx-1.5 px-1.5 py-1 rounded-lg transition-colors"
                style={{ background: isHover ? 'var(--surface-2)' : 'transparent', cursor: value > 0 ? 'pointer' : 'default' }}
                onMouseEnter={() => value > 0 && setHover(tier)}
                onMouseLeave={() => setHover(null)}
              >
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

      {/* Panel de detalle: alto fijo siempre, scrollea si hace falta — nunca
          cambia el alto de la tarjeta al pasar de una categoría a otra. */}
      <div
        className="mt-4 pt-3 border-t scrollbar-none"
        style={{ borderColor: 'var(--border)', height: DETAIL_HEIGHT, overflowY: 'auto' }}
      >
        {hoverBucket ? (
          <div className="space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: RISK_TIER_COLOR[hoverBucket.tier] }}>
              {RISK_TIER_LABEL[hoverBucket.tier]}
            </p>
            {hoverBucket.holdings.map(h => (
              <div key={h.ticker} className="flex items-center gap-2 text-xs">
                <span className="font-bold flex-shrink-0" style={{ color: 'var(--ink-2)', fontFamily: 'ui-monospace, monospace', minWidth: 48 }}>
                  {h.ticker}
                </span>
                <span className="flex-1 border-b border-dotted" style={{ borderColor: 'var(--border)' }} />
                <span className="tabular-nums flex-shrink-0" style={{ color: 'var(--ink-3)' }}>
                  {fmtUSD(h.valueUsd)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs h-full flex items-center justify-center text-center" style={{ color: 'var(--ink-3)' }}>
            Pasa el mouse sobre una porción o una categoría para ver qué tickers la componen
          </p>
        )}
      </div>
    </div>
  )
}
