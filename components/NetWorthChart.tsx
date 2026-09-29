'use client'

import { useState, useRef } from 'react'
import { formatCLP } from '@/lib/utils'
import { niceStep, xLabelIndices } from '@/lib/chart-axis'

export { MONTH_SHORT, MONTH_LONG, fmtDayShort, fmtDayLong, xLabelIndices } from '@/lib/chart-axis'

// ── Gráfico de área del patrimonio (sep 2026, extraído de PatrimonioCards) ──
// Cliente para poder mostrar el valor exacto al pasar el mouse / tocar un
// punto — antes era un SVG estático y la única forma de saber cuánto había
// en una fecha era adivinar contra el eje Y.
//
// Cambios respecto de la versión anterior:
//  - Eje Y en CLP completo con ticks redondos (CLAUDE.md: nunca "$8.3M" en
//    labels de gráficos) — antes los ticks caían en valores arbitrarios
//    ($1.8M, $3.9M, $6.1M…) porque eran fracciones fijas del rango.
//  - Eje X sin choque: el penúltimo label ya no se monta sobre el último
//    ("28 Sep29 Sep" en la captura de Cas).
//  - Tooltip con la fecha, el valor y el cambio contra el inicio del rango.
//
// Se mantienen dos variantes de viewBox (mobile/desktop) por la misma razón
// de siempre: un viewBox único se deforma al escalarse a anchos muy distintos.

export interface NetWorthChartPoint {
  label:  string   // corto para el eje X ('3 ago')
  total:  number   // CLP
  full?:  string   // largo para el tooltip ('3 de agosto 2026'); si falta, usa label
}

/** Curva suave Catmull-Rom → Bézier cúbica. */
function smoothPath(xs: number[], ys: number[]): string {
  let d = `M ${xs[0]},${ys[0]}`
  for (let i = 0; i < xs.length - 1; i++) {
    const x0 = xs[i - 1] ?? xs[i], y0 = ys[i - 1] ?? ys[i]
    const x1 = xs[i], y1 = ys[i]
    const x2 = xs[i + 1], y2 = ys[i + 1]
    const x3 = xs[i + 2] ?? x2, y3 = ys[i + 2] ?? y2
    const c1x = x1 + (x2 - x0) / 6, c1y = y1 + (y2 - y0) / 6
    const c2x = x2 - (x3 - x1) / 6, c2y = y2 - (y3 - y1) / 6
    d += ` C ${c1x},${c1y} ${c2x},${c2y} ${x2},${y2}`
  }
  return d
}

export default function NetWorthChart({ points, idPrefix = 'nw' }: { points: NetWorthChartPoint[]; idPrefix?: string }) {
  if (points.length < 2) return null
  return (
    <>
      <div className="lg:hidden">
        <ChartSvg points={points} gradId={`${idPrefix}-grad-m`} W={380} H={220} padLeft={62} padRight={10} padTop={14} padBot={24} xTarget={4} />
      </div>
      <div className="hidden lg:block">
        <ChartSvg points={points} gradId={`${idPrefix}-grad-d`} W={1200} H={380} padLeft={96} padRight={14} padTop={16} padBot={30} xTarget={8} />
      </div>
    </>
  )
}

