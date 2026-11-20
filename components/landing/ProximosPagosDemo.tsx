'use client'

import { useEffect, useRef, useState } from 'react'
import { currentStatementRange, statementDueDate, daysBetween, getNowChile, formatCLP } from '@/lib/utils'

// La demo del hero (nov 2026): "Lo que viene". Antes era una calculadora (elige
// el día en que factura tu tarjeta, elige un día de compra) y obligaba a saber
// cosas antes de ver algo. Ahora muestra lo que la app ya sabe: los próximos
// pagos de una Visa, cada uno con su fecha, su monto y lo que lo compone. La
// única interacción es una compra de ejemplo que cae en un pago u otro según
// si es antes o después del cierre.
//
// Usa las mismas funciones de fechas que la app con el día de hoy, así nunca
// envejece. Tarjeta ficticia: cierra el 20 y vence el 5 (15 días después).
//
// Momento animado: al verse por primera vez, la compra de ejemplo se prueba
// sola, hoy y luego después del cierre, para que se vea cómo la fecha de pago
// salta un mes. Se detiene apenas la persona toca algo; con movimiento
// reducido no se mueve sola.

const CLOSING = 20
const DUE_DAY = 5
const NEW_AMOUNT = 25000
const MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

interface Line { name: string; sub?: string; amt: number }

// Cada estado tiene las cuotas y cobros fijos que ya sabe la app. El abierto
// suma además lo que llevas gastado.
const SEED: Record<number, Line[]> = {
  [-1]: [
    { name: 'Notebook', sub: 'cuota 2 de 6', amt: 89990 },
    { name: 'Cobros fijos', sub: '2', amt: 14980 },
    { name: 'Supermercado', amt: 71200 },
    { name: 'Otras 14 compras', amt: 212370 },
  ],
  0: [
    { name: 'Notebook', sub: 'cuota 3 de 6', amt: 89990 },
    { name: 'Cobros fijos', sub: '2', amt: 14980 },
    { name: 'Supermercado', amt: 64320 },
    { name: 'Otras 15 compras', amt: 243090 },
  ],
  1: [
    { name: 'Notebook', sub: 'cuota 4 de 6', amt: 89990 },
    { name: 'Cobros fijos', sub: '2', amt: 14980 },
  ],
}

const pad = (n: number) => String(n).padStart(2, '0')
const longDate = (s: string) => `${Number(s.slice(8))} de ${MONTHS[Number(s.slice(5, 7)) - 1]}`
const sum = (lines: Line[]) => lines.reduce((t, l) => t + l.amt, 0)

function shift(month: number, year: number, n: number) {
  const t = year * 12 + (month - 1) + n
  return { month: (t % 12) + 1, year: Math.floor(t / 12) }
}

type Choice = 'hoy' | 'despues'

