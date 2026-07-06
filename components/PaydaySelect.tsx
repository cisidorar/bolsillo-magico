'use client'

import { useState, useTransition } from 'react'
import { CalendarDays, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  userId:          string
  payday:          number | null
  lastBusinessDay?: boolean
}

/**
 * Selector del día de sueldo. Personaliza el hero de inicio
 * ("Tu sueldo llega en N días") y alimentará el calendario de flujo de caja.
 * Además del día fijo (1–31), admite "Último día hábil" — el sueldo cae el
 * último día de lunes a viernes del mes (se recalcula mes a mes).
 */
export default function PaydaySelect({ userId, payday: initPayday, lastBusinessDay: initLastBusinessDay }: Props) {
  const supabase = createClient()
  const [isPending, startTransition] = useTransition()
  const [payday, setPayday] = useState<number | null>(initPayday)
  const [lastBusinessDay, setLastBusinessDay] = useState(!!initLastBusinessDay)
  const [saved, setSaved]   = useState(false)

  const save = (day: number | null, lbd: boolean) => {
    setPayday(day)
    setLastBusinessDay(lbd)
    setSaved(false)
    startTransition(async () => {
      await supabase.from('profiles')
        .update({ payday: day, payday_last_business_day: lbd })
        .eq('id', userId)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  // Días típicos de pago en Chile
  const QUICK_DAYS = [1, 5, 15, 25, 28, 30]

  return (
    <div className="card p-4">
      <div className="flex items-center gap-4">
        <div className="cat-icon-bg w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ '--cat-bg': '#E6FAF3', '--cat-color': '#1FBE8D' } as React.CSSProperties}>
          <CalendarDays className="w-5 h-5" style={{ color: '#1FBE8D' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Día de sueldo</p>
            {saved && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold" style={{ color: 'var(--mint)' }}>
                <Check className="w-3 h-3" /> Guardado
              </span>
            )}
          </div>
          <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--ink-3)' }}>
            {lastBusinessDay
              ? 'Cada último día hábil del mes. Verás la cuenta regresiva en tu inicio.'
              : payday
                ? `Cada ${payday} del mes. Verás la cuenta regresiva en tu inicio.`
                : 'Cuéntanos qué día te pagan y te mostramos cuánto falta.'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap mt-3 pl-[56px]">
        {QUICK_DAYS.map(d => (
          <button
            key={d}
            type="button"
            onClick={() => save(d, false)}
            disabled={isPending}
            className="px-2.5 py-1 rounded-full text-[11px] font-bold transition-all active:scale-95"
            style={!lastBusinessDay && payday === d
              ? { background: 'var(--primary)', color: 'var(--primary-ink)' }
              : { background: 'var(--surface-2)', color: 'var(--ink-3)' }}
          >
            {d}
          </button>
        ))}
        <button
          type="button"
          onClick={() => save(null, true)}
          disabled={isPending}
          className="px-2.5 py-1 rounded-full text-[11px] font-bold transition-all active:scale-95"
          style={lastBusinessDay
            ? { background: 'var(--primary)', color: 'var(--primary-ink)' }
            : { background: 'var(--surface-2)', color: 'var(--ink-3)' }}
        >
          Último hábil
        </button>
        {/* Día custom */}
        <input
          type="number"
          min={1}
          max={31}
          placeholder="Otro"
          defaultValue={payday !== null && !QUICK_DAYS.includes(payday) ? payday : undefined}
          onBlur={e => {
            const v = parseInt(e.target.value)
            if (!isNaN(v) && v >= 1 && v <= 31 && (v !== payday || lastBusinessDay)) save(v, false)
          }}
          className="w-14 px-2 py-1 rounded-full text-[11px] font-bold text-center border-0 outline-none"
          style={{ background: 'var(--surface-2)', color: 'var(--ink-2)' }}
        />
        {(payday !== null || lastBusinessDay) && (
          <button
            type="button"
            onClick={() => save(null, false)}
            disabled={isPending}
            className="px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all"
            style={{ color: 'var(--coral)' }}
          >
            Quitar
          </button>
        )}
      </div>
    </div>
  )
}
