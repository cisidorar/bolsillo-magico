'use client'

import { useState } from 'react'
import { Sparkles, Check } from 'lucide-react'
import { formatCLP } from '@/lib/utils'

// Pilar "Lo fijo que se te olvida": la sugerencia se puede aceptar y el cobro
// entra a la lista. Ficticio.
export default function FijosDemo() {
  const [created, setCreated] = useState(false)
  const base = [
    { name: 'Arriendo', sub: 'día 5', amount: 520000 },
    { name: 'Spotify', sub: 'día 12', amount: 7390, rose: 1000 },
    { name: 'Plan celular', sub: 'día 8', amount: 15990 },
    { name: 'Dentista', sub: 'cuota 2 de 4', amount: 45000 },
  ]
  const total = base.reduce((s, r) => s + r.amount, 0) + (created ? 24990 : 0)

  return (
    <div className="card p-5 lg:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Cobros fijos del mes</p>
        <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(total)}</p>
      </div>
      <ul className="space-y-3 mt-4">
        {base.map(r => (
          <li key={r.name} className="flex items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{r.name}</span>
              <span className="text-xs ml-2" style={{ color: 'var(--ink-3)' }}>{r.sub}</span>
            </span>
            <span className="flex items-center gap-2 shrink-0">
              {r.rose && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                      style={{ color: 'var(--gold-ink)', background: 'color-mix(in srgb, var(--gold) 16%, var(--surface))' }}>
                  subió {formatCLP(r.rose)}
                </span>
              )}
              <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(r.amount)}</span>
            </span>
          </li>
        ))}
        {created && (
          <li className="flex items-center justify-between gap-3 lp-pop">
            <span className="min-w-0">
              <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Gimnasio</span>
              <span className="text-xs ml-2" style={{ color: 'var(--ink-3)' }}>día 5</span>
            </span>
            <span className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                    style={{ color: 'var(--mint-ink)', background: 'color-mix(in srgb, var(--mint) 14%, var(--surface))' }}>
                <Check className="w-3 h-3" aria-hidden /> creado
              </span>
              <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(24990)}</span>
            </span>
          </li>
        )}
      </ul>

      {!created && (
        <div className="mt-4 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center gap-3" style={{ background: 'var(--primary-soft)' }}>
          <Sparkles className="w-4 h-4 shrink-0" style={{ color: 'var(--primary-text)' }} aria-hidden />
          <p className="text-sm flex-1" style={{ color: 'var(--ink)' }}>
            <span className="font-bold">Gimnasio</span> se repite cada mes cerca del día 5, y no está entre tus fijos.
          </p>
          <button type="button" onClick={() => setCreated(true)}
            className="cta-primary min-h-[44px] px-4 rounded-xl text-sm font-bold">
            Crear recurrente
          </button>
        </div>
      )}
    </div>
  )
}
