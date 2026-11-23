'use client'

import type { ReactNode } from 'react'
import { ArrowUp, ArrowDown, ChevronRight } from 'lucide-react'

export type StockTone = 'ink' | 'mint' | 'coral' | 'muted'

const TONE: Record<StockTone, string> = {
  ink:   'var(--ink)',
  mint:  'var(--mint-ink)',
  coral: 'var(--coral-ink)',
  muted: 'var(--ink-3)',
}

export interface StockCardProps {
  ticker:     string
  name?:      string | null
  /** El logo ya armado (ServiceLogo) para no atar la tarjeta a la forma de cargarlo. */
  logo:       ReactNode
  /** El número protagonista: el criterio por el que se ordena la lista. */
  heroLabel:  string
  hero:       string
  heroTone:   StockTone
  /** Una sola cifra de apoyo, para que el protagonista no esté solo. */
  support?:   { label: string; text: string; tone: StockTone } | null
  /** Cómo le fue hoy (chip arriba a la derecha). */
  today?:     { text: string; tone: StockTone; up: boolean } | null
  /** Qué parte de la cartera es, en % (texto) y su largo relativo en la barra (0 a 1). */
  weightText: string | null
  weightFill: number
  /** Señal de venta: «Sal ya» (cambio de tendencia) o «Vende» (tomar ganancias). */
  alert?:     { label: string; reversed: boolean; reason?: string | null } | null
  /** Posición en la lista: escalona la entrada de la barra. */
  index?:     number
  onOpen:     () => void
}

/**
 * Tarjeta de una acción de «Mis acciones». Un solo número grande (el criterio elegido para ordenar),
 * una cifra de apoyo, cómo le fue hoy y cuánto pesa en la cartera. Todo lo demás vive en el detalle.
 */
export default function StockCard({
  ticker, name, logo, heroLabel, hero, heroTone, support, today, weightText, weightFill, alert, index = 0, onOpen,
}: StockCardProps) {
  const alertTint = alert
    ? alert.reversed
      ? 'color-mix(in srgb, var(--coral) 9%, var(--surface))'
      : 'color-mix(in srgb, var(--gold) 8%, var(--surface))'
    : undefined
  const alertInk = alert?.reversed ? 'var(--coral-ink)' : 'var(--gold-ink)'

  return (
    <button
      type="button"
      onClick={onOpen}
      className="sc-card card group w-full text-left p-4 lg:p-[18px] flex flex-col gap-4"
      style={alertTint ? { background: alertTint } : undefined}
      aria-label={`${ticker}${name ? `, ${name}` : ''}. ${heroLabel} ${hero}${alert ? `. ${alert.label}` : ''}. Ver detalle`}
    >
      {/* Quién es, y cómo le fue hoy */}
      <div className="flex items-start gap-3">
        <span className="flex-shrink-0">{logo}</span>
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-1.5 flex-wrap">
            <span className="text-base font-extrabold leading-tight" style={{ color: 'var(--ink)' }}>{ticker}</span>
            {alert && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ color: alertInk, background: alert.reversed ? 'color-mix(in srgb, var(--coral) 18%, transparent)' : 'color-mix(in srgb, var(--gold) 20%, transparent)' }}>
                {alert.label}
              </span>
            )}
          </span>
          {name && <span className="block text-xs truncate mt-0.5" style={{ color: 'var(--ink-3)' }}>{name}</span>}
        </span>
        {today && (
          <span className="flex items-center gap-0.5 text-xs font-bold tabular-nums px-2 py-1 rounded-full flex-shrink-0"
            style={{
              color: TONE[today.tone],
              background: today.tone === 'mint' ? 'color-mix(in srgb, var(--mint) 14%, transparent)'
                : today.tone === 'coral' ? 'color-mix(in srgb, var(--coral) 14%, transparent)' : 'var(--surface-2)',
            }}>
            {today.up ? <ArrowUp className="w-3 h-3" aria-hidden /> : <ArrowDown className="w-3 h-3" aria-hidden />}
            <span><span className="sr-only">Hoy </span>{today.text}</span>
          </span>
        )}
      </div>

      {/* El protagonista y su apoyo */}
      <div>
        <span className="block text-xs" style={{ color: 'var(--ink-3)' }}>{heroLabel}</span>
        <span className="flex items-end justify-between gap-3">
          <span className="font-display text-[28px] leading-none font-extrabold tabular-nums tracking-tight" style={{ color: TONE[heroTone] }}>{hero}</span>
          <ChevronRight className="sc-chev w-4 h-4 flex-shrink-0 mb-1" style={{ color: 'var(--ink-3)' }} aria-hidden />
        </span>
        {support && (
          <span className="block text-sm mt-2 tabular-nums" style={{ color: 'var(--ink-3)' }}>
            {support.label}{' '}
            <span className="font-semibold" style={{ color: TONE[support.tone] }}>{support.text}</span>
          </span>
        )}
      </div>

      {/* Cuánto pesa en la cartera */}
      {weightText && (
        <span className="block">
          <span className="flex items-center justify-between text-xs" style={{ color: 'var(--ink-3)' }}>
            <span>De tu cartera</span>
            <span className="font-semibold tabular-nums" style={{ color: 'var(--ink-2)' }}>{weightText}</span>
          </span>
          <span className="block mt-1.5 h-1.5 rounded-full" style={{ background: 'var(--surface-2)' }} aria-hidden>
            <span className="rc-grow block h-full rounded-full"
              style={{ width: `${Math.max(3, Math.min(1, weightFill) * 100)}%`, background: 'var(--primary)', ['--d' as string]: `${Math.min(index, 8) * 40}ms` }} />
          </span>
        </span>
      )}

      {alert?.reason && (
        <span className="block text-xs font-semibold leading-snug" style={{ color: alertInk }}>{alert.reason}</span>
      )}
    </button>
  )
}
