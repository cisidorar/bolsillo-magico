import type { TripCategory } from './shared-split'

/** Subconjunto de SharedPlanItemRow que necesita el cálculo (testeable sin DB). */
export interface PlanLine {
  trip_category: TripCategory
  est_amount:    number
  kind:          'reserva' | 'durante'
  quantity:      number
  unit_amount:   number | null
  cap_amount:    number | null
  optional:      boolean
  enabled:       boolean
  paid_at:       string | null
}

export interface PlanTotals {
  /** Reservas pendientes de pagar (lo que hay que tener antes de salir) */
  before:   number
  /** Presupuesto de gasto durante el viaje */
  during:   number
  /** before + during */
  total:    number
  /** Total de opcionales apagados (lo que sumaría si los activas) */
  optionalOff: number
}

/** Un ítem cuenta en el plan si no es un opcional apagado. */
export function isActive(i: Pick<PlanLine, 'optional' | 'enabled'>): boolean {
  return !i.optional || i.enabled
}

export function planTotals(items: PlanLine[]): PlanTotals {
  let before = 0, during = 0, optionalOff = 0
  for (const i of items) {
    if (i.paid_at) continue
    if (!isActive(i)) { optionalOff += i.est_amount; continue }
    if (i.kind === 'reserva') before += i.est_amount
    else during += i.est_amount
  }
  return { before, during, total: before + during, optionalOff }
}

/** Por categoría: reservas pendientes + gasto durante, solo ítems activos. */
export function planByCategory(items: PlanLine[]): Partial<Record<TripCategory, { before: number; during: number }>> {
  const out: Partial<Record<TripCategory, { before: number; during: number }>> = {}
  for (const i of items) {
    if (i.paid_at || !isActive(i)) continue
    const c = out[i.trip_category] ?? { before: 0, during: 0 }
    if (i.kind === 'reserva') c.before += i.est_amount
    else c.during += i.est_amount
    out[i.trip_category] = c
  }
  return out
}

/**
 * Cuánto pasa del tope. 0 si no hay tope o el precio unitario está dentro.
 * El unitario es unit_amount, o el total si la cantidad es 1.
 */
export function overCap(i: Pick<PlanLine, 'est_amount' | 'quantity' | 'unit_amount' | 'cap_amount'>): number {
  if (!i.cap_amount) return 0
  const unit = i.unit_amount ?? Math.round(i.est_amount / Math.max(1, i.quantity))
  return Math.max(0, unit - i.cap_amount)
}

/** Etiqueta "4 × $100.000" para ítems con cantidad. */
export function qtyLabel(i: Pick<PlanLine, 'quantity' | 'unit_amount'>, fmt: (n: number) => string): string | null {
  return i.unit_amount && i.quantity > 1 ? `${i.quantity} × ${fmt(i.unit_amount)}` : null
}

/** Presupuesto diario de un ítem "durante" repartido en N días. */
export function perDay(amount: number, days: number): number {
  return days > 0 ? Math.ceil(amount / days) : amount
}
