// ── Resumen de la propiedad: la banda de 4 stats del Estado ─────────────────
//
// Todo derivado de los cobros, nada almacenado — misma razón que
// property-charges.ts: estos números dependen de qué día es hoy, así que
// guardarlos sería guardar una mentira con fecha de vencimiento.

import {
  chargeStatus, chargeTotal, chargeOutstanding, type ChargeLike,
} from './property-charges'

export interface SummaryCharge extends ChargeLike {
  kind?: string
}

export interface PropertySummary {
  /** Arriendo impago acumulado — plata que te deben, no deuda tuya. */
  toReceive:      number
  toReceiveCount: number
  /** Cuentas del mes en curso que te toca pagar a ti, sin contar el dividendo. */
  ownerBills:      number
  ownerBillsCount: number
  /** Cuánto de esas cuentas sigue sin pagarse. */
  ownerBillsUnpaid: number
  /**
   * Arriendo − dividendo − cuentas tuyas del mes.
   *
   * null cuando falta el arriendo o el dividendo: un margen calculado sobre la
   * mitad de los datos es peor que no mostrar nada, porque parece un número
   * real. Con contrato pero sin dividendo cargado daría "+$335.000" y sugeriría
   * una ganancia que no existe.
   */
  margin: number | null
}

/** ¿A qué mes pertenece esta fecha YYYY-MM-DD? Devuelve 'YYYY-MM'. */
export function monthOf(dateStr: string): string {
  return dateStr.slice(0, 7)
}

// ── Chips de mes de Estado (sep 2026, iteración inspirada en mockup de Cas) ──
// "itera y aplica a toggle estado" — reemplaza la banda de 4 stats (Arriendo
// mensual/Dividendo ya viven en la pestaña Información) por un navegador de
// meses recientes + una sola lista unificada por mes, en vez de repartir
// "Cuentas del mes"/"Del arrendatario"/"Cobros pendientes" en tarjetas
// separadas que solo miraban el mes en curso.

export type MonthStatus = 'closed' | 'due' | 'overdue' | 'upcoming'

export interface MonthSummary {
  key:          string   // 'YYYY-MM'
  status:       MonthStatus
  pendingCount: number
  overdueCount: number
}

/**
 * Estado de un mes puntual — para los chips de navegación.
 *
 * 'overdue' manda sobre todo lo demás: un mes con algo vencido no puede
 * llamarse "cerrado" aunque sea de hace tres trimestres. 'closed' = no queda
 * nada pendiente (incluye meses sin ningún cobro generado — no hay nada que
 * deba preocupar). 'due' es un mes pasado o el actual con pendientes que
 * todavía no vencen. 'upcoming' es un mes futuro (recordatorio estimado
 * generado con anticipación, ver generateUtilityReminders).
 */
export function monthSummary(charges: SummaryCharge[], monthKey: string, todayStr: string): MonthSummary {
  const inMonth = charges.filter(c => monthOf(c.due_date) === monthKey)
  let pendingCount = 0
  let overdueCount = 0
  for (const c of inMonth) {
    const status = chargeStatus(c, todayStr)
    if (status === 'paid') continue
    if (status === 'overdue' || status === 'partial') overdueCount++
    else pendingCount++
  }
  const status: MonthStatus =
    overdueCount > 0 ? 'overdue'
      : pendingCount === 0 ? 'closed'
      : monthKey <= monthOf(todayStr) ? 'due'
      : 'upcoming'
  return { key: monthKey, status, pendingCount, overdueCount }
}

/** Las últimas `count` claves de mes ('YYYY-MM'), terminando en el mes de hoy. */
export function recentMonthKeys(todayStr: string, count: number): string[] {
  const [y, m] = monthOf(todayStr).split('-').map(Number)
  const keys: string[] = []
  for (let i = count - 1; i >= 0; i--) {
    let year = y, month = m - i
    while (month < 1) { month += 12; year-- }
    keys.push(`${year}-${String(month).padStart(2, '0')}`)
  }
  return keys
}

