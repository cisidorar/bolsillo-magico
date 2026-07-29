'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'

interface Props {
  nominalFormatted: string
  realFormatted: string
  /** ej. "IPC Chile, mindicador.cl" — de dónde sale el ajuste. */
  source: string
  /** Clases de tamaño del número — el hero mobile y desktop usan clamps distintos. */
  textClassName?: string
}

/**
 * E5 (roadmap economía): "en pesos de hoy" — apagado por defecto (UX5: no
 * agobiar con un número más si no se pidió). Un tap alterna entre el total
 * nominal y el mismo total ajustado por inflación chilena real (IPC,
 * mindicador.cl), calculado server-side en la página.
 */
export default function RealPesosToggle({
  nominalFormatted, realFormatted, source,
  textClassName = 'text-[clamp(22px,2.2vw,34px)] font-extrabold text-white tabular-nums leading-none tracking-tight break-all',
}: Props) {
  const [real, setReal] = useState(false)

  return (
    <>
      <p className={textClassName}>
        {real ? realFormatted : nominalFormatted}
      </p>
      <button
        type="button"
        onClick={() => setReal(v => !v)}
        className="mt-2.5 inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg transition-colors"
        style={{ background: 'rgba(255,255,255,0.16)', color: 'rgba(255,255,255,0.85)' }}
      >
        <RefreshCw className="w-2.5 h-2.5" />
        {real ? `En pesos de hoy · ${source}` : 'Ver en pesos de hoy'}
      </button>
    </>
  )
}
