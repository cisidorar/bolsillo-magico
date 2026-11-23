'use client'

export interface LadderPoint { price: number; label: string; sublabel?: string; color: string; emphasis?: boolean }

const usd = (n: number) => '$' + n.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Color de texto legible de un punto (los de relleno claros no sirven como texto sobre superficie). */
function inkOf(color: string): string {
  if (color === 'var(--coral)') return 'var(--coral-ink)'
  if (color === 'var(--gold)') return 'var(--gold-ink)'
  if (color === 'var(--mint)') return 'var(--mint-ink)'
  if (color === 'var(--primary)') return 'var(--primary-text)'
  return 'var(--ink-2)'
}

/**
 * «Dónde está el precio»: una recta con los niveles que importan y, debajo, la misma escalera en lista
 * (del precio más alto al más bajo) con la distancia desde el precio de ahora. Antes los rótulos viajaban
 * dentro del dibujo y se montaban unos sobre otros cuando dos niveles quedaban cerca; en la lista nunca chocan.
 * El tramo entre tu costo y el precio de ahora se pinta (menta si vas ganando, coral si vas perdiendo).
 */
export default function PriceLadder({ points }: { points: LadderPoint[] }) {
  if (points.length < 2) return null
  const now = points.find(p => p.emphasis)
  const cost = points.find(p => p.label === 'Tu costo')
  const sorted = [...points].sort((a, b) => b.price - a.price)
  const min = sorted[sorted.length - 1].price
  const max = sorted[0].price
  const range = max - min || 1
  const pos = (p: number) => 3 + ((p - min) / range) * 94   // % dentro de la recta, con margen para el punto

  const gaining = !!(now && cost && now.price >= cost.price)
  const span = now && cost ? { from: Math.min(pos(now.price), pos(cost.price)), to: Math.max(pos(now.price), pos(cost.price)) } : null

  return (
    <div>
      <div className="relative h-6 mx-1.5" role="img"
        aria-label={sorted.map(p => `${p.label} ${usd(p.price)}`).join(', ')}>
        <span className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full" style={{ background: 'var(--surface)' }} />
        {span && (
          <span className="rc-grow absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full"
            style={{ left: `${span.from}%`, width: `${Math.max(span.to - span.from, 0.5)}%`, background: gaining ? 'var(--mint)' : 'var(--coral)', opacity: 0.55 }} />
        )}
        {points.map(p => (
          <span key={p.label}
            className="absolute top-1/2 rounded-full"
            style={{
              left: `${pos(p.price)}%`, transform: 'translate(-50%, -50%)',
              width: p.emphasis ? 16 : 12, height: p.emphasis ? 16 : 12, background: p.color,
              boxShadow: '0 0 0 3px var(--surface-2)', zIndex: p.emphasis ? 2 : 1,
            }} />
        ))}
      </div>

      <ul className="mt-3 space-y-0.5">
        {sorted.map(p => {
          const away = now && !p.emphasis ? ((p.price - now.price) / now.price) * 100 : null
          return (
            <li key={p.label} className="flex items-center gap-2.5 min-h-[36px] rounded-xl px-2"
              style={p.emphasis ? { background: 'var(--surface)' } : undefined}>
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: p.color }} aria-hidden />
              <span className={`text-sm flex-1 min-w-0 truncate ${p.emphasis ? 'font-bold' : 'font-medium'}`} style={{ color: p.emphasis ? 'var(--ink)' : 'var(--ink-2)' }}>
                {p.label}
              </span>
              {away !== null && (
                <span className="text-xs tabular-nums" style={{ color: 'var(--ink-3)' }}>
                  {away >= 0 ? '+' : '−'}{Math.abs(away).toLocaleString('es-CL', { maximumFractionDigits: 1 })}%
                </span>
              )}
              <span className="text-sm font-bold tabular-nums w-[84px] text-right" style={{ color: inkOf(p.color) }}>{usd(p.price)}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
