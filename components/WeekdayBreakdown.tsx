'use client'

import { useState } from 'react'
import { formatCLP } from '@/lib/utils'
import ExpenseRowIcon from '@/components/ExpenseRowIcon'
import type { ExpenseWithRelations } from '@/types'

const weekdayLabels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

interface DayBucket {
  total: number
  count: number
  items: ExpenseWithRelations[]
}

interface Props {
  expenses: ExpenseWithRelations[]
  monthLabel: string
}

/** "Cuándo gastas" — barra de distribución por día de semana (pedido de Cas,
 *  ago 2026: poder tocar un día, ej. Martes, y ver en qué gastó ese día).
 *  Toca una barra para expandir la lista de gastos de ese día de la semana
 *  (agregando todas las ocurrencias del mes, no solo un día puntual). */
export default function WeekdayBreakdown({ expenses, monthLabel }: Props) {
  const [selectedDow, setSelectedDow] = useState<number | null>(null)

  const byWeekday: DayBucket[] = Array.from({ length: 7 }, () => ({ total: 0, count: 0, items: [] }))
  expenses.forEach(e => {
    const d = new Date(e.date + 'T12:00:00')
    const dow = (d.getDay() + 6) % 7 // Lun=0, Dom=6
    byWeekday[dow].total += e.amount
    byWeekday[dow].count++
    byWeekday[dow].items.push(e)
  })
  const maxWeekday = Math.max(...byWeekday.map(d => d.total), 1)
  const peakDowIdx = byWeekday.reduce((maxIdx, d, i) => d.total > byWeekday[maxIdx].total ? i : maxIdx, 0)
  const weekendTotal = byWeekday[5].total + byWeekday[6].total
  const totalAll = byWeekday.reduce((s, d) => s + d.total, 0)
  const weekendPct = totalAll > 0 ? Math.round((weekendTotal / totalAll) * 100) : 0

  const activeDay = selectedDow !== null ? byWeekday[selectedDow] : null

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Cuándo gastas</p>
        <span className="text-xs" style={{ color: 'var(--ink-3)' }}>{monthLabel}</span>
      </div>
      <div className="flex items-end gap-2" style={{ height: 110 }}>
        {byWeekday.map((d, i) => {
          const h = d.total > 0 ? Math.max(Math.round((d.total / maxWeekday) * 74), 6) : 2
          const isPeak = i === peakDowIdx && d.total > 0
          const isSelected = i === selectedDow
          return (
            <button
              key={i}
              type="button"
              disabled={d.total === 0}
              onClick={() => setSelectedDow(selectedDow === i ? null : i)}
              className="flex-1 flex flex-col items-center justify-end gap-1 disabled:cursor-default"
            >
              <p className="text-[9px] font-bold tabular-nums whitespace-nowrap" style={{ color: isSelected || isPeak ? 'var(--primary)' : 'var(--ink-3)' }}>
                {d.total > 0 ? formatCLP(d.total) : ''}
              </p>
              <div
                className="w-full rounded-t-lg transition-opacity"
                style={{
                  height: h,
                  background: isSelected || isPeak ? 'var(--primary)' : d.total > 0 ? 'rgba(77,147,255,0.30)' : 'var(--border)',
                  opacity: selectedDow !== null && !isSelected ? 0.45 : 1,
                }}
              />
              <p className="text-[10px] font-semibold" style={{ color: isSelected || isPeak ? 'var(--primary)' : 'var(--ink-3)' }}>
                {weekdayLabels[i]}
              </p>
            </button>
          )
        })}
      </div>

      {byWeekday[peakDowIdx].total > 0 && (
        <p className="text-[11px] mt-3 px-1" style={{ color: 'var(--ink-3)' }}>
          Tu día fuerte es el <span className="font-bold" style={{ color: 'var(--ink-2)' }}>{weekdayLabels[peakDowIdx]}</span>
          {' '}({formatCLP(byWeekday[peakDowIdx].total)} en {byWeekday[peakDowIdx].count} gasto{byWeekday[peakDowIdx].count !== 1 ? 's' : ''}).
          {weekendPct >= 30 && <> El fin de semana se lleva el {weekendPct}% del mes.</>}
          {' '}Toca un día para ver el detalle.
        </p>
      )}

      {activeDay && activeDay.items.length > 0 && (
        <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="text-[11px] font-semibold mb-2" style={{ color: 'var(--ink-2)' }}>
            {weekdayLabels[selectedDow!]} · {formatCLP(activeDay.total)} en {activeDay.count} gasto{activeDay.count !== 1 ? 's' : ''}
          </p>
          <div className="space-y-1">
            {[...activeDay.items].sort((a, b) => b.amount - a.amount).map(e => (
              <div key={e.id} className="flex items-center gap-2.5 py-1.5">
                <ExpenseRowIcon description={e.description ?? null} categoryName={e.category?.name ?? null} size={28} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--ink)' }}>
                    {e.description || e.category?.name || '—'}
                  </p>
                  <div className="flex items-center gap-1.5">
                    {e.category && (
                      <span className="text-[10px] font-medium truncate" style={{ color: e.category.color }}>
                        {e.category.name}
                      </span>
                    )}
                    <span className="text-[10px]" style={{ color: 'var(--ink-3)' }}>
                      · {new Date(e.date + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                </div>
                <p className="text-[13px] font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--ink)' }}>
                  {formatCLP(e.amount)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
