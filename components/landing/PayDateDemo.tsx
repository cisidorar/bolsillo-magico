'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { billingPeriod, statementDueDate, daysBetween, getNowChile } from '@/lib/utils'

// La demo del hero (nov 2026). Antes explicaba el mecanismo ("por compra / por
// facturación") y nunca decía qué ganabas. Ahora responde una sola pregunta
// con una fecha: ¿cuándo pagas esta compra? Comprar justo después del cierre
// te da un mes más para pagar, y eso es lo que se ve.
//
// Usa las mismas funciones que la app (billingPeriod, statementDueDate) con la
// fecha real de hoy, así nunca envejece. Vencimiento fijo el día 5.
//
// Momento animado: al verse por primera vez, el día elegido avanza desde hoy
// hasta el día después del cierre y la fecha de pago salta un mes. Se detiene
// apenas la persona toca algo; con movimiento reducido no se mueve solo.

const CLOSING_DAYS = [5, 15, 20, 25]
const DUE_DAY = 5
const SPAN = 14
const MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
const WEEKDAYS = ['dom','lun','mar','mié','jue','vie','sáb']

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const dayOf = (s: string) => Number(s.slice(8))
const longDate = (s: string) => `${dayOf(s)} de ${MONTHS[Number(s.slice(5, 7)) - 1]}`

interface Outcome { due: string; days: number; stMonth: number; stYear: number; closeDate: string }

// Cuenta hasta el número en ~600 ms para que el salto de la fecha se sienta.
// Con movimiento reducido salta directo.
function useCountUp(target: number) {
  const [v, setV] = useState(target)
  const from = useRef(target)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(target); from.current = target; return }
    const start = from.current, t0 = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 600)
      const e = 1 - Math.pow(1 - k, 3)
      const cur = Math.round(start + (target - start) * e)
      setV(cur); from.current = cur
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target])
  return v
}

function outcome(today: string, date: string, closing: number, afterCut: boolean): Outcome {
  let { month, year } = billingPeriod(date, closing)
  // El día del cierre manda la hora: hasta las 14:00 entra al estado que cierra
  // ese día; después, al siguiente (igual que currentStatementRange).
  if (dayOf(date) === closing && afterCut) {
    month = month === 12 ? 1 : month + 1
    if (month === 1) year += 1
  }
  const due = statementDueDate(month, year, DUE_DAY)
  const closeDate = `${year}-${String(month).padStart(2, '0')}-${String(closing).padStart(2, '0')}`
  return { due, days: daysBetween(today, due), stMonth: month, stYear: year, closeDate }
}