function ChartSvg({ points, gradId, W, H, padLeft, padRight, padTop, padBot, xTarget }: {
  points: NetWorthChartPoint[]
  gradId: string; W: number; H: number; padLeft: number; padRight: number; padTop: number; padBot: number; xTarget: number
}) {
  const [hover, setHover] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const n = points.length
  const totals = points.map(p => p.total)
  const rawMin = Math.min(...totals)
  const rawMax = Math.max(...totals)
  // Margen de 6% para que la línea no toque los bordes.
  const padV  = (rawMax - rawMin) * 0.06 || Math.max(rawMax * 0.05, 1)
  const step  = niceStep(rawMax - rawMin + padV * 2, 4)
  // Un patrimonio positivo nunca necesita un eje bajo cero.
  const min   = Math.max(rawMin >= 0 ? 0 : -Infinity, Math.floor((rawMin - padV) / step) * step)
  const max   = Math.ceil((rawMax + padV) / step) * step
  const range = max - min || 1
  const ticks: number[] = []
  for (let v = min; v <= max + step / 2; v += step) ticks.push(v)

  const chartH = H - padTop - padBot
  const chartW = W - padLeft - padRight
  const xs = points.map((_, i) => padLeft + (i / (n - 1)) * chartW)
  const yOf = (v: number) => padTop + (1 - (v - min) / range) * chartH
  const ys = totals.map(yOf)
  const linePath = smoothPath(xs, ys)
  const areaPath = `${linePath} L ${xs[n - 1]},${H - padBot} L ${xs[0]},${H - padBot} Z`
  const trendUp = totals[n - 1] >= totals[0]
  const lineColor = trendUp ? 'var(--primary)' : 'var(--coral)'
  const labelIdx = new Set(xLabelIndices(n, xTarget))

  function pick(clientX: number) {
    const el = svgRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * W
    const f = (x - padLeft) / chartW
    setHover(Math.max(0, Math.min(n - 1, Math.round(f * (n - 1)))))
  }

  const h = hover
  const hp = h !== null ? points[h] : null
  const hDelta = h !== null ? points[h].total - points[0].total : 0
  // Tooltip en % del ancho — se voltea al lado izquierdo en la mitad derecha
  // para no salirse del contenedor.
  const tipLeftPct = h !== null ? (xs[h] / W) * 100 : 0

  return (
    <div className="relative select-none">
      <svg
        ref={svgRef}
        width="100%" viewBox={`0 0 ${W} ${H}`} className="block touch-pan-y"
        role="img" aria-label="Evolución del patrimonio"
        onPointerMove={e => pick(e.clientX)}
        onPointerDown={e => pick(e.clientX)}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.22" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
        </defs>

        {ticks.map(v => {
          const yPos = yOf(v)
          return (
            <g key={v}>
              <line x1={padLeft} y1={yPos} x2={W - padRight} y2={yPos}
                stroke="var(--border)" strokeWidth="1" strokeDasharray="3 4" opacity="0.6" />
              <text x={padLeft - 8} y={yPos + 3.5} fontSize={W < 500 ? 9 : 10} fontWeight="500"
                fill="var(--ink-3)" textAnchor="end">
                {formatCLP(v)}
              </text>
            </g>
          )
        })}

        <path d={areaPath} fill={`url(#${gradId})`} />
        <path d={linePath} fill="none" stroke={lineColor} strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" />

        {xs.map((x, i) => i === n - 1 ? null : (
          <circle key={i} cx={x} cy={ys[i]} r="2.5" fill={lineColor} opacity={i === 0 ? 0.85 : 0.4} />
        ))}
        <circle cx={xs[n - 1]} cy={ys[n - 1]} r="7" fill={lineColor} opacity="0.2" />
        <circle cx={xs[n - 1]} cy={ys[n - 1]} r="4" fill={lineColor} />

        {h !== null && (
          <g pointerEvents="none">
            <line x1={xs[h]} y1={padTop} x2={xs[h]} y2={H - padBot} stroke="var(--ink-3)" strokeWidth="1" opacity="0.5" />
            <circle cx={xs[h]} cy={ys[h]} r="5" fill="var(--surface)" stroke={lineColor} strokeWidth="2.5" />
          </g>
        )}

        {points.map((p, i) => labelIdx.has(i) && (
          <text key={i} x={xs[i]} y={H - 9} fontSize={W < 500 ? 9 : 10} fontWeight="600" fill="var(--ink-3)"
            textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
            style={{ textTransform: 'capitalize' }}>
            {p.label}
          </text>
        ))}
      </svg>

      {hp && h !== null && (
        <div
          className="absolute top-0 pointer-events-none rounded-xl px-2.5 py-1.5 shadow-lg whitespace-nowrap"
          style={{
            left: `${tipLeftPct}%`,
            transform: tipLeftPct > 55 ? 'translateX(calc(-100% - 10px))' : 'translateX(10px)',
            background: 'var(--surface)', border: '1px solid var(--border)',
          }}
        >
          <p className="text-[10px] font-semibold capitalize" style={{ color: 'var(--ink-3)' }}>{hp.full ?? hp.label}</p>
          <p className="text-sm font-extrabold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(hp.total)}</p>
          {h > 0 && (
            <p className="text-[10px] font-bold tabular-nums" style={{ color: hDelta >= 0 ? 'var(--mint)' : 'var(--coral)' }}>
              {hDelta >= 0 ? '+' : '−'}{formatCLP(Math.abs(hDelta))} desde {points[0].label}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
