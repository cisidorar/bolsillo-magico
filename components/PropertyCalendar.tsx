'use client'

// ── Calendario de vencimientos de la propiedad (sep 2026) ──────────────────
// Mismo patrón visual que CalendarioPagos (/recurrentes): grilla de mes,
// click en un día con cargos abre el detalle. La diferencia es la fuente y
// el color: acá los puntos no son "un ítem más" sino la severidad real del
// cobro (chargeStatus), porque a diferencia de un gasto recurrente, un cobro
// de la propiedad puede estar vencido — y eso es justamente lo que Cas pidió
// poder ver de un vistazo.
//
// Solo 4 tipos: arriendo, luz, agua y aseo — los que pidió Cas explícitamente
// ("si hay derechos de aseo" cubre el caso en que la propiedad no los separa,
// donde simplemente no hay filas de kind='aseo' y el calendario no las
// muestra, sin lógica especial). Dividendo/contribuciones no entran: ya
// tienen su propia tarjeta (MortgageCard) y no fueron parte del pedido.

import { useState } from 'react'
import { ChevronLeft, ChevronRight, X, CalendarDays } from 'lucide-react'
import { formatCLP, monthName } from '@/lib/utils'
import { chargeStatus, chargeTotal, daysBetween, KIND_LABEL, type ChargeStatus } from '@/lib/property-charges'
import type { Charge } from './PropertyManager'

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

const CALENDAR_KINDS = new Set(['rent', 'electricity', 'water', 'aseo'])

const STATUS_DOT: Record<ChargeStatus, string> = {
  paid:     'var(--mint)',
  partial:  'var(--gold)',
  overdue:  'var(--coral)',
  due_soon: 'var(--gold)',
  pending:  'var(--ink-3)',
}

const STATUS_LABEL: Record<ChargeStatus, string> = {
  paid: 'Pagado', partial: 'Parcial', overdue: 'Vencido', due_soon: 'Por vencer', pending: 'Pendiente',
}

function startOffset(year: number, month: number): number {
  return (new Date(year, month - 1, 1).getDay() + 6) % 7
}