export default function PayDateDemo() {
  const today = getNowChile().dateStr
  const days = useMemo(() => Array.from({ length: SPAN }, (_, i) => addDays(today, i)), [today])

  const [closing, setClosing]   = useState(20)
  const [selected, setSelected] = useState(0)
  const [afterCut, setAfterCut] = useState(false)
  const rootRef    = useRef<HTMLDivElement>(null)
  const stripRef   = useRef<HTMLDivElement>(null)
  const touchedRef = useRef(false)
  const touch = () => { touchedRef.current = true }

  // El mejor día de la ventana: el que deja más días para pagar.
  const best = useMemo(() => {
    let bi = 0, bd = -1
    days.forEach((d, i) => { const o = outcome(today, d, closing, false); if (o.days > bd) { bd = o.days; bi = i } })
    return bi
  }, [days, today, closing])

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setSelected(best); return }
    let timer: ReturnType<typeof setTimeout> | undefined
    const io = new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting) return
      io.disconnect()
      let i = 0
      const step = () => {
        if (touchedRef.current) return
        i += 1; setSelected(i)
        if (i < best) timer = setTimeout(step, 380)
      }
      timer = setTimeout(step, 1100)
    }, { threshold: 0.5 })
    io.observe(el)
    return () => { io.disconnect(); if (timer) clearTimeout(timer) }
    // Solo la primera vez que se ve; después manda la persona.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Mantener el día elegido a la vista en la tira (teléfono).
  useEffect(() => {
    const strip = stripRef.current
    const chip = strip?.querySelector<HTMLElement>(`[data-i="${selected}"]`)
    if (strip && chip) strip.scrollTo({ left: chip.offsetLeft - strip.clientWidth / 2 + chip.clientWidth / 2, behavior: 'smooth' })
  }, [selected])

  const date = days[selected]
  const isClosingDay = dayOf(date) === closing
  const o  = outcome(today, date, closing, isClosingDay && afterCut)
  const ob = outcome(today, days[best], closing, false)
  const isBest = o.due === ob.due
  const shownDays = useCountUp(o.days)

  // Línea de tiempo compra → cierre → pago, en proporción a los días reales.
  const total   = Math.max(1, daysBetween(date, o.due))
  const closePct = Math.min(100, Math.max(0, (daysBetween(date, o.closeDate) / total) * 100))
  const labelPct = Math.min(72, Math.max(28, closePct))

  return (
    <div ref={rootRef} className="card p-5 lg:p-6 w-full min-w-0" style={{ boxShadow: '0 18px 40px var(--shadow)' }}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>¿Cuándo pagas esta compra?</p>
        <span className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Vence el día {DUE_DAY}</span>
      </div>

      <fieldset className="mt-4">
        <legend className="text-xs font-semibold mb-2" style={{ color: 'var(--ink-2)' }}>Tu tarjeta factura el día</legend>
        <div className="flex gap-2">
          {CLOSING_DAYS.map(d => (
            <button key={d} type="button" aria-pressed={closing === d}
              onClick={() => { touch(); setClosing(d); setAfterCut(false) }}
              className={`flex-1 min-h-[44px] rounded-xl border text-sm font-bold tabular-nums transition-colors ${closing === d ? 'sheet-toggle-active' : 'sheet-toggle'}`}
              style={{ color: closing === d ? 'var(--primary-text)' : 'var(--ink-2)', borderWidth: 1.5 }}>
              {d}
            </button>
          ))}
        </div>
      </fieldset>

      <p className="text-xs font-semibold mt-4 mb-2" style={{ color: 'var(--ink-2)' }} id="pd-days">Compras el…</p>
      <div ref={stripRef} role="group" aria-labelledby="pd-days" className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1 pb-1 snap-x lg:grid lg:grid-cols-[repeat(14,minmax(0,1fr))] lg:gap-1 lg:overflow-visible lg:mx-0 lg:px-0">
        {days.map((d, i) => {
          const on = i === selected
          const closes = dayOf(d) === closing
          const isBestChip = i === best && !closes
          const wd = WEEKDAYS[new Date(d + 'T12:00:00').getDay()]
          return (
            <button key={d} data-i={i} type="button" aria-pressed={on}
              aria-label={`${i === 0 ? 'Hoy, ' : ''}${wd} ${longDate(d)}${closes ? ', día de facturación' : ''}${isBestChip ? ', el mejor día para comprar' : ''}`}
              onClick={() => { touch(); setSelected(i) }}
              className="snap-start shrink-0 w-12 lg:w-auto min-h-[60px] lg:min-h-[72px] rounded-xl flex flex-col items-center justify-center border transition-[background-color,border-color,transform] active:scale-95"
              style={on
                ? { background: 'var(--primary-soft)', borderColor: 'var(--primary)', color: 'var(--primary-text)', borderWidth: 1.5 }
                : { background: 'var(--surface-2)', borderColor: 'transparent', color: 'var(--ink-2)', borderWidth: 1.5 }}>
              <span className="text-[11px] font-semibold">{i === 0 ? 'hoy' : wd}</span>
              <span className="text-base font-bold tabular-nums leading-tight">{dayOf(d)}</span>
              <span className="text-[11px] font-bold leading-none h-3" style={{ color: closes ? 'var(--gold-ink)' : isBestChip ? 'var(--mint-ink)' : 'transparent' }}>
                {closes ? 'factura' : isBestChip ? 'mejor' : '·'}
              </span>
            </button>
          )
        })}
      </div>

      {isClosingDay && (
        <div className="flex gap-2 mt-3" role="group" aria-label="Hora de la compra">
          {[false, true].map(after => (
            <button key={String(after)} type="button" aria-pressed={afterCut === after}
              onClick={() => { touch(); setAfterCut(after) }}
              className={`flex-1 min-h-[44px] rounded-xl border text-xs font-bold transition-colors ${afterCut === after ? 'sheet-toggle-active' : 'sheet-toggle'}`}
              style={{ color: afterCut === after ? 'var(--primary-text)' : 'var(--ink-2)', borderWidth: 1.5 }}>
              {after ? 'Después de las 14:00' : 'Antes de las 14:00'}
            </button>
          ))}
        </div>
      )}

      <div className="mt-5 lg:mt-6 lg:pt-6 lg:grid lg:grid-cols-2 lg:gap-x-10 lg:items-center lg:border-t" style={{ borderColor: 'var(--border)' }} aria-live="polite">
        <div key={o.due} className="sd-flip">
          <p className="text-3xl lg:text-[2.5rem] font-semibold leading-tight" style={{ fontFamily: 'var(--font-fredoka), sans-serif', color: 'var(--ink)' }}>
            La pagas el {longDate(o.due)}
          </p>
          <p className="text-sm mt-1.5" style={{ color: 'var(--ink-2)' }}>
            <span className="font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{shownDays} días</span> desde hoy · entra al estado que factura el {closing} de {MONTHS[o.stMonth - 1]}
          </p>
        </div>

        <div className="min-w-0">
        {/* Compra → cierre → pago, a escala */}
        <div className="relative mt-6 lg:mt-2 mb-9 h-2" role="img"
          aria-label={`Compras el ${longDate(date)}, el estado cierra el ${longDate(o.closeDate)} y pagas el ${longDate(o.due)}`}>
          <div className="absolute inset-0 rounded-full" style={{ background: 'var(--surface-2)' }} />
          <div className="absolute top-0 bottom-0 left-0 rounded-full"
            style={{ width: `${closePct}%`, background: 'var(--primary)', transition: 'width .6s cubic-bezier(.16,1,.3,1)' }} />
          <div className="absolute top-0 bottom-0 rounded-full"
            style={{ left: `${closePct}%`, right: 0, background: 'var(--primary-soft)', transition: 'left .6s cubic-bezier(.16,1,.3,1)' }} />
          {[
            { left: 0,        c: 'var(--primary)',  tr: 'translateX(0)' },
            { left: closePct, c: 'var(--gold-ink)', tr: 'translateX(-50%)' },
            { left: 100,      c: 'var(--primary)',  tr: 'translateX(-100%)' },
          ].map((m, i) => (
            <span key={i} className="absolute top-1/2 w-4 h-4 rounded-full"
              style={{ left: `${m.left}%`, background: 'var(--surface)', border: `3px solid ${m.c}`, transform: `translateY(-50%) ${m.tr}`, transition: 'left .6s cubic-bezier(.16,1,.3,1)' }} />
          ))}
          <span className="absolute top-5 left-0 text-[11px] font-semibold leading-tight" style={{ color: 'var(--ink-3)' }}>compras</span>
          <span className="absolute top-5 text-[11px] font-semibold leading-tight whitespace-nowrap" style={{ left: `${labelPct}%`, transform: 'translateX(-50%)', color: 'var(--gold-ink)', transition: 'left .6s cubic-bezier(.16,1,.3,1)' }}>
            cierra el {dayOf(o.closeDate)}
          </span>
          <span className="absolute top-5 right-0 text-[11px] font-semibold leading-tight" style={{ color: 'var(--primary-text)' }}>pagas</span>
        </div>

        <div className="min-h-[2.5rem] flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-sm font-semibold" style={{ color: isBest ? 'var(--mint-ink)' : 'var(--ink)' }}>
            {isBest
              ? 'Es el mejor día de estas dos semanas para una compra grande.'
              : `Si esperas al ${dayOf(days[best])}, la pagas el ${longDate(ob.due)}: ${ob.days - o.days} días más.`}
          </p>
          {!isBest && (
            <button type="button" onClick={() => { touch(); setSelected(best) }}
              className="min-h-[44px] px-3 -mx-1 text-sm font-bold underline underline-offset-4 rounded-lg"
              style={{ color: 'var(--primary-text)' }}>
              Verlo
            </button>
          )}
        </div>
        {isClosingDay && (
          <p className="text-xs mt-1" style={{ color: 'var(--ink-3)' }}>
            El día que factura, la compra entra a ese estado solo hasta las 14:00.
          </p>
        )}
        </div>
      </div>

      <p className="text-xs mt-4 pt-3" style={{ color: 'var(--ink-3)', borderTop: '1px solid var(--border)' }}>
        Vale si pagas el total facturado. En cuotas o pagando el mínimo hay intereses.
      </p>
    </div>
  )
}