/**
 * Los cuatro números de la banda superior.
 *
 * `rentAmount` y `mortgageAmount` vienen del contrato y de la propiedad, no de
 * los cobros: son el acuerdo vigente, mientras que los cobros son su ejecución
 * mes a mes. Un mes sin arriendo generado no significa que el arriendo sea 0.
 */
export function propertySummary(
  charges: SummaryCharge[],
  todayStr: string,
  rentAmount: number | null,
  mortgageAmount: number | null,
): PropertySummary {
  const thisMonth = monthOf(todayStr)

  let toReceive = 0
  let toReceiveCount = 0
  let ownerBills = 0
  let ownerBillsCount = 0
  let ownerBillsUnpaid = 0

  for (const c of charges) {
    const status = chargeStatus(c, todayStr)
    const settled = status === 'paid'

    // Por cobrar: arriendo (y cualquier entrada) vencido o abonado a medias.
    // No se limita al mes en curso a propósito — tres arriendos impagos de
    // meses distintos son una sola cifra, y partirla por mes la esconde.
    if (c.direction === 'in' && !settled && c.due_date <= todayStr) {
      toReceive += chargeOutstanding(c)
      toReceiveCount++
    }

    // Cuentas tuyas del mes: salidas del propietario, sin el dividendo (que
    // tiene su propia tarjeta) y sin lo del arrendatario (que no es costo tuyo).
    if (
      c.direction === 'out' &&
      c.responsible !== 'tenant' &&
      c.kind !== 'mortgage' &&
      monthOf(c.due_date) === thisMonth
    ) {
      ownerBills += chargeTotal(c)
      ownerBillsCount++
      if (!settled) ownerBillsUnpaid += chargeOutstanding(c)
    }
  }

  const margin =
    rentAmount != null && mortgageAmount != null
      ? rentAmount - mortgageAmount - ownerBills
      : null

  return { toReceive, toReceiveCount, ownerBills, ownerBillsCount, ownerBillsUnpaid, margin }
}

/** Cobros del mes en curso que te toca pagar a ti, dividendo incluido. */
export function monthBills<T extends SummaryCharge>(charges: T[], todayStr: string): T[] {
  const thisMonth = monthOf(todayStr)
  return charges
    .filter(c => c.direction === 'out' && c.responsible !== 'tenant' && monthOf(c.due_date) === thisMonth)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
}

/**
 * Cobros pendientes de cobrar: lo que entra y no ha llegado.
 *
 * Ordena por vencimiento ascendente — lo más viejo primero, porque es lo que
 * más recargo acumula y lo primero que hay que reclamar.
 */
export function pendingIncome<T extends SummaryCharge>(charges: T[], todayStr: string): T[] {
  return charges
    .filter(c => {
      if (c.direction !== 'in') return false
      const s = chargeStatus(c, todayStr)
      return s === 'overdue' || s === 'partial' || s === 'due_soon' || s === 'pending'
    })
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
}

/**
 * Cuentas tuyas vencidas, sin importar de qué mes son.
 *
 * `monthBills` solo mira el mes en curso — un derecho de aseo de abril que
 * nadie pagó se vuelve invisible en septiembre si nada más lo busca. Esta es
 * la lista que lo saca a la luz: mientras exista una fila acá, esa deuda
 * sigue viva aunque el calendario ya haya pasado tres trimestres de largo.
 *
 * Incluye el dividendo a propósito: uno atrasado es la peor sorpresa posible
 * y esconderlo porque tiene su propia tarjeta en la banda de stats sería el
 * mismo error que llevó a que estas dos cuentas de aseo pasaran cuatro meses
 * sin aparecer en ningún lado.
 */
export function overdueOwnerBills<T extends SummaryCharge>(charges: T[], todayStr: string): T[] {
  return charges
    .filter(c => {
      if (c.direction !== 'out' || c.responsible === 'tenant') return false
      const s = chargeStatus(c, todayStr)
      return s === 'overdue' || s === 'partial'
    })
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
}
