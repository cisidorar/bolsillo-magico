'use client'

import { useState } from 'react'

// ── Curva diaria del valor de la cartera (pedido de Cas, ago 2026) ──────────
// A diferencia del gráfico reconstruido de lib/portfolio-history.ts (que
// estima el pasado con las posiciones de HOY), esto grafica valores REALES
// guardados día a día por el cron desde que existe portfolio_snapshots — por
// eso puede arrancar corto (unos pocos puntos) y va creciendo solo con el
// tiempo. Mismo cuidado de viewBox que el resto de la app (CLAUDE.md): ancho
// grande para que la tipografía no se agigante al estirarse en desktop.

export interface PortfolioSnapshotPoint {
  date:  string  // YYYY-MM-DD
  value: number  // USD, acciones + billetera
}

type Period = 'week' | 'month' | 'mtd' | 'ytd'

const PERIODS: { key: Period; label: string }[] = [
  { key: 'week',  label: 'Semana' },
  { key: 'month', label: 'Mes' },
  { key: 'mtd',   label: 'Mes hasta ahora' },
  { key: 'ytd',   label: 'Año hasta ahora' },
]

const MONTH_SHORT = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']

function fmtDayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`
}

function fmtUSD(n: number): string {
  return '$' + n.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtUSDAxis(n: number): string {
  if (Math.abs(n) >= 1000) return '$' + (n / 1000).toFixed(1) + 'k'
  return '$' + Math.round(n)
}

/** Cutoff (YYYY-MM-DD) según el período elegido, relativo a `todayStr`. */
function periodCutoff(period: Period, todayStr: string): string {
  const [y, m] = todayStr.split('-').map(Number)
  if (period === 'mtd') return `${y}-${String(m).padStart(2, '0')}-01`
  if (period === 'ytd') return `${y}-01-01`
  const days = period === 'week' ? 7 : 30
  const d = new Date(todayStr + 'T12:00:00')
  d.setDate(d.getDate() - days)
  return d.toISOString().split('T')[0]
}

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

export default function PortfolioValueChart({ points }: { points: PortfolioSnapshotPoint[] }) {
  const [period, setPeriod] = useState<Period>('month')

  if (points.length === 0) {
    return (
      <div className="card p-4 lg:p-5">
        <p className="text-sm font-bold mb-1" style={{ color: 'var(--ink)' }}>Evolución del portafolio</p>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-3)' }}>
          Desde hoy guardamos el valor de tu cartera todos los días. Vuelve mañana para empezar a ver la curva.
        </p>
      </div>
    )
  }

  const today = points[points.length - 1].date
  const cutoff = periodCutoff(period, today)
  const filtered = points.filter(p => p.date >= cutoff)
  const shown = filtered.length >= 2 ? filtered : points.slice(-2)

  const first = shown[0]?.value ?? null
  const last  = shown[shown.length - 1]?.value ?? null
  const delta = first !== null && last !== null ? last - first : null
  const deltaPct = delta !== null && first && first > 0 ? Math.round((delta / first) * 1000) / 10 : null

  const W = 1200, H = 300
  const padLeft = 56, padRight = 12, padTop = 16, padBot = 26
  const n = shown.length
  const values = shown.map(p => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const chartH = H - padTop - padBot
  const chartW = W - padLeft - padRight
  const xs = shown.map((_, i) => padLeft + (n <= 1 ? 0 : (i / (n - 1)) * chartW))
  const ys = values.map(v => padTop + (1 - (v - min) / range) * chartH)
  const linePath = n >= 2 ? smoothPath(xs, ys) : ''
  const areaPath = n >= 2 ? `${linePath} L ${xs[n - 1]},${H - padBot} L ${xs[0]},${H - padBot} Z` : ''
  const trendUp = delta === null || delta >= 0
  const lineColor = trendUp ? 'var(--primary)' : 'var(--coral)'
  const gridFracs = [0.2, 0.5, 0.8]
  const showLabel = (i: number) => n <= 6 || i === 0 || i === n - 1 || i % Math.ceil(n / 6) === 0

  return (
    <div className="card p-4 lg:p-5">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <div>
          <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Evolución del portafolio</p>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--ink-3)' }}>Acciones + billetera, valor real guardado cada día</p>
        </div>
        {delta !== null && (
          <span className="text-xs font-bold tabular-nums" style={{ color: delta >= 0 ? 'var(--mint)' : 'var(--coral)' }}>
            {delta >= 0 ? '+' : '−'}{fmtUSD(Math.abs(delta))}
            {deltaPct !== null && ` (${delta >= 0 ? '+' : ''}${deltaPct}%)`}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        {PERIODS.map(p => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className="px-2.5 py-1 rounded-full text-[11px] font-bold transition-all active:scale-95"
            style={period === p.key
              ? { background: 'var(--primary)', color: 'var(--primary-ink)' }
              : { background: 'var(--surface-2)', color: 'var(--ink-3)' }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {n < 2 ? (
        <p className="text-xs leading-relaxed py-6 text-center" style={{ color: 'var(--ink-3)' }}>
          Todavía no hay suficientes días guardados para este período.
        </p>
      ) : (
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="block" aria-hidden="true">
          <defs>
            <linearGradient id="portfolio-value-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity="0.22" />
              <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
            </linearGradient>
          </defs>

          {gridFracs.map(f => {
            const yPos  = padTop + chartH * f
            const value = min + (1 - f) * range
            return (
              <g key={f}>
                <line x1={padLeft} y1={yPos} x2={W - padRight} y2={yPos}
                  stroke="var(--border)" strokeWidth="1" strokeDasharray="3 4" opacity="0.6" />
                <text x={padLeft - 8} y={yPos + 4} fontSize="10" fontWeight="500" fill="var(--ink-3)" textAnchor="end">
                  {fmtUSDAxis(value)}
                </text>
              </g>
            )
          })}

          <path d={areaPath} fill="url(#portfolio-value-grad)" />
          <path d={linePath} fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

          {xs.map((x, i) => {
            if (i === n - 1) return null
            return <circle key={i} cx={x} cy={ys[i]} r="2.5" fill={lineColor} opacity={i === 0 ? 0.85 : 0.45} />
          })}
          <circle cx={xs[n - 1]} cy={ys[n - 1]} r="7" fill={lineColor} opacity="0.2" />
          <circle cx={xs[n - 1]} cy={ys[n - 1]} r="4" fill={lineColor} />

          {shown.map((p, i) => showLabel(i) && (
            <text key={i} x={xs[i]} y={H - 8} fontSize="10" fontWeight="600" fill="var(--ink-3)"
              textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>
              {fmtDayLabel(p.date)}
            </text>
          ))}
        </svg>
      )}
    </div>
  )
}
