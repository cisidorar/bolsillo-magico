'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { X, TrendingUp, TrendingDown, Minus, ArrowRight } from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import { useBackdropClose } from './useBackdropClose'

// ── Pop-up resumen por categoría de patrimonio (sep 2026, Cas: "cuando
// presione Depósitos o cualquiera así se abra un pop up resumen") ──────────
// Antes cada fila de la composición (Acciones/Depósitos/Ahorro/Dólares) era
// un <Link> que sacaba a Cas directo a /inversiones — sin mostrar nada antes.
// Ahora la fila abre un resumen rápido (cuánto, qué % del total, cómo se
// movió vs el mes pasado) y desde ahí, si quiere más, un botón la lleva a la
// vista completa. El estado (open/close, Esc, backdrop) vive acá adentro —
// PatrimonioCards.tsx sigue siendo Server Component y no necesita saber nada
// de esto, solo pasar los números ya calculados.

interface Props {
  label:     string
  value:     number
  share:     number            // % del patrimonio total
  color:     string
  icon:      ReactNode         // <Icon /> ya renderizado por el padre (server)
  href:      string            // a dónde ir si quiere el detalle completo
  ctaLabel:  string            // ej. "Ver depósitos"
  delta:     number | null     // vs cierre del mes anterior; null = sin dato o "en tránsito"
  deltaPct:  number | null
  isTransit: boolean           // ej. Dólares: saldo de billetera, no es rendimiento
  trend:     number[]          // últimos meses, para el mini-gráfico
  prevLabel: string | null     // 'agosto' — mes contra el que se compara
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null
  const W = 100, H = 28, pad = 3
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const xs = values.map((_, i) => pad + (i / (values.length - 1)) * (W - pad * 2))
  const ys = values.map(v => pad + (1 - (v - min) / range) * (H - pad * 2))
  const path = xs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x},${ys[i]}`).join(' ')
  return (
    <svg width="100%" height="36" viewBox={`0 0 ${W} ${H}`} className="block" aria-hidden="true">
      <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r="3" fill={color} />
    </svg>
  )
}

export default function CategoryDetailModal({
  label, value, share, color, icon, href, ctaLabel,
  delta, deltaPct, isTransit, trend, prevLabel,
}: Props) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  const backdropClose = useBackdropClose(close)
  const DeltaIcon = delta === null || delta === 0 ? Minus : delta > 0 ? TrendingUp : TrendingDown

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-opacity hover:opacity-80 text-left"
        style={{ background: 'var(--surface-2)' }}
      >
        <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--surface)' }}>
          {icon}
        </div>
        <p className="text-xs font-semibold flex-1" style={{ color: 'var(--ink-2)' }}>
          {label}
          <span className="ml-1.5 text-[10px] font-bold tabular-nums" style={{ color: 'var(--ink-3)' }}>{share}%</span>
        </p>
        <p className="text-sm font-extrabold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(value)}</p>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.65)' }}
          role="dialog" aria-modal="true" aria-label={`Resumen de ${label}`}
          {...backdropClose}
        >
          <div
            className="w-full lg:max-w-sm rounded-t-3xl lg:rounded-3xl overflow-hidden"
            style={{ background: 'var(--surface)', maxHeight: '85dvh' }}
          >
            <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-1 lg:hidden" style={{ background: 'var(--border)' }} />

            <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--surface-2)' }}>
                  {icon}
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-3)' }}>{label}</p>
                  <p className="text-xl font-extrabold tabular-nums leading-tight"
                    style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--ink)' }}>
                    {formatCLP(value)}
                  </p>
                </div>
              </div>
              <button
                onClick={close}
                aria-label="Cerrar"
                className="w-8 h-8 flex items-center justify-center rounded-full transition-colors flex-shrink-0"
                style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-5 space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold"
                  style={{ background: 'var(--surface-2)', color: 'var(--ink-2)' }}>
                  {share}% del patrimonio
                </span>
              </div>

              {isTransit ? (
                <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
                  Plata en tránsito hacia acciones — su variación no es rendimiento ni pérdida.
                </p>
              ) : delta !== null ? (
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-bold">
                    <DeltaIcon className="w-3.5 h-3.5" style={{ color: delta > 0 ? 'var(--mint)' : delta < 0 ? 'var(--coral)' : 'var(--ink-3)' }} />
                    <span className="tabular-nums" style={{ color: delta > 0 ? 'var(--mint)' : delta < 0 ? 'var(--coral)' : 'var(--ink-3)' }}>
                      {delta >= 0 ? '+' : '−'}{formatCLP(Math.abs(delta))}
                      {deltaPct !== null && ` (${delta >= 0 ? '+' : ''}${deltaPct}%)`}
                    </span>
                  </p>
                  {prevLabel && (
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-3)' }}>vs cierre de {prevLabel}</p>
                  )}
                </div>
              ) : (
                <p className="text-xs" style={{ color: 'var(--ink-3)' }}>Sin mes anterior para comparar todavía.</p>
              )}

              {trend.length >= 2 && (
                <div className="rounded-2xl px-3.5 py-3" style={{ background: 'var(--surface-2)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--ink-3)' }}>
                    Últimos {trend.length} meses
                  </p>
                  <Sparkline values={trend} color={color} />
                </div>
              )}

              <Link
                href={href}
                onClick={close}
                className="flex items-center justify-center gap-1.5 w-full px-4 py-2.5 rounded-xl text-xs font-bold transition-opacity hover:opacity-85"
                style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}
              >
                {ctaLabel} <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
