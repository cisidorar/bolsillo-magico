'use client'

import { useState } from 'react'
import { formatCLP } from '@/lib/utils'
import { averageSalaries, GUEST_SALARY_SLOTS } from '@/lib/trip-guest'

/**
 * Agrega o edita a alguien sin cuenta. Escribes sus últimos sueldos líquidos
 * (hasta 6, los que recuerdes); solo se guarda el promedio.
 */
export default function TripGuestForm({
  initialName = '', initialIncome = null, myIncome = null, busy, onCancel, onSave,
}: {
  initialName?:   string
  initialIncome?: number | null
  /** Tu promedio, solo para mostrar el porcentaje resultante */
  myIncome?:      number | null
  busy:           boolean
  onCancel:       () => void
  onSave:         (name: string, income: number, months: number) => void | Promise<void>
}) {
  const [name, setName] = useState(initialName)
  const [salaries, setSalaries] = useState<string[]>(Array(GUEST_SALARY_SLOTS).fill(''))
  const [direct, setDirect] = useState(initialIncome ? String(initialIncome) : '')

  const calc = averageSalaries(salaries)
  const directNum = Number(direct.replace(/[^\d]/g, '')) || 0
  const income = calc ? calc.average : directNum
  const months = calc ? calc.months : 1
  const pct = myIncome && income > 0 ? Math.round((income / (myIncome + income)) * 1000) / 10 : null

  const inputStyle = { background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)' }
  const clean = (v: string) => v.replace(/[^\d]/g, '').slice(0, 9)

  return (
    <div className="mt-3 space-y-3">
      <input value={name} onChange={e => setName(e.target.value.slice(0, 40))} placeholder="Nombre (ej. Cami)"
        className="w-full px-3 py-2.5 text-sm rounded-lg border" style={inputStyle} />

      <div>
        <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--ink-2)' }}>Sus últimos sueldos líquidos</p>
        <div className="grid grid-cols-2 gap-2">
          {salaries.map((v, i) => (
            <input key={i} inputMode="numeric" value={v ? Number(v).toLocaleString('es-CL') : ''}
              onChange={e => setSalaries(s => s.map((x, j) => (j === i ? clean(e.target.value) : x)))}
              placeholder={`Mes ${i + 1}`} className="w-full px-3 py-2.5 text-sm rounded-lg border tabular-nums" style={inputStyle} />
          ))}
        </div>
        <p className="text-[11px] mt-1.5" style={{ color: 'var(--ink-3)' }}>
          Con 6 es más justo; si no los recuerda, pon los que tengas. Solo se guarda el promedio.
        </p>
      </div>

      {!calc && (
        <input inputMode="numeric" value={direct ? Number(direct).toLocaleString('es-CL') : ''}
          onChange={e => setDirect(clean(e.target.value))} placeholder="…o directamente su ingreso mensual"
          className="w-full px-3 py-2.5 text-sm rounded-lg border tabular-nums" style={inputStyle} />
      )}

      {income > 0 && (
        <p className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>
          Promedio {formatCLP(income)}{calc ? ` (${calc.months} ${calc.months === 1 ? 'mes' : 'meses'})` : ''}
          {pct != null && ` · le toca el ${pct.toLocaleString('es-CL')}%`}
        </p>
      )}

      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-2.5 text-xs font-semibold rounded-lg border"
          style={{ borderColor: 'var(--border)', color: 'var(--ink-2)', background: 'var(--surface)' }}>Cerrar</button>
        <button disabled={busy || !name.trim() || income <= 0} onClick={() => onSave(name.trim(), income, months)}
          className="flex-1 py-2.5 text-xs font-bold rounded-lg disabled:opacity-50"
          style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}>Guardar</button>
      </div>
    </div>
  )
}
