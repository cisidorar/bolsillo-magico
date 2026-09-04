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
function monthOf(dateStr: string): string {
  return dateStr.slice(0, 7)
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