function fmtDate(d: string): string {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function relativeDue(dueDate: string, today: string): string {
  const days = daysBetween(today, dueDate)
  if (days === 0)  return 'vence hoy'
  if (days === 1)  return 'vence mañana'
  if (days > 1)    return `en ${days} días`
  if (days === -1) return 'venció ayer'
  return `hace ${Math.abs(days)} días`
}

interface Props {
  charges: Charge[]
  today: string
}

export default function PropertyCalendar({ charges, today }: Props) {
  const [todayY, todayM, todayD] = today.split('-').map(Number)
  const [month, setMonth] = useState(todayM)
  const [year,  setYear]  = useState(todayY)
  const [selectedDay, setSelectedDay] = useState<number | null>(null)

  const items = charges.filter(c => CALENDAR_KINDS.has(c.kind))

  const daysInMonth = new Date(year, month, 0).getDate()
  const offset       = startOffset(year, month)
  const todayNum      = (year === todayY && month === todayM) ? todayD : null

  const byDay: Record<number, Charge[]> = {}
  for (const c of items) {
    const [cy, cm, cd] = c.due_date.split('-').map(Number)
    if (cy !== year || cm !== month) continue
    if (!byDay[cd]) byDay[cd] = []
    byDay[cd].push(c)
  }

  function navigate(delta: number) {
    let m = month + delta, y = year
    if (m < 1)  { m = 12; y-- }
    if (m > 12) { m = 1;  y++ }
    setMonth(m); setYear(y); setSelectedDay(null)
  }

  const selectedItems = selectedDay ? (byDay[selectedDay] ?? []) : []
  const selectedTotal = selectedItems.reduce((s, c) => s + chargeTotal(c), 0)

  const totalCells = offset + daysInMonth
  const trailing    = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7)
  const monthTotal  = Object.values(byDay).flat().reduce((s, c) => s + chargeTotal(c), 0)

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 px-4 pt-4 pb-1">
        <CalendarDays className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ink-3)' }} />
        <h3 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Calendario de vencimientos</h3>
      </div>
      <p className="px-4 pb-3 text-xs" style={{ color: 'var(--ink-3)' }}>
        Arriendo, luz, agua y aseo — cuándo vence cada uno.
      </p>

      {/* Nav de mes */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-b" style={{ borderColor: 'var(--border)' }}>
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 rounded-lg hover:bg-[var(--surface-2)] transition-colors"
          style={{ color: 'var(--primary)' }}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <p className="text-sm font-bold capitalize" style={{ color: 'var(--ink)' }}>
          {monthName(month)} {year}
        </p>
        <button
          onClick={() => navigate(1)}
          className="p-1.5 rounded-lg hover:bg-[var(--surface-2)] transition-colors"
          style={{ color: 'var(--primary)' }}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Cabecera días de semana */}
      <div className="grid grid-cols-7 border-b" style={{ borderColor: 'var(--border)' }}>
        {WEEKDAYS.map(d => (
          <div key={d} className="py-2 text-center text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>
            {d}
          </div>
        ))}
      </div>

      {/* Celdas de días */}
      <div className="grid grid-cols-7">
        {Array.from({ length: offset }).map((_, i) => (
          <div key={`e-${i}`} className="min-h-[64px] border-b border-r" style={{ borderColor: 'var(--border)' }} />
        ))}

        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
          const dayItems   = byDay[day] ?? []
          const isToday    = day === todayNum
          const isSelected = day === selectedDay
          const hasItems   = dayItems.length > 0
          const dayTotal   = dayItems.reduce((s, c) => s + chargeTotal(c), 0)

          return (
            <button
              key={day}
              onClick={() => hasItems && setSelectedDay(isSelected ? null : day)}
              disabled={!hasItems}
              className={[
                'min-h-[64px] p-1.5 flex flex-col items-center gap-1 border-b border-r transition-colors w-full',
                hasItems ? 'cursor-pointer hover:brightness-95' : 'cursor-default',
              ].join(' ')}
              style={{ borderColor: 'var(--border)', background: isSelected ? 'var(--primary-soft)' : 'transparent' }}
            >
              <span
                className="w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold leading-none flex-shrink-0"
                style={{
                  background: isToday ? 'var(--primary)' : 'transparent',
                  color: isToday ? 'var(--primary-ink)' : 'var(--ink-2)',
                }}
              >
                {day}
              </span>

              {hasItems && (
                <div className="flex flex-wrap gap-0.5 justify-center">
                  {dayItems.slice(0, 4).map(c => (
                    <span
                      key={c.id}
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: STATUS_DOT[chargeStatus(c, today)] }}
                    />
                  ))}
                </div>
              )}

              {hasItems && (
                <span className="text-[9px] font-semibold tabular-nums leading-none whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>
                  {formatCLP(dayTotal)}
                </span>
              )}
            </button>
          )
        })}

        {Array.from({ length: trailing }).map((_, i) => (
          <div key={`t-${i}`} className="min-h-[64px] border-b" style={{ borderColor: 'var(--border)' }} />
        ))}
      </div>

      {/* Leyenda */}
      <div className="flex items-center flex-wrap gap-x-4 gap-y-1.5 px-4 py-2.5 border-t" style={{ borderColor: 'var(--border)' }}>
        <Legend color={STATUS_DOT.overdue} label="Vencido" />
        <Legend color={STATUS_DOT.due_soon} label="Por vencer" />
        <Legend color={STATUS_DOT.paid} label="Pagado" />
      </div>

      {/* Total del mes */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
        <span className="text-xs font-semibold capitalize" style={{ color: 'var(--ink-3)' }}>
          Vencimientos de {monthName(month)}
        </span>
        <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
          {formatCLP(monthTotal)}
        </span>
      </div>

      {/* Detalle del día seleccionado */}
      {selectedDay && selectedItems.length > 0 && (
        <div className="border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ background: 'var(--primary-soft)' }}>
            <div>
              <p className="text-xs font-bold capitalize" style={{ color: 'var(--primary)' }}>
                {new Date(year, month - 1, selectedDay).toLocaleDateString('es-CL', {
                  weekday: 'long', day: 'numeric', month: 'long',
                })}
              </p>
              <p className="text-xs font-medium mt-0.5" style={{ color: 'var(--ink-3)' }}>
                {selectedItems.length} {selectedItems.length !== 1 ? 'vencimientos' : 'vencimiento'} · {formatCLP(selectedTotal)}
              </p>
            </div>
            <button
              onClick={() => setSelectedDay(null)}
              className="p-1.5 rounded-lg hover:bg-[var(--surface)] transition-colors flex-shrink-0"
              style={{ color: 'var(--ink-3)' }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {selectedItems.map(c => {
              const status = chargeStatus(c, today)
              return (
                <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: STATUS_DOT[status] }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>
                      {KIND_LABEL[c.kind] ?? c.kind}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
                      {c.paid_date ? `pagado ${fmtDate(c.paid_date)}` : `${STATUS_LABEL[status]} · ${relativeDue(c.due_date, today)}`}
                    </p>
                  </div>
                  <p className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: c.direction === 'in' ? 'var(--mint)' : 'var(--ink)' }}>
                    {c.direction === 'in' ? '+' : ''}{formatCLP(chargeTotal(c))}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {items.length === 0 && (
        <p className="px-4 py-8 text-center text-sm" style={{ color: 'var(--ink-3)' }}>
          Sin vencimientos de arriendo, luz, agua o aseo todavía.
        </p>
      )}
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
      <span className="text-[11px] font-medium" style={{ color: 'var(--ink-3)' }}>{label}</span>
    </div>
  )
}
