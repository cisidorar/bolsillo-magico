// ── Compartidos fase 2: ¿me alcanza para este viaje? ────────────────────────
// Aritmética pura de la tarjeta "Plan del viaje": presupuesto estimado, tu
// parte, cuánto te falta y si tu ahorro mensual llega a tiempo.

import { monthsUntil } from './savings-goals'
import type { TripCategory } from './shared-split'

export type TripBudget = Partial<Record<TripCategory, number>>

export function budgetTotal(b: TripBudget): number {
  return Object.values(b).reduce<number>((s, v) => s + (v ?? 0), 0)
}

/**
 * Tu parte del presupuesto. `myFraction` = tu porción del reparto (0..1) si se
 * conoce (según sueldo con todos dentro); si no, parejo entre `people`.
 */
export function myBudgetShare(total: number, people: number, myFraction: number | null): number {
  if (total <= 0) return 0
  if (myFraction != null && myFraction > 0 && myFraction <= 1) return Math.round(total * myFraction)
  return Math.ceil(total / Math.max(1, people))
}

/**
 * Lo que puedes ahorrar al mes: promedio de (ingreso − gasto) en los meses
 * cerrados con ingreso registrado. null si no hay ninguno.
 */
export function monthlyCapacity(months: { income: number; spent: number }[]): number | null {
  const xs = months.filter(m => m.income > 0)
  if (xs.length === 0) return null
  return Math.round(xs.reduce((s, m) => s + (m.income - m.spent), 0) / xs.length)
}

export type TripVerdict = 'ready' | 'yes' | 'tight' | 'no' | 'unknown'

export interface TripAffordability {
  verdict:      TripVerdict
  /** Lo que todavía tienes que juntar */
  remaining:    number
  /** Meses de aporte hasta la salida (null sin fecha) */
  months:       number | null
  /** Aporte mensual necesario para llegar a la salida (null sin fecha) */
  perMonth:     number | null
  /** Con tu capacidad actual, en cuántos meses lo juntas (null si no hay capacidad) */
  monthsToSave: number | null
}

/**
 * - ready:   ya está cubierto (pagado + ahorrado ≥ tu parte).
 * - yes:     el aporte mensual cabe en ≤ 70% de lo que ahorras.
 * - tight:   cabe, pero se come más del 70% de tu ahorro.
 * - no:      no cabe a tiempo (o no estás ahorrando).
 * - unknown: no hay ingresos registrados para saberlo.
 * Sin fecha de salida se evalúa contra 6 meses (horizonte típico de planificación)
 * y `monthsToSave` dice cuándo podrías ir.
 */
export function tripAffordability(input: {
  myShare:  number
  covered:  number
  capacity: number | null
  startDate: string | null
  today:    string
}): TripAffordability {
  const remaining = Math.max(0, input.myShare - input.covered)
  const months = monthsUntil(input.startDate, input.today)
  const perMonth = months == null ? null : months <= 0 ? remaining : Math.ceil(remaining / months)
  const cap = input.capacity
  const monthsToSave = cap != null && cap > 0 ? Math.ceil(remaining / cap) : null
  if (input.myShare > 0 && remaining === 0) return { verdict: 'ready', remaining, months, perMonth, monthsToSave: 0 }
  if (cap == null) return { verdict: 'unknown', remaining, months, perMonth, monthsToSave }
  const need = perMonth ?? Math.ceil(remaining / 6)
  let verdict: TripVerdict
  if (cap <= 0) verdict = 'no'
  else if (need <= cap * 0.7) verdict = 'yes'
  else if (need <= cap) verdict = 'tight'
  else verdict = 'no'
  return { verdict, remaining, months, perMonth, monthsToSave }
}
