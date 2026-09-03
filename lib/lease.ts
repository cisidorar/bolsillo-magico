// ── P2 (PLAN_PROPIEDAD): el contrato de arriendo ────────────────────────────
//
// Puro: sin Supabase, sin React, sin fetch. Todo lo que decide plata vive acá
// para poder testearlo — misma separación que lib/property-charges.ts.
//
// Las cuatro cláusulas que valen dinero y que nadie va a recordar solo:
//   1. reajuste por IPC cada N meses          → nextAdjustmentDate/computeAdjustedRent
//   2. multa por día de atraso                → lateFee
//   3. mora que habilita término del contrato → terminationRight
//   4. aviso previo mínimo para no renovar    → noticeDeadline

import { cumulativeInflationFactor, type IpcObservation } from './cl-indicators'
import { daysBetween } from './property-charges'

export interface LeaseLike {
  start_date:            string
  end_date:              string | null
  notice_days:           number
  rent_amount:           number
  rent_due_day:          number
  late_fee_per_day:      number | null
  termination_days:      number | null
  adjustment_kind:       'ipc' | 'uf' | 'none'
  adjustment_months:     number | null
  last_adjustment_date:  string | null
}

/** Suma `months` meses a un YYYY-MM-DD conservando el día (clamp a fin de mes). */
export function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const total = (y * 12 + (m - 1)) + months
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  // Día 31 en un mes de 30 cae al último día real, no se desborda al mes siguiente.
  const lastDay = new Date(ny, nm, 0).getDate()
  const nd = Math.min(d, lastDay)
  return `${ny}-${String(nm).padStart(2, '0')}-${String(nd).padStart(2, '0')}`
}

/**
 * Próxima fecha de reajuste: last_adjustment_date + adjustment_months.
 * null si el contrato no reajusta o le falta la base.
 */
export function nextAdjustmentDate(c: LeaseLike): string | null {
  if (c.adjustment_kind === 'none' || !c.adjustment_months) return null
  const base = c.last_adjustment_date ?? c.start_date
  return addMonths(base, c.adjustment_months)
}

export interface AdjustmentResult {
  /** Renta que correspondería cobrar tras el reajuste. */
  newRent:     number
  /** Diferencia contra la renta vigente (0 si no sube). */
  delta:       number
  /** % de IPC acumulado del período. */
  pctApplied:  number
  /** true si el IPC del período fue negativo y por eso la renta NO baja. */
  floored:     boolean
}

/**
 * Renta reajustada por el IPC acumulado entre la última fecha de reajuste y
 * `asOf`.
 *
 * El piso en cero es deliberado y viene del contrato: si el IPC acumulado del
 * semestre es negativo (deflación), la renta se mantiene, no baja. Sin este
 * piso el cálculo devolvería una renta menor a la vigente y le estaríamos
 * diciendo a Cas que cobre menos de lo que el contrato le permite.
 */
export function computeAdjustedRent(
  c: LeaseLike,
  ipcSeries: IpcObservation[],
  asOf: string,
): AdjustmentResult | null {
  if (c.adjustment_kind !== 'ipc' || !c.adjustment_months) return null
  const from = c.last_adjustment_date ?? c.start_date
  const factor = cumulativeInflationFactor(ipcSeries, from, asOf)
  const pct = (factor - 1) * 100

  if (factor <= 1) {
    return { newRent: c.rent_amount, delta: 0, pctApplied: pct, floored: true }
  }
  const newRent = Math.round(c.rent_amount * factor)
  return { newRent, delta: newRent - c.rent_amount, pctApplied: pct, floored: false }
}

/**
 * Multa por atraso: días de mora × tarifa diaria del contrato.
 *
 * Es exacta (a diferencia de la mora del aseo, que se estima): el contrato
 * fija un monto fijo por día, no una fórmula con intereses compuestos.
 * Devuelve 0 si el pago está al día o el contrato no fija multa.
 */
export function lateFee(c: LeaseLike, dueDate: string, paidOrToday: string): number {
  if (!c.late_fee_per_day) return 0
  const days = daysBetween(dueDate, paidOrToday)
  return days <= 0 ? 0 : days * c.late_fee_per_day
}

/**
 * ¿La mora ya da derecho a pedir el término del contrato?
 * Devuelve los días de atraso y si se cruzó el umbral.
 */
export function terminationRight(c: LeaseLike, dueDate: string, today: string): {
  daysLate: number; entitled: boolean; threshold: number | null
} {
  const daysLate = Math.max(0, daysBetween(dueDate, today))
  const threshold = c.termination_days ?? null
  return { daysLate, entitled: threshold !== null && daysLate >= threshold, threshold }
}

/**
 * Último día para avisar si no se quiere renovar: end_date − notice_days.
 * null en contratos indefinidos (no hay fecha que respetar).
 */
export function noticeDeadline(c: LeaseLike): string | null {
  if (!c.end_date) return null
  const [y, m, d] = c.end_date.split('-').map(Number)
  const dt = new Date(y, m - 1, d, 12)
  dt.setDate(dt.getDate() - c.notice_days)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

/** Vencimiento del arriendo del mes (YYYY-MM) según rent_due_day. */
export function rentDueDate(c: LeaseLike, year: number, month: number): string {
  const lastDay = new Date(year, month, 0).getDate()
  const day = Math.min(c.rent_due_day, lastDay)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * Meses (YYYY-MM) que el contrato debería tener generados entre su inicio y
 * `today`, inclusive del mes en curso. La generación de cobros itera sobre
 * esto y salta los que ya existen por external_ref — mismo patrón idempotente
 * que generateAseoCharges.
 */
export function rentPeriodsToGenerate(c: LeaseLike, today: string): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = []
  const [sy, sm] = c.start_date.split('-').map(Number)
  const [ty, tm] = today.split('-').map(Number)
  // Un contrato terminado no sigue generando arriendos.
  const end = c.end_date ? c.end_date.split('-').map(Number) : null
  let y = sy, m = sm
  while (y < ty || (y === ty && m <= tm)) {
    if (end && (y > end[0] || (y === end[0] && m > end[1]))) break
    out.push({ year: y, month: m })
    m++; if (m > 12) { m = 1; y++ }
  }
  return out
}

/** Ref idempotente de un arriendo mensual: 'rent-2026-09'. */
export function rentRef(year: number, month: number): string {
  return `rent-${year}-${String(month).padStart(2, '0')}`
}

/** Ref idempotente de un dividendo mensual: 'mortgage-2026-09'. */
export function mortgageRef(year: number, month: number): string {
  return `mortgage-${year}-${String(month).padStart(2, '0')}`
}
