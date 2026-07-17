'use client'

import type { ConvictionTier } from '@/lib/conviction'

// ── Risk rail: cuánto arriesgas vs. cuánto puedes ganar, de un vistazo ───────
// Antes el dato más importante para quien TIENE una posición (qué tan cerca
// está de su alarma de salida) vivía en texto de 9px bajo el precio. Esto lo
// hace legible sin leer números: una barra stop→techo con el precio como
// punto, coloreada por cercanía al riesgo. Reutilizado en Posiciones y
// Favoritos (U2 del roadmap UX, jul 2026).

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

export function RiskRail({
  price, stop, resistance, compact = false,
}: {
  price:      number
  stop:       number | null
  resistance: number | null
  compact?:   boolean
}) {
  if (stop === null || stop >= price) return null

  const riskPct = ((price - stop) / price) * 100
  const dangerColor = riskPct <= 1.5 ? 'var(--coral)' : riskPct <= 4 ? 'var(--gold)' : 'var(--mint)'

  // Sin techo conocido: gauge simple de distancia a la salida, sin rail de dos puntas
  if (resistance === null || resistance <= price) {
    return (
      <p className={compact ? 'text-[9px] font-bold tabular-nums' : 'text-[10px] font-semibold tabular-nums'} style={{ color: dangerColor }}>
        −{riskPct.toFixed(1)}% a tu salida
      </p>
    )
  }

  const span     = resistance - stop
  const pricePct = clamp(((price - stop) / span) * 100, 4, 96)

  return (
    <div className={compact ? 'w-full' : 'w-full max-w-[140px]'}>
      <div className="relative h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
        <div className="absolute inset-y-0 left-0" style={{ width: `${pricePct}%`, background: 'rgba(255,111,97,0.25)' }} />
        <div className="absolute inset-y-0" style={{ left: `${pricePct}%`, right: 0, background: 'rgba(31,190,141,0.25)' }} />
        <div className="absolute top-1/2 w-2 h-2 rounded-full -translate-y-1/2 -translate-x-1/2 border"
          style={{ left: `${pricePct}%`, background: dangerColor, borderColor: 'var(--surface)' }} />
      </div>
      {!compact && (
        <div className="flex justify-between mt-0.5">
          <span className="text-[8px] font-semibold tabular-nums" style={{ color: 'var(--ink-3)' }}>−{riskPct.toFixed(1)}%</span>
          <span className="text-[8px] font-semibold tabular-nums" style={{ color: 'var(--ink-3)' }}>+{(((resistance - price) / price) * 100).toFixed(1)}%</span>
        </div>
      )}
    </div>
  )
}

const TIER_COLOR: Record<ConvictionTier, { fg: string; bg: string }> = {
  compra_fuerte: { fg: 'var(--mint)',  bg: 'rgba(31,190,141,0.16)' },
  compra:        { fg: 'var(--mint)',  bg: 'rgba(31,190,141,0.10)' },
  neutral:       { fg: 'var(--ink-3)', bg: 'var(--surface-2)' },
  evitar:        { fg: 'var(--gold)',  bg: 'rgba(255,194,60,0.14)' },
  venta:         { fg: 'var(--coral)', bg: 'rgba(255,111,97,0.14)' },
}

/** Chip numérico único para "qué tan buena es la compra hoy" — reemplaza la
 *  mezcla de banderas (buy/sell/caution) por un solo lenguaje comparable
 *  entre tickers, el mismo número del panel "¿Qué comprar hoy?" y del correo. */
export function ConvictionChip({ score, tier }: { score: number; tier: ConvictionTier }) {
  const c = TIER_COLOR[tier]
  return (
    <span className="inline-flex items-center text-[10px] font-extrabold px-1.5 py-0.5 rounded-full tabular-nums"
      style={{ background: c.bg, color: c.fg }}>
      {score}
    </span>
  )
}
