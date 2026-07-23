import type { PortfolioPoint } from '@/lib/portfolio-history'

// W3 (roadmap de vista, fase 2): gráfico hand-coded SVG (convención de la
// app — sin librería de charts) de la evolución del portafolio. Cuidado con
// el viewBox (CLAUDE.md): ancho fijo ~560 con fontSize chico, nunca estirar
// un viewBox angosto a todo el ancho de la columna.

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
function fmtShortDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number)
  return `${d} ${MONTHS_ES[m - 1]}`
}
function fmtUSDCompact(n: number): string {
  return '$' + n.toLocaleString('es-CL', { maximumFractionDigits: 0 })
}

export default function PortfolioChart({ points, costBasisUsd }: { points: PortfolioPoint[]; costBasisUsd: number }) {
  if (points.length < 2) return null

  const W = 560
  const H = 160
  const padL = 4
  const padR = 4
  const padT = 12
  const padB = 20

  const values = points.map(p => p.value)
  const maxV = Math.max(...values, costBasisUsd)
  const minV = Math.min(...values, costBasisUsd)
  const range = maxV - minV || 1

  const x = (i: number) => padL + (i / (points.length - 1)) * (W - padL - padR)
  const y = (v: number) => padT + (1 - (v - minV) / range) * (H - padT - padB)

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L ${x(points.length - 1).toFixed(1)} ${H - padB} L ${x(0).toFixed(1)} ${H - padB} Z`

  const last = points[points.length - 1]
  const isUp = last.value >= costBasisUsd
  const lineColor = isUp ? 'var(--mint)' : 'var(--coral)'
  const costY = y(costBasisUsd)

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 'auto' }}>
        <defs>
          <linearGradient id="portfolioFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.22" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Línea de referencia: costo invertido actual (aproximado, ver caveat) */}
        <line x1={padL} y1={costY} x2={W - padR} y2={costY} stroke="var(--ink-3)" strokeWidth="1" strokeDasharray="4 3" opacity={0.5} />

        <path d={areaPath} fill="url(#portfolioFill)" />
        <path d={linePath} fill="none" stroke={lineColor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {/* Fechas: primera y última nomás — evita agiganta la tipografía en un viewBox angosto */}
        <text x={padL} y={H - 4} fontSize="9" fill="var(--ink-3)">{fmtShortDate(points[0].date)}</text>
        <text x={W - padR} y={H - 4} fontSize="9" fill="var(--ink-3)" textAnchor="end">{fmtShortDate(last.date)}</text>
      </svg>
      <p className="text-[10px] leading-relaxed mt-1" style={{ color: 'var(--ink-3)' }}>
        Línea punteada = costo invertido ({fmtUSDCompact(costBasisUsd)}). Estimado con las posiciones de hoy hacia atrás — no reconstruye compras/ventas pasadas.
      </p>
    </div>
  )
}
