'use client'

import { useState, useTransition } from 'react'
import { CalendarDays, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ToastProvider'
import SettingChip from '@/components/SettingChip'

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
  const { showToast } = useToast()
  const [isPending, startTransition] = useTransition()
  const [payday, setPayday] = useState<number | null>(initPayday)
  const [lastBusinessDay, setLastBusinessDay] = useState(!!initLastBusinessDay)
  const [saved, setSaved]   = useState(false)

  const save = (day: number | null, lbd: boolean) => {
    const prev = { payday, lastBusinessDay }
    setPayday(day)
    setLastBusinessDay(lbd)
    setSaved(false)
    startTransition(async () => {
      const { error } = await supabase.from('profiles')
        .update({ payday: day, payday_last_business_day: lbd })
        .eq('id', userId)
      if (error) {
        setPayday(prev.payday)
        setLastBusinessDay(prev.lastBusinessDay)
        showToast('No se pudo guardar tu día de sueldo', {
          action: { label: 'Reintentar', onClick: () => save(day, lbd) },
        })
        return
      }
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
          style={{ '--cat-bg': 'var(--primary-soft)', '--cat-color': 'var(--primary)' } as React.CSSProperties}>
          <CalendarDays className="w-5 h-5" style={{ color: 'var(--primary)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Día de sueldo</p>
            {saved && (
              <span role="status" className="inline-flex items-center gap-1 text-[11px] font-bold" style={{ color: 'var(--mint-ink)' }}>
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
          <SettingChip key={d} active={!lastBusinessDay && payday === d} onClick={() => save(d, false)} disabled={isPending}>
            {d}
          </SettingChip>
        ))}
        <SettingChip active={lastBusinessDay} onClick={() => save(null, true)} disabled={isPending}>
          Último hábil
        </SettingChip>
        {/* Día custom */}
        <input
          type="number"
          min={1}
          max={31}
          placeholder="Otro"
          aria-label="Otro día de sueldo (1 a 31)"
          defaultValue={payday !== null && !QUICK_DAYS.includes(payday) ? payday : undefined}
          onBlur={e => {
            const v = parseInt(e.target.value)
            if (!isNaN(v) && v >= 1 && v <= 31 && (v !== payday || lastBusinessDay)) save(v, false)
          }}
          className="w-16 min-h-[44px] -my-1.5 px-2 rounded-full text-[11px] font-bold text-center border-0 outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
          style={{ background: 'var(--surface-2)', color: 'var(--ink-2)' }}
        />
        {(payday !== null || lastBusinessDay) && (
          <SettingChip tone="danger" onClick={() => save(null, false)} disabled={isPending}>
            Quitar
          </SettingChip>
        )}
      </div>
    </div>
  )
}
