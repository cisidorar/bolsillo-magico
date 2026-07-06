'use client'

import { useState, useTransition } from 'react'
import { CalendarDays, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  userId:    string
  weekStart: string // 'monday' | 'sunday'
}

/**
 * Primer día de la semana en vistas tipo calendario (hoy: CalendarioPagos en
 * Gastos recurrentes). Persiste en profiles.week_start.
 */
export default function WeekStartToggle({ userId, weekStart: initWeekStart }: Props) {
  const supabase = createClient()
  const [isPending, startTransition] = useTransition()
  const [weekStart, setWeekStart] = useState(initWeekStart)
  const [saved, setSaved] = useState(false)

  const save = (next: string) => {
    setWeekStart(next)
    setSaved(false)
    startTransition(async () => {
      await supabase.from('profiles').update({ week_start: next }).eq('id', userId)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  return (
    <div className="card p-4">
      <div className="flex items-center gap-4">
        <div className="cat-icon-bg w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ '--cat-bg': '#F0FDFA', '--cat-color': '#0D9488' } as React.CSSProperties}>
          <CalendarDays className="w-5 h-5" style={{ color: '#0D9488' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Inicio de semana</p>
            {saved && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold" style={{ color: 'var(--mint)' }}>
                <Check className="w-3 h-3" /> Guardado
              </span>
            )}
          </div>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>Primer día en tus vistas semanales.</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 mt-3 pl-[56px]">
        <button
          type="button"
          onClick={() => save('monday')}
          disabled={isPending}
          className="flex-1 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all active:scale-95"
          style={weekStart === 'monday'
            ? { background: 'var(--primary)', color: 'var(--primary-ink)' }
            : { background: 'var(--surface-2)', color: 'var(--ink-3)' }}
        >
          Lunes
        </button>
        <button
          type="button"
          onClick={() => save('sunday')}
          disabled={isPending}
          className="flex-1 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all active:scale-95"
          style={weekStart === 'sunday'
            ? { background: 'var(--primary)', color: 'var(--primary-ink)' }
            : { background: 'var(--surface-2)', color: 'var(--ink-3)' }}
        >
          Domingo
        </button>
      </div>
    </div>
  )
}
