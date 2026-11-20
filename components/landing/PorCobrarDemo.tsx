'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { formatCLP } from '@/lib/utils'

// "Te deben" (nov 2026), en versión de muestra para la landing y la demo.
// Pagaste algo con tu tarjeta por otros: el estado de cuenta cobra el total, tu
// gasto es solo tu parte, y la app lleva quién te debe y desde cuándo. Todo
// ficticio y en memoria. Verde solo confirma (ya te pagaron); el cobro más
// antiguo va con una etiqueta dorada chica, nunca un aviso grande (UX5).

const TOTAL = 96000
const SHARE = 24000
const PEOPLE = [
  { id: 'ana',  name: 'Ana',  since: 'hace 9 días', late: true },
  { id: 'beto', name: 'Beto', since: 'hace 3 días', late: false },
  { id: 'caro', name: 'Caro', since: 'hoy',         late: false },
]

export default function PorCobrarDemo() {
  const [paid, setPaid] = useState<Set<string>>(new Set())
  const owed = (PEOPLE.length - paid.size) * SHARE

  function toggle(id: string) {
    setPaid(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  return (
    <div className="card p-5 lg:p-6 w-full min-w-0">
      <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Cena de cumpleaños</p>
      <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>Pagaste con tu Visa, entre 4 personas</p>

      <div className="grid grid-cols-2 gap-3 mt-4">
        <div className="rounded-2xl p-3.5" style={{ background: 'var(--surface-2)' }}>
          <p className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Tu estado de cuenta cobra</p>
          <p className="text-base font-bold tabular-nums mt-1" style={{ color: 'var(--ink)' }}>{formatCLP(TOTAL)}</p>
        </div>
        <div className="rounded-2xl p-3.5" style={{ background: 'var(--surface-2)' }}>
          <p className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Tu gasto real</p>
          <p className="text-base font-bold tabular-nums mt-1" style={{ color: 'var(--ink)' }}>{formatCLP(SHARE)}</p>
        </div>
      </div>

      <div className="mt-5" aria-live="polite">
        <p className="text-xs font-bold" style={{ color: 'var(--ink-3)' }}>Te deben</p>
        {owed > 0 ? (
          <p key={owed} className="sd-flip text-3xl font-extrabold tabular-nums mt-0.5" style={{ fontFamily: 'var(--font-fredoka), sans-serif', color: 'var(--ink)' }}>
            {formatCLP(owed)}
          </p>
        ) : (
          <p key="done" className="sd-flip text-2xl font-semibold mt-0.5 inline-flex items-center gap-2" style={{ color: 'var(--mint-ink)' }}>
            <Check className="w-6 h-6" aria-hidden /> Todo cobrado
          </p>
        )}
      </div>

      <ul className="mt-4 space-y-2.5">
        {PEOPLE.map(p => {
          const done = paid.has(p.id)
          return (
            <li key={p.id} className="flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{p.name}</span>
                <span className="text-xs ml-2" style={{ color: 'var(--ink-3)' }}>{p.since}</span>
                {p.late && !done && (
                  <span className="text-[11px] font-bold ml-2 px-2 py-0.5 rounded-full"
                        style={{ color: 'var(--gold-ink)', background: 'color-mix(in srgb, var(--gold) 16%, var(--surface))' }}>
                    pendiente
                  </span>
                )}
              </span>
              <span className="flex items-center gap-3 shrink-0">
                <span className="text-sm font-bold tabular-nums" style={{ color: done ? 'var(--ink-3)' : 'var(--ink)' }}>{formatCLP(SHARE)}</span>
                <button type="button" aria-pressed={done} onClick={() => toggle(p.id)}
                  className="min-h-[44px] min-w-[92px] px-3 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-1.5 transition-colors duration-150 active:scale-[.97]"
                  style={done
                    ? { color: 'var(--mint-ink)', background: 'color-mix(in srgb, var(--mint) 14%, var(--surface))' }
                    : { color: 'var(--primary-text)', background: 'var(--primary-soft)' }}>
                  {done ? <><Check className="w-4 h-4" aria-hidden /> Pagó</> : 'Me pagó'}
                </button>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
