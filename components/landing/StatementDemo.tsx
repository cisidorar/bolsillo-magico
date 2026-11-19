'use client'

import { useEffect, useRef, useState } from 'react'
import { formatCLP } from '@/lib/utils'

// La mini-demo del hero: la misma compra, vista "por compra" y "por
// facturación". Es la mecánica que un registrador de gastos genérico no
// modela — la tarjeta cierra un día del mes, y ese día el corte es a las 14:00.
// Datos ficticios.
//
// El momento animado de la página: al verse por primera vez, el día de compra
// avanza solo del 18 al 22 y la tarjeta de "Por facturación" salta al próximo
// estado. Muestra el truco sin pedir nada; en cuanto la persona toca algo, el
// control es suyo. Con movimiento reducido no se mueve solo.

const CLOSING_DAYS = [5, 15, 20, 25]
const AMOUNT = 59990

export default function StatementDemo() {
  const [closing, setClosing]   = useState(20)
  const [day, setDay]           = useState(18)
  const [afterCut, setAfterCut] = useState(true)
  const [touched, setTouched]   = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const touchedRef = useRef(false)

  function touch() { touchedRef.current = true; setTouched(true) }

  useEffect(() => {
    const el = rootRef.current
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setDay(22); return }
    let timer: ReturnType<typeof setTimeout> | undefined
    const io = new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting) return
      io.disconnect()
      let d = 18
      const step = () => {
        if (touchedRef.current) return
        d += 1; setDay(d)
        if (d < 22) timer = setTimeout(step, 520)
      }
      timer = setTimeout(step, 900)
    }, { threshold: 0.6 })
    io.observe(el)
    return () => { io.disconnect(); if (timer) clearTimeout(timer) }
  }, [])

  const sameDay = day === closing
  // Igual que billingPeriod/currentStatementRange: día ≤ cierre → este
  // estado; el mismo día del cierre, solo antes de las 14:00.
  const thisStatement = day < closing || (sameDay && !afterCut)

  return (
    <div ref={rootRef} className="card p-5 lg:p-6 w-full" style={{ boxShadow: '0 18px 40px var(--shadow)' }}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Zapatillas</p>
        <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(AMOUNT)}</p>
      </div>

      <fieldset className="mt-5">
        <legend className="text-xs font-semibold mb-2" style={{ color: 'var(--ink-2)' }}>Tu tarjeta cierra el día</legend>
        <div className="flex gap-2">
          {CLOSING_DAYS.map(d => (
            <button
              key={d}
              type="button"
              aria-pressed={closing === d}
              onClick={() => { touch(); setClosing(d) }}
              className={`flex-1 min-h-[44px] rounded-xl border text-sm font-bold tabular-nums transition-colors ${closing === d ? 'sheet-toggle-active' : 'sheet-toggle'}`}
              style={{ color: closing === d ? 'var(--primary-text)' : 'var(--ink-2)', borderWidth: 1.5 }}
            >
              {d}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mt-5">
        <label htmlFor="sd-day" className="flex items-baseline justify-between text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>
          <span>Compraste el día</span>
          <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{day}</span>
        </label>
        <input
          id="sd-day"
          type="range"
          min={1}
          max={30}
          value={day}
          onPointerDown={touch}
          onKeyDown={touch}
          onChange={e => { touch(); setDay(Number(e.target.value)) }}
          className="w-full mt-2 accent-[var(--primary)] h-11 cursor-pointer"
        />
        <p className="text-xs h-4" style={{ color: 'var(--ink-3)' }} aria-hidden={touched}>
          {touched ? '' : 'Mueve el día y mira qué pasa'}
        </p>
        {sameDay && (
          <div className="flex gap-2 mt-1" role="group" aria-label="Hora de la compra">
            {[false, true].map(after => (
              <button
                key={String(after)}
                type="button"
                aria-pressed={afterCut === after}
                onClick={() => { touch(); setAfterCut(after) }}
                className={`flex-1 min-h-[44px] rounded-xl border text-xs font-bold transition-colors ${afterCut === after ? 'sheet-toggle-active' : 'sheet-toggle'}`}
                style={{ color: afterCut === after ? 'var(--primary-text)' : 'var(--ink-2)', borderWidth: 1.5 }}
              >
                {after ? 'Después de las 14:00' : 'Antes de las 14:00'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 mt-4" aria-live="polite">
        <div className="rounded-2xl p-3.5" style={{ background: 'var(--surface-2)' }}>
          <p className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Por compra</p>
          <p className="text-base font-bold mt-1" style={{ color: 'var(--ink)' }}>Este mes</p>
        </div>
        <div
          key={thisStatement ? 'a' : 'b'}
          className="rounded-2xl p-3.5 sd-flip"
          style={{ background: thisStatement ? 'var(--primary-soft)' : 'color-mix(in srgb, var(--gold) 16%, var(--surface))' }}
        >
          <p className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Por facturación</p>
          <p className="text-base font-bold mt-1" style={{ color: 'var(--ink)' }}>
            {thisStatement ? 'Este estado' : 'El próximo'}
          </p>
        </div>
      </div>
      <p className="text-sm mt-3 leading-relaxed min-h-[3.75rem]" style={{ color: 'var(--ink-2)' }}>
        {thisStatement
          ? `Entra en el estado que cierra el ${closing}. Lo pagas en el próximo vencimiento.`
          : sameDay
          ? `El día del cierre, después de las 14:00 ya cuenta para el estado siguiente.`
          : `Ya cerró el ${closing}: esta compra la pagas un mes después de lo que crees.`}
      </p>
    </div>
  )
}
