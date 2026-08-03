// ── Fila compacta título+valor / hasta 3 stats (mockup de Cas, ago 2026) ─────
// Reemplaza el patrón anterior de "hero-gradient 40% + grid de KPI cards 60%"
// por una sola banda: label + valor grande + caption a la izquierda, hasta 3
// stats en línea a la derecha (se apilan debajo en mobile). Reusado por
// RentaFijaSummary (variant="hero", azul) y por los mini-heroes de
// DepositManager/TermDepositManager (variant="surface", card neutro).

export interface StatHeroStat {
  label: string
  value: string
  /** Color CSS del valor — por defecto ink (surface) o blanco (hero). Usar 'var(--mint)' para ganancias. */
  color?: string
}

interface Props {
  variant:    'hero' | 'surface'
  label:      string   // ej. "TOTAL EN PESOS", "TOTAL EN AHORRO"
  value:      string   // ej. "$2.136.111" — ya formateado
  caption?:   string   // ej. "5,62% TAE promedio · ≈2,1% real"
  stats:      StatHeroStat[]
}

export default function StatHeroRow({ variant, label, value, caption, stats }: Props) {
  const isHero = variant === 'hero'
  const labelColor   = isHero ? 'rgba(255,255,255,0.6)'  : 'var(--ink-3)'
  const valueColor   = isHero ? 'white'                  : 'var(--ink)'
  const captionColor = isHero ? 'rgba(255,255,255,0.45)' : 'var(--ink-3)'
  const statLabelColor = isHero ? 'rgba(255,255,255,0.5)' : 'var(--ink-3)'
  const statValueColor = isHero ? 'white'                 : 'var(--ink)'

  return (
    <div
      className={`card overflow-hidden ${isHero ? 'hero-gradient' : ''} flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 px-5 py-4 lg:py-5`}
    >
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: labelColor }}>
          {label}
        </p>
        <p
          className="text-3xl lg:text-4xl font-extrabold tabular-nums leading-none"
          style={{ color: valueColor, fontFamily: 'Fredoka, sans-serif' }}
        >
          {value}
        </p>
        {caption && (
          <p className="text-[11px] mt-1.5" style={{ color: captionColor }}>
            {caption}
          </p>
        )}
      </div>

      {stats.length > 0 && (
        <div className="flex items-center gap-5 lg:gap-8 flex-wrap shrink-0">
          {stats.map((s, i) => (
            <div key={i} className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-widest mb-1 whitespace-nowrap" style={{ color: statLabelColor }}>
                {s.label}
              </p>
              <p className="text-sm lg:text-base font-bold tabular-nums" style={{ color: s.color ?? statValueColor }}>
                {s.value}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
