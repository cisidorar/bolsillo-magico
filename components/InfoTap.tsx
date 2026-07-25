'use client'

import { Info } from 'lucide-react'
import { useToast } from './ToastProvider'

interface Props {
  /** Frase de una línea que explica el término. Sin jerga, con el cálculo si aplica. */
  explanation: string
  /** Tamaño del ícono — 11px por defecto para no competir con el texto que acompaña. */
  size?: number
  className?: string
  /** Color del ícono — por defecto gris de texto secundario; pasar un tono claro
   *  (ej. 'rgba(255,255,255,0.6)') cuando va sobre fondos oscuros como el hero. */
  color?: string
}

/**
 * UX2 — glosario al tap. Ícono (i) tocable junto a un término no obvio
 * ("Disponible", "Proyección", "Por facturación"...) que muestra su
 * definición en un toast. Mismo patrón ya usado en Inversiones (RiskRail /
 * ConvictionChip, roadmap I4) — se reusa acá en vez de inventar un segundo
 * sistema de popovers. Funciona igual en mobile (tap) y desktop (click).
 */
export default function InfoTap({ explanation, size = 11, className, color }: Props) {
  const { showToast } = useToast()
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); showToast(explanation) }}
      className={`inline-flex items-center justify-center align-middle rounded-full transition-opacity hover:opacity-70 ${className ?? ''}`}
      style={{ color: color ?? 'var(--ink-3)', opacity: color ? 1 : 0.6, verticalAlign: 'middle' }}
      aria-label={`Qué significa: ${explanation}`}
    >
      <Info style={{ width: size, height: size }} />
    </button>
  )
}
