import { daysBetween } from './utils'

// ── F8: Calendario de flujo de caja (próximos 30 días) ───────────────────
// Cruza sueldo (payday), vencimientos de tarjeta de crédito (billing_day +
// payment_due_day) y próximos cargos recurrentes en una sola línea de
// tiempo, con el flujo neto acumulado. NO es el saldo bancario real — es el
// neto de los eventos conocidos, partiendo de 0 desde hoy. Previene el
// sobregiro por *timing* (plata que "existe" en el mes pero no el día que
// se necesita).

export type CashFlowEventType = 'income' | 'recurring' | 'card'

export interface CashFlowEvent {
  date: string                 // YYYY-MM-DD
  type: CashFlowEventType
  label: string
  sublabel?: string
  amount: number                // positivo = entrada (sueldo), negativo = salida
  domain?: string | null
}

export interface CashFlowEventWithBalance extends CashFlowEvent {
  daysUntil: number
  runningBalance: number
}

/**
 * Ordena eventos por fecha (y por tipo — ingresos antes que salidas el mismo
 * día, así el saldo acumulado no muestra un mínimo artificial) y calcula el
 * flujo neto acumulado desde hoy.
 */
export function buildCashFlowTimeline(
  events: CashFlowEvent[],
  todayStr: string
): CashFlowEventWithBalance[] {
  const sorted = [...events].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1
    // mismo día: entradas primero
    if (a.amount >= 0 && b.amount < 0) return -1
    if (a.amount < 0 && b.amount >= 0) return 1
    return 0
  })

  let running = 0
  return sorted.map(e => {
    running += e.amount
    return { ...e, daysUntil: daysBetween(todayStr, e.date), runningBalance: running }
  })
}

/** Filtra eventos a la ventana [0, windowDays] días desde hoy (inclusive). */
export function withinWindow(
  events: CashFlowEventWithBalance[],
  windowDays: number
): CashFlowEventWithBalance[] {
  return events.filter(e => e.daysUntil >= 0 && e.daysUntil <= windowDays)
}
