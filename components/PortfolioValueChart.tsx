'use client'

import { useState } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'

// ── Curva diaria del valor de la cartera (pedido de Cas, ago 2026) ──────────
// Mockup de referencia: apps de inversión tipo Racional — línea de valor
// angular (sin suavizado) + línea escalonada de "Depósitos" (plata aportada,
// acumulada) para comparar cuánto pusiste vs cuánto vale hoy. A diferencia
// del gráfico reconstruido de lib/portfolio-history.ts, "Valor" son puntos
// REALES guardados día a día por el cron desde que existe portfolio_snapshots
// — por eso puede arrancar corto e ir creciendo solo con el tiempo. Mismo
// cuidado de viewBox que el resto de la app (CLAUDE.md): ancho grande para
// que la tipografía no se agigante al estirarse en desktop.

export interface PortfolioSnapshotPoint {
  date:  string  // YYYY-MM-DD
  value: number  // USD
}

type Period = 'week' | 'month' | 'mtd' | 'ytd'

const PERIODS: { key: Period; label: string }[] = [
  { key: 'week',  label: '1S' },
  { key: 'month', label: '1M' },
  { key: 'mtd',   label: 'MTD' },
  { key: 'ytd',   label: 'YTD' },
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
function daysSince(fromStr: string, toStr: string): number {
  const a = new Date(fromStr + 'T12:00:00').getTime()
  const b = new Date(toStr + 'T12:00:00').getTime()
  return Math.round((b - a) / 86_400_000)
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

/** Valor acumulado conocido en `dateStr` o antes (para arrancar la línea
 *  escalonada de Depósitos con el saldo correcto, aunque el último aporte
 *  haya sido antes del inicio de la ventana visible). */
function valueAsOf(points: PortfolioSnapshotPoint[], dateStr: string): number {
  let v = 0
  for (const p of points) { if (p.date <= dateStr) v = p.value; else break }
  return v
}

export default function PortfolioValueChart({
  points,
  depositsPoints,
}: {
  points: PortfolioSnapshotPoint[]
  depositsPoints: PortfolioSnapshotPoint[]
}) {
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

  // ── Línea de Valor: puntos reales dentro de la ventana ────────────────────
  const valueInRange = points.filter(p => p.date >= cutoff && p.date <= today)
  const valueShown = valueInRange.length >= 2 ? valueInRange : points.slice(-2)

  const first = valueShown[0]?.value ?? null
  const last  = valueShown[valueShown.length - 1]?.value ?? null
  const delta = first !== null && last !== null ? last - first : null
  const deltaPct = delta !== null && first && first > 0 ? Math.round((delta / first) * 1000) / 10 : null

  // ── Línea de Depósitos: escalonada, arranca con el acumulado a la fecha de
  // corte (aunque el último aporte sea anterior) y se extiende plana hasta hoy.
  const depositsEvents = depositsPoints.filter(p => p.date > cutoff && p.date <= today)
  const depositsStart = valueAsOf(depositsPoints, cutoff)
  const depositsStairs: PortfolioSnapshotPoint[] = [{ date: cutoff, value: depositsStart }, ...depositsEvents]
  const hasDeposits = depositsPoints.length > 0

  const W = 1200, H = 300
  const padLeft = 56, padRight = 12, padTop = 16, padBot = 26
  const chartH = H - padTop - padBot
  const chartW = W - padLeft - padRight
  const totalDays = Math.max(1, daysSince(cutoff, today))
  const xOf = (dateStr: string) => padLeft + (daysSince(cutoff, dateStr) / totalDays) * chartW

  // Escala Y compartida entre ambas líneas
  const allValues = [
    ...valueShown.map(p => p.value),
    ...(hasDeposits ? depositsStairs.map(p => p.value) : []),
  ]
  const min = Math.min(...allValues)
  const max = Math.max(...allValues)
  const range = max - min || 1
  const yOf = (v: number) => padTop + (1 - (v - min) / range) * chartH

  // Línea de valor — angular (sin suavizado), como el mockup de referencia
  const valueXs = valueShown.map(p => xOf(p.date))
  const valueYs = valueShown.map(p => yOf(p.value))
  const valuePath = valueXs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)},${valueYs[i].toFixed(1)}`).join(' ')
  const areaPath = `${valuePath} L ${valueXs[valueXs.length - 1].toFixed(1)},${H - padBot} L ${valueXs[0].toFixed(1)},${H - padBot} Z`

  // Línea de depósitos — escalonada, extendida plana hasta hoy
  let depositsPath = ''
  if (hasDeposits) {
    const segs: string[] = []
    for (let i = 0; i < depositsStairs.length; i++) {
      const p = depositsStairs[i]
      const x = xOf(p.date), y = yOf(p.value)
      if (i === 0) { segs.push(`M ${x.toFixed(1)},${y.toFixed(1)}`); continue }
      const prevY = yOf(depositsStairs[i - 1].value)
      segs.push(`L ${x.toFixed(1)},${prevY.toFixed(1)}`)  // horizontal hasta la fecha del nuevo aporte
      segs.push(`L ${x.toFixed(1)},${y.toFixed(1)}`)       // salto vertical al nuevo acumulado
    }
    const lastVal = depositsStairs[depositsStairs.length - 1].value
    segs.push(`L ${xOf(today).toFixed(1)},${yOf(lastVal).toFixed(1)}`)  // plano hasta hoy
    depositsPath = segs.join(' ')
  }

  const trendUp = delta === null || delta >= 0
  const lineColor = trendUp ? 'var(--mint)' : 'var(--coral)'
  const depositsColor = 'var(--ink-3)'
  const gridFracs = [0.2, 0.5, 0.8]
  const xLabelDates = [cutoff, today]

  return (
    <div className="card p-4 lg:p-5">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
        <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-3)' }}>Evolución del portafolio</p>
      </div>

      <div className="flex items-baseline gap-2 flex-wrap mb-2">
        <p className="text-3xl font-extrabold tabular-nums leading-none" style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--ink)' }}>
          {fmtUSD(last ?? 0)}
        </p>
        {delta !== null && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold tabular-nums"
            style={delta >= 0
              ? { background: 'rgba(31,190,141,0.14)', color: 'var(--mint)' }
              : { background: 'rgba(255,111,97,0.14)', color: 'var(--coral)' }}>
            {delta >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {delta >= 0 ? '+' : '−'}{fmtUSD(Math.abs(delta))}
            {deltaPct !== null && ` (${delta >= 0 ? '+' : ''}${deltaPct}%)`}
          </span>
        )}
      </div>

      {hasDeposits && (
        <div className="flex items-center gap-4 mb-3">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: 'var(--ink-2)' }}>
            <span className="w-2 h-2 rounded-full" style={{ background: lineColor }} /> Valor
          </span>
          <span className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: 'var(--ink-3)' }}>
            <span className="w-2 h-2 rounded-full" style={{ background: depositsColor }} /> Depósitos
          </span>
        </div>
      )}

      {/* Selector de período — una sola barra redondeada, activo en blanco (mockup de Cas) */}
      <div className="inline-flex items-center gap-0.5 p-1 rounded-full mb-3" style={{ background: 'var(--surface-2)' }}>
        {PERIODS.map(p => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className="px-3 py-1 rounded-full text-[11px] font-bold transition-all active:scale-95"
            style={period === p.key
              ? { background: 'var(--surface)', color: 'var(--ink)', boxShadow: '0 1px 4px var(--shadow)' }
              : { color: 'var(--ink-3)' }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {valueShown.length < 2 ? (
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
          {hasDeposits && (
            <path d={depositsPath} fill="none" stroke={depositsColor} strokeWidth="1.5" strokeLinejoin="round" opacity="0.7" />
          )}
          <path d={valuePath} fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

          {valueXs.map((x, i) => {
            if (i === valueXs.length - 1) return null
            return <circle key={i} cx={x} cy={valueYs[i]} r="2.5" fill={lineColor} opacity={i === 0 ? 0.85 : 0.45} />
          })}
          <circle cx={valueXs[valueXs.length - 1]} cy={valueYs[valueYs.length - 1]} r="7" fill={lineColor} opacity="0.2" />
          <circle cx={valueXs[valueXs.length - 1]} cy={valueYs[valueYs.length - 1]} r="4" fill={lineColor} />

          {xLabelDates.map((d, i) => (
            <text key={d} x={xOf(d)} y={H - 8} fontSize="10" fontWeight="600" fill="var(--ink-3)"
              textAnchor={i === 0 ? 'start' : 'end'}>
              {fmtDayLabel(d)}
            </text>
          ))}
        </svg>
      )}
    </div>
  )
}
