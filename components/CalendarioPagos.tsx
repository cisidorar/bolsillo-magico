'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { formatCLP, monthName } from '@/lib/utils'
import ServiceLogo from './ServiceLogo'

export interface RecurringWithRelations {
  id: string
  name: string
  amount: number
  billing_day: number
  is_active: boolean
  domain: string | null
  total_installments: number | null
  paid_installments: number
  category: { name: string; color: string; bg_color: string } | null
  payment_method: { name: string } | null
}

interface Props {
  items: RecurringWithRelations[]
}

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

/** Día del mes en que cae un recurrente, clampado al último día del mes */
function effectiveDay(billingDay: number, year: number, month: number): number {
  const lastDay = new Date(year, month, 0).getDate()
  return Math.min(billingDay, lastDay)
}

/** Offset de columna para el primer día del mes (Lunes = 0) */
function startOffset(year: number, month: number): number {
  const dow = new Date(year, month - 1, 1).getDay() // 0=Dom
  return (dow + 6) % 7 // Lunes=0 … Dom=6
}

export default function CalendarioPagos({ items }: Props) {
  const now   = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year,  setYear]  = useState(now.getFullYear())
  const [selectedDay, setSelectedDay] = useState<number | null>(null)

  const activeItems = items.filter(r => r.is_active)
  const daysInMonth = new Date(year, month, 0).getDate()
  const offset      = startOffset(year, month)
  const today       = now.getMonth() + 1 === month && now.getFullYear() === year ? now.getDate() : null

  // Agrupar recurrentes por día efectivo
  const byDay: Record<number, RecurringWithRelations[]> = {}
  for (const item of activeItems) {
    const d = effectiveDay(item.billing_day, year, month)
    if (!byDay[d]) byDay[d] = []
    byDay[d].push(item)
  }

  function navigate(delta: number) {
    let m = month + delta
    let y = year
    if (m < 1)  { m = 12; y-- }
    if (m > 12) { m = 1;  y++ }
    setMonth(m); setYear(y); setSelectedDay(null)
  }

  const selectedItems = selectedDay ? (byDay[selectedDay] ?? []) : []
  const selectedTotal = selectedItems.reduce((s, r) => s + r.amount, 0)

  // Total mensual del mes mostrado
  const monthTotal = activeItems.reduce((s, r) => s + r.amount, 0)

  return (
    <div className="space-y-4">

      {/* Nav de mes + total */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 rounded-lg text-brand-600 hover:bg-brand-50 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="text-center">
          <p className="text-sm font-bold text-brand-900 capitalize">
            {monthName(month)} {year !== now.getFullYear() ? year : ''}
          </p>
          <p className="text-xs text-gray-400 font-medium">{formatCLP(monthTotal)} / mes</p>
        </div>
        <button
          onClick={() => navigate(1)}
          className="p-1.5 rounded-lg text-brand-600 hover:bg-brand-50 transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Grid del calendario */}
      <div className="card overflow-hidden">

        {/* Cabecera días de semana */}
        <div className="grid grid-cols-7 border-b border-gray-100">
          {WEEKDAYS.map(d => (
            <div key={d} className="py-2.5 text-center text-[11px] font-bold text-gray-400 uppercase tracking-wide">
              {d}
            </div>
          ))}
        </div>

        {/* Celdas de días */}
        <div className="grid grid-cols-7">
          {/* Celdas vacías de offset */}
          {Array.from({ length: offset }).map((_, i) => (
            <div key={`empty-${i}`} className="min-h-[84px] border-b border-r border-gray-50" />
          ))}

          {/* Días del mes */}
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
            const dayItems  = byDay[day] ?? []
            const isToday   = day === today
            const isSelected = day === selectedDay
            const hasItems  = dayItems.length > 0
            const dayTotal  = dayItems.reduce((s, r) => s + r.amount, 0)
            const col       = (offset + day - 1) % 7
            const isLastCol = col === 6

            return (
              <button
                key={day}
                onClick={() => hasItems && setSelectedDay(isSelected ? null : day)}
                disabled={!hasItems}
                className={[
                  'min-h-[84px] p-1.5 flex flex-col items-center gap-1 border-b transition-colors text-left w-full',
                  isLastCol ? 'border-r-0' : 'border-r border-gray-50',
                  'border-gray-50',
                  isSelected ? 'bg-brand-50' : hasItems ? 'hover:bg-gray-50/80 active:bg-gray-100 cursor-pointer' : 'cursor-default',
                ].join(' ')}
              >
                {/* Número del día */}
                <span className={[
                  'w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold leading-none flex-shrink-0',
                  isToday   ? 'bg-brand-600 text-white' : 'text-gray-700',
                  isSelected && !isToday ? 'text-brand-700' : '',
                ].join(' ')}>
                  {day}
                </span>

                {/* Logos de servicios (máx 3 + badge de excedente) */}
                {hasItems && (
                  <div className="flex flex-wrap gap-0.5 justify-center">
                    {dayItems.slice(0, 3).map(item => (
                      <ServiceLogo
                        key={item.id}
                        domain={item.domain}
                        name={item.name}
                        size={22}
                        className="rounded-md"
                      />
                    ))}
                    {dayItems.length > 3 && (
                      <span className="w-[22px] h-[22px] rounded-md bg-gray-200 text-[9px] font-bold text-gray-500 flex items-center justify-center flex-shrink-0">
                        +{dayItems.length - 3}
                      </span>
                    )}
                  </div>
                )}

                {/* Total del día */}
                {hasItems && (
                  <span className="text-[9px] font-semibold text-gray-500 tabular-nums leading-none">
                    {dayTotal >= 1000000
                      ? `$${(dayTotal / 1000000).toFixed(1)}M`
                      : dayTotal >= 1000
                        ? `$${Math.round(dayTotal / 1000)}k`
                        : `$${dayTotal}`
                    }
                  </span>
                )}
              </button>
            )
          })}

          {/* Celdas de relleno al final para completar la última fila */}
          {(() => {
            const totalCells = offset + daysInMonth
            const remainder  = totalCells % 7
            const trailing   = remainder === 0 ? 0 : 7 - remainder
            return Array.from({ length: trailing }).map((_, i) => (
              <div key={`trail-${i}`} className="min-h-[84px] border-b border-gray-50" />
            ))
          })()}
        </div>
      </div>

      {/* Panel de detalle del día seleccionado */}
      {selectedDay && selectedItems.length > 0 && (
        <div className="card overflow-hidden">
          {/* Header del panel */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-brand-50/60">
            <div>
              <p className="text-xs font-bold text-brand-700 capitalize">
                {new Date(year, month - 1, selectedDay).toLocaleDateString('es-CL', {
                  weekday: 'long', day: 'numeric', month: 'long'
                })}
              </p>
              <p className="text-xs text-gray-500 font-medium mt-0.5">
                {selectedItems.length} pago{selectedItems.length !== 1 ? 's' : ''} · {formatCLP(selectedTotal)}
              </p>
            </div>
            <button
              onClick={() => setSelectedDay(null)}
              className="p-1.5 rounded-lg hover:bg-brand-100 transition-colors text-gray-400"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Lista de pagos del día */}
          <div className="divide-y divide-gray-50">
            {selectedItems.map(item => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3.5">
                <ServiceLogo domain={item.domain} name={item.name} size={36} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{item.name}</p>
                  <p className="text-xs text-gray-400">
                    {item.category?.name ?? '–'}
                    {item.payment_method ? ` · ${item.payment_method.name}` : ''}
                    {item.total_installments
                      ? ` · cuota ${item.paid_installments + 1}/${item.total_installments}`
                      : ''}
                  </p>
                </div>
                <p className="text-sm font-bold text-gray-900 tabular-nums flex-shrink-0">
                  {formatCLP(item.amount)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Estado vacío */}
      {activeItems.length === 0 && (
        <div className="card text-center py-12 text-sm text-gray-400 font-medium">
          No tienes gastos recurrentes activos
        </div>
      )}
    </div>
  )
}