export default function ProximosPagosDemo() {
  const [choice, setChoice] = useState<Choice | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const touchedRef = useRef(false)

  const { dateStr: today } = getNowChile()
  const cur = currentStatementRange(CLOSING)
  // Estados con pago por delante: el que cerró y aún no vence (si lo hay), el
  // que está corriendo y el siguiente.
  const rows = [-1, 0, 1]
    .map(n => {
      const { month, year } = shift(cur.month, cur.year, n)
      return { n, month, year, due: statementDueDate(month, year, DUE_DAY), close: `${year}-${pad(month)}-${pad(CLOSING)}` }
    })
    .filter(r => r.due >= today)

  const targetN = choice === 'hoy' ? 0 : choice === 'despues' ? 1 : null
  const first = rows[0]
  const firstLines = SEED[first.n].concat(targetN === first.n ? [{ name: 'Tu compra de ejemplo', amt: NEW_AMOUNT }] : [])
  const target = rows.find(r => r.n === targetN)
  const afterClose = shift(cur.month, cur.year, 0)

  function untilText(due: string) {
    const d = daysBetween(today, due)
    return d === 0 ? 'hoy' : d === 1 ? 'mañana' : `en ${d} días`
  }
  function stateText(n: number, close: string) {
    return n === -1 ? `Estado cerrado el ${longDate(close)}` : n === 0 ? `Estado en curso, cierra el ${longDate(close)}` : 'Estado siguiente'
  }

  useEffect(() => {
    const el = rootRef.current
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timers: ReturnType<typeof setTimeout>[] = []
    const io = new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting) return
      io.disconnect()
      timers.push(setTimeout(() => { if (!touchedRef.current) setChoice('hoy') }, 1100))
      timers.push(setTimeout(() => { if (!touchedRef.current) setChoice('despues') }, 2700))
    }, { threshold: 0.5 })
    io.observe(el)
    return () => { io.disconnect(); timers.forEach(clearTimeout) }
  }, [])

  function pick(c: Choice) {
    touchedRef.current = true
    setChoice(prev => (prev === c ? null : c))
  }

  const options: [Choice, string][] = [['hoy', 'Hoy'], ['despues', 'Después del cierre']]

  return (
    <div ref={rootRef} className="card p-5 lg:p-6 w-full min-w-0" style={{ boxShadow: '0 18px 40px var(--shadow)' }}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Lo que viene · Visa</p>
        <span className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Cierra el {CLOSING} · vence el {DUE_DAY}</span>
      </div>

      <div className="mt-5">
        <p className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>{stateText(first.n, first.close)}</p>
        <p className="mt-1 text-3xl lg:text-[2.5rem] font-semibold leading-tight" style={{ fontFamily: 'var(--font-fredoka), sans-serif', color: 'var(--ink)' }}>
          Pagas el {longDate(first.due)}
        </p>
        <p className="mt-1 text-sm" style={{ color: 'var(--ink-2)' }}>
          {untilText(first.due)} ·{' '}
          <span key={sum(firstLines)} className="sd-flip inline-block font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(sum(firstLines))}</span>
          {first.n === 0 ? ' hasta ahora' : ''}
        </p>
        <ul className="mt-4 space-y-2.5">
          {firstLines.map(l => (
            <li key={l.name} className={`flex items-center justify-between gap-3 ${l.name.startsWith('Tu compra') ? 'lp-pop' : ''}`}>
              <span className="min-w-0 text-sm">
                <span className="font-semibold" style={{ color: l.name.startsWith('Tu compra') ? 'var(--primary-text)' : 'var(--ink)' }}>{l.name}</span>
                {l.sub && <span className="ml-2 text-xs" style={{ color: 'var(--ink-3)' }}>{l.sub}</span>}
              </span>
              <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(l.amt)}</span>
            </li>
          ))}
        </ul>
      </div>

      <ul className="mt-5 space-y-2">
        {rows.slice(1).map(r => {
          const withNew = targetN === r.n
          const total = sum(SEED[r.n]) + (withNew ? NEW_AMOUNT : 0)
          return (
            <li key={r.n} className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3" style={{ background: 'var(--surface-2)' }}>
              <span className="min-w-0">
                <span className="block text-sm font-bold" style={{ color: 'var(--ink)' }}>Después, el {longDate(r.due)}</span>
                <span className="block text-xs mt-0.5" style={{ color: 'var(--ink-2)' }}>
                  {withNew ? `Incluye tu compra de ${formatCLP(NEW_AMOUNT)}` : r.n === 1 ? 'Ya están las cuotas y los cobros fijos' : stateText(r.n, r.close)}
                </span>
              </span>
              <span key={total} className="sd-flip text-sm font-bold tabular-nums shrink-0" style={{ color: 'var(--ink)' }}>{formatCLP(total)}</span>
            </li>
          )
        })}
      </ul>

      <p className="mt-6 text-xs font-semibold" id="pp-try" style={{ color: 'var(--ink-2)' }}>Prueba una compra de {formatCLP(NEW_AMOUNT)}</p>
      <div role="group" aria-labelledby="pp-try" className="mt-2 flex gap-2">
        {options.map(([c, label]) => (
          <button key={c} type="button" aria-pressed={choice === c} onClick={() => pick(c)}
            className={`flex-1 min-h-[44px] rounded-xl border text-sm font-bold transition-colors active:scale-[.98] ${choice === c ? 'sheet-toggle-active' : 'sheet-toggle'}`}
            style={{ color: choice === c ? 'var(--primary-text)' : 'var(--ink-2)', borderWidth: 1.5 }}>
            {label}
          </button>
        ))}
      </div>
      <div aria-live="polite" className="mt-3 min-h-[3rem]">
        {target ? (
          <p key={choice} className="sd-flip text-sm font-semibold" style={{ color: 'var(--ink)' }}>
            La pagas el <span style={{ color: 'var(--primary-text)' }}>{longDate(target.due)}</span>
            <span className="font-normal" style={{ color: 'var(--ink-2)' }}>
              {choice === 'despues'
                ? ` · compraste después del cierre del ${longDate(`${afterClose.year}-${pad(afterClose.month)}-${pad(CLOSING)}`)}, así que entra al estado siguiente: un mes más para pagarla.`
                : ' · entra al estado en curso.'}
            </span>
          </p>
        ) : (
          <p className="text-xs" style={{ color: 'var(--ink-3)' }}>Elige cuándo compras y mira en qué pago cae.</p>
        )}
      </div>

      <p className="text-xs mt-4" style={{ color: 'var(--ink-3)' }}>
        Datos de ejemplo. Vale si pagas el total facturado: en cuotas o pagando el mínimo hay intereses.
      </p>
    </div>
  )
}
