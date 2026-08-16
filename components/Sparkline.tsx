// Extraído de app/(dashboard)/ingresos/page.tsx (ago 2026) — lo necesita
// también IncomeHistoryRow.tsx (client component), y una función no se
// puede pasar como prop de un Server Component a uno 'use client' (no es
// serializable), así que vive en su propio módulo que ambos importan.
export default function Sparkline({ values, positive = true }: { values: number[]; positive?: boolean }) {
  const w = 80, h = 28, pad = 3
  if (values.filter(v => v > 0).length < 2) {
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <line x1={pad} y1={h/2} x2={w-pad} y2={h/2} stroke="var(--border)" strokeWidth="1.5" strokeDasharray="3 3" />
      </svg>
    )
  }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const xs = values.map((_, i) => pad + (i / (values.length - 1)) * (w - pad * 2))
  const ys = values.map(v => h - pad - ((v - min) / range) * (h - pad * 2))
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <polyline
        points={xs.map((x, i) => `${x},${ys[i]}`).join(' ')}
        fill="none"
        stroke={positive ? 'var(--mint)' : 'var(--border)'}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={xs[xs.length-1]} cy={ys[ys.length-1]} r="2.5" fill={positive ? 'var(--mint)' : 'var(--border)'} />
    </svg>
  )
}
