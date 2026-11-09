'use client'

import React from 'react'

// Chip de opción única para Ajustes. La píldora visible se mantiene chica; el
// botón que la envuelve da el área táctil de 44px (margen negativo para no
// engordar la fila).
export default function SettingChip({
  active, onClick, disabled, children, tone = 'default',
}: {
  active?: boolean
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
  tone?: 'default' | 'danger'
}) {
  const style: React.CSSProperties = tone === 'danger'
    ? { color: 'var(--coral-ink)' }
    : active
      ? { background: 'var(--primary)', color: 'var(--primary-ink)' }
      : { background: 'var(--surface-2)', color: 'var(--ink-2)' }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={tone === 'danger' ? undefined : !!active}
      className="group inline-flex items-center min-h-[44px] -my-1.5 disabled:opacity-60 focus-visible:outline-none"
    >
      <span
        className="px-3 py-1.5 rounded-full text-[11px] font-bold transition-all group-active:scale-95 group-focus-visible:ring-2 group-focus-visible:ring-[var(--primary)]"
        style={style}
      >
        {children}
      </span>
    </button>
  )
}
