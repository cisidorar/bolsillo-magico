import type { CSSProperties } from 'react'

/**
 * Acentos de color disponibles en Preferencias → Apariencia.
 * Paleta y nombres siguen docs/SETTINGS_DESIGN.md ("Curar 3–4 opciones:
 * #4D93FF · #34D6A2 · #A78BFA · #FFD166"). El primary es el mismo hex en
 * light y dark — solo cambia el 'ink' (texto sobre el color) y el 'soft'
 * (tinte de fondo) para mantener contraste en cada tema.
 * 'blue' son los valores default históricos de --primary/--primary-ink/--primary-soft
 * en globals.css, así que un usuario que nunca toca esta preferencia no ve ningún cambio.
 */
export const ACCENT_COLORS = {
  blue: {
    label: 'Azul',
    light: { primary: '#4D93FF', ink: '#FFFFFF', soft: '#E8EFFE' },
    dark:  { primary: '#4D93FF', ink: '#07122A', soft: '#16233D' },
  },
  mint: {
    label: 'Menta',
    light: { primary: '#34D6A2', ink: '#07122A', soft: '#E6FAF3' },
    dark:  { primary: '#34D6A2', ink: '#07122A', soft: '#123328' },
  },
  purple: {
    label: 'Morado',
    light: { primary: '#A78BFA', ink: '#1B1033', soft: '#F5F3FF' },
    dark:  { primary: '#A78BFA', ink: '#1B1033', soft: '#241A44' },
  },
  gold: {
    label: 'Dorado',
    light: { primary: '#FFD166', ink: '#1A1200', soft: '#FFF7E6' },
    dark:  { primary: '#FFD166', ink: '#1A1200', soft: '#3A2C0D' },
  },
} as const

export type AccentKey = keyof typeof ACCENT_COLORS
export const DEFAULT_ACCENT: AccentKey = 'blue'

export function isAccentKey(v: string | null | undefined): v is AccentKey {
  return !!v && v in ACCENT_COLORS
}

/** Los 6 custom properties CSS que globals.css lee (con fallback a los valores de 'blue'). */
export function accentCssVars(key: AccentKey): CSSProperties {
  const cfg = ACCENT_COLORS[key]
  return {
    '--accent-primary':      cfg.light.primary,
    '--accent-ink':          cfg.light.ink,
    '--accent-soft':         cfg.light.soft,
    '--accent-primary-dark': cfg.dark.primary,
    '--accent-ink-dark':     cfg.dark.ink,
    '--accent-soft-dark':    cfg.dark.soft,
  } as CSSProperties
}
