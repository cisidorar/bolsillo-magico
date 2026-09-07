// ── Obligaciones de la propiedad en arriendo ────────────────────────────────
// El primitivo que la app no tenía: `expenses` solo sabe decir "pagué X el día
// D". Acá una obligación existe ANTES de pagarse, tiene vencimiento propio y
// acumula recargos mientras siga impaga. Eso es lo que permite responder
// "cuánta deuda llevo por no haber pagado el aseo".
//
// Todo derivado, nada almacenado: el estado de un cobro depende de qué día es
// hoy, así que guardarlo en la base sería guardar una mentira con fecha de
// vencimiento (misma lección que currentStatementRange vs lastClosedStatementRange).

/** Días antes del vencimiento en que un cobro pasa a "pronto" (umbral gold de UX5). */
export const DUE_SOON_DAYS = 3

/** Interés penal mensual de deudas municipales (Código Tributario art. 53). */
const MONTHLY_PENALTY_RATE = 0.015

export type ChargeStatus = 'paid' | 'partial' | 'overdue' | 'due_soon' | 'pending'

export type ChargeKind =
  | 'rent' | 'mortgage' | 'electricity' | 'water' | 'gas'
  | 'aseo' | 'contribuciones' | 'gastos_comunes'
  | 'repair' | 'deposit' | 'other'

export interface ChargeLike {
  kind?:          ChargeKind | string
  direction?:     'in' | 'out'
  due_date:       string          // YYYY-MM-DD
  amount:         number
  penalty?:       number
  inflation_adj?: number
  paid_date?:     string | null
  paid_amount?:   number | null
  responsible?:   'owner' | 'tenant'
  confirmed?:     boolean
  auto_debit?:    boolean
}

/** Total exigible: base + interés penal + reajuste. */
export function chargeTotal(c: ChargeLike): number {
  return c.amount + (c.penalty ?? 0) + (c.inflation_adj ?? 0)
}

/** Días enteros entre dos fechas YYYY-MM-DD (b - a). Mediodía para evitar saltos de zona horaria. */
export function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T12:00:00').getTime()
  const db = new Date(b + 'T12:00:00').getTime()
  return Math.round((db - da) / 86_400_000)
}

/**
 * Estado de un cobro al día `todayStr`.
 *
 * `partial` existe porque un arrendatario puede abonar parte de la renta: dar
 * eso por "pagado" esconde el saldo, y darlo por "impago" borra el abono.
 */
export function chargeStatus(c: ChargeLike, todayStr: string): ChargeStatus {
  if (c.paid_date) {
    const paid = c.paid_amount ?? chargeTotal(c)
    return paid >= chargeTotal(c) ? 'paid' : 'partial'
  }
  const daysLeft = daysBetween(todayStr, c.due_date)
  if (daysLeft < 0) return 'overdue'
  if (daysLeft <= DUE_SOON_DAYS) return 'due_soon'
  return 'pending'
}

/** Cuánto falta por pagar de un cobro (0 si está al día). */
export function chargeOutstanding(c: ChargeLike): number {
  if (!c.paid_date) return chargeTotal(c)
  return Math.max(0, chargeTotal(c) - (c.paid_amount ?? chargeTotal(c)))
}

/**
 * Estimación de recargos de una deuda municipal impaga.
 *
 * NO reproduce la fórmula oficial: las reglas de mes parcial y de reajuste de
 * Tesorería no se replican de memoria sin arriesgar un número que se ve
 * confiable y está malo. Devuelve un orden de magnitud, SIEMPRE rotulado como
 * estimado en la UI, para que se pueda decir "esto te está costando algo" sin
 * afirmar cuánto. La cifra verdadera entra a mano desde el giro de TGR.
 */
export function estimateArrears(
  base: number,
  dueDate: string,
  todayStr: string,
  monthlyInflationPct = 0,
): { penalty: number; inflationAdj: number; isEstimate: true } {
  const daysLate = daysBetween(dueDate, todayStr)
  if (daysLate <= 0) return { penalty: 0, inflationAdj: 0, isEstimate: true }

  const monthsLate = daysLate / 30
  return {
    penalty:     Math.round(base * MONTHLY_PENALTY_RATE * monthsLate),
    inflationAdj: Math.round(base * (monthlyInflationPct / 100) * monthsLate),
    isEstimate:  true,
  }
}

/**
 * Los 4 vencimientos de derechos de aseo de un año: 30 de abril, junio,
 * septiembre y noviembre. Calendario nacional fijado por TGR, no municipal —
 * sirve igual para cualquier comuna.
 */
export function aseoDueDates(year: number): string[] {
  return [4, 6, 9, 11].map(m => `${year}-${String(m).padStart(2, '0')}-30`)
}

/** Referencia provisoria de un giro de aseo, hasta que se conozca el folio real. */
export function aseoRef(year: number, quarter: number): string {
  return `aseo-${year}-Q${quarter}`
}

/**
 * Próximo vencimiento estimado de una cuenta de luz/agua, a partir del último
 * vencimiento real conocido.
 *
 * NO intenta adivinar el ciclo real de facturación de la distribuidora —
 * Cas fue explícita en que no conoce la fecha exacta de cada boleta. Es
 * "mismo día, un mes después" con el mes clamp-eado a su último día (31 de
 * enero → 28/29 de febrero), el mismo cálculo de mes calendario que ya usa
 * mortgage_due_day en generateLeaseCharges. Sirve solo como recordatorio con
 * fecha aproximada — se reemplaza por la fecha real en cuanto llega la boleta.
 */
export function nextUtilityDueDate(lastDueDate: string): string {
  const [y, m, d] = lastDueDate.split('-').map(Number)
  let ny = y, nm = m + 1
  if (nm > 12) { nm = 1; ny += 1 }
  const lastDay = new Date(ny, nm, 0).getDate()
  const day = Math.min(d, lastDay)
  return `${ny}-${String(nm).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Referencia del recordatorio automático de una cuenta de luz/agua (provisoria: se borra al llegar la boleta real). */
export function utilityReminderRef(kind: 'electricity' | 'water', year: number, month: number): string {
  return `est-${kind}-${year}-${String(month).padStart(2, '0')}`
}

/**
 * Referencia de idempotencia de una boleta REAL de luz/agua (sep 2026).
 *
 * Bug real: saveUtilityBill() guardaba acá el "N° de cliente" que el parser
 * lee del PDF (lib/utility-bill-parser.ts) — pero ese número identifica la
 * CUENTA con la distribuidora, no la boleta puntual: es EL MISMO en todas
 * las boletas de un mismo servicio, mes a mes (el propio parser lo dice:
 * viene del bloque PAC/PAT de pago automático). Como external_ref es único
 * por (user_id, property_id, kind), la segunda boleta real de cualquier
 * servicio SIEMPRE chocaba con la primera ("duplicate key value violates
 * unique constraint... external_ref_uniq"), reproducible al 100%.
 *
 * Esta referencia usa el período (año-mes de vencimiento) en vez del N° de
 * cliente — único por mes como corresponde, y de paso hace que volver a
 * subir la boleta del MISMO mes (ej. una corregida) actualice la fila en vez
 * de fallar. El N° de cliente/boleta que el usuario ve y puede editar sigue
 * guardándose, pero como dato informativo en `notes`, no como llave.
 */
export function billChargeRef(kind: 'electricity' | 'water', year: number, month: number): string {
  return `bill-${kind}-${year}-${String(month).padStart(2, '0')}`
}

export interface PropertyHealth {
  /** true cuando no hay nada vencido ni por vencer que dependa de ti. */
  ok:          boolean
  overdue:     ChargeLike[]
  dueSoon:     ChargeLike[]
  /** Cargos automáticos (dividendo) que nadie ha revisado todavía. */
  unconfirmed: ChargeLike[]
  /** Deuda viva total: lo impago que te toca a ti pagar. */
  debtTotal:   number
  /** Impagos que por contrato le corresponden al arrendatario (no son costo tuyo). */
  tenantOverdue: ChargeLike[]
}

/**
 * El chequeo: qué está mal hoy. Es la única pregunta que este módulo responde —
 * entre arriendo y dividendo no hay margen que medir, así que no se calcula uno.
 *
 * Los cobros del arrendatario (consumos, gastos comunes) se separan a propósito:
 * no suman a tu deuda, pero su mora es causal de término de contrato, así que
 * tampoco se pueden esconder.
 */
export function propertyHealth(charges: ChargeLike[], todayStr: string): PropertyHealth {
  const overdue:       ChargeLike[] = []
  const dueSoon:       ChargeLike[] = []
  const unconfirmed:   ChargeLike[] = []
  const tenantOverdue: ChargeLike[] = []
  let   debtTotal = 0

  for (const c of charges) {
    const status   = chargeStatus(c, todayStr)
    const isTenant = c.responsible === 'tenant'

    if (status === 'overdue' || status === 'partial') {
      if (isTenant) tenantOverdue.push(c)
      else {
        overdue.push(c)
        // Solo cuenta como deuda lo que sale de tu bolsillo: un arriendo
        // impago es plata que no llegó, no una deuda que debas.
        if (c.direction !== 'in') debtTotal += chargeOutstanding(c)
      }
    } else if (status === 'due_soon' && !isTenant) {
      dueSoon.push(c)
    }

    if (c.auto_debit && !c.confirmed && c.paid_date) unconfirmed.push(c)
  }

  return {
    ok: overdue.length === 0 && dueSoon.length === 0 && tenantOverdue.length === 0,
    overdue, dueSoon, unconfirmed, tenantOverdue, debtTotal,
  }
}

/** El próximo cobro que vence sin pagar. null si no queda ninguno pendiente. */
export function nextDue(charges: ChargeLike[], todayStr: string): ChargeLike | null {
  const pending = charges
    .filter(c => !c.paid_date && c.due_date >= todayStr)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
  return pending[0] ?? null
}

export interface MortgageProgress {
  /** Cuotas del crédito ya pagadas — contadas, no guardadas (ver cabecera del archivo). */
  paidCount: number
  /** null si no se cargó el total de cuotas del crédito. */
  pendingCount: number | null
  /** Última cuota pagada, para saber cuál fue el monto UF-indexado más reciente. */
  lastPaidAmount: number | null
}

/**
 * Progreso del crédito hipotecario a partir del historial de cobros.
 *
 * `totalInstallments` es un dato del contrato (viene de la escritura), no de
 * los cobros — sin él no hay con qué restar para saber cuántas faltan.
 */
export function mortgageProgress(charges: ChargeLike[], totalInstallments: number | null): MortgageProgress {
  const mortgageCharges = charges
    .filter(c => c.kind === 'mortgage' && c.paid_date)
    .sort((a, b) => (b.paid_date ?? '').localeCompare(a.paid_date ?? ''))

  const paidCount = mortgageCharges.length
  const lastPaidAmount = mortgageCharges[0]
    ? (mortgageCharges[0].paid_amount ?? chargeTotal(mortgageCharges[0]))
    : null

  return {
    paidCount,
    pendingCount: totalInstallments != null ? Math.max(totalInstallments - paidCount, 0) : null,
    lastPaidAmount,
  }
}

/** Etiqueta en español de cada tipo de cobro. */
export const KIND_LABEL: Record<string, string> = {
  rent:           'Arriendo',
  mortgage:       'Dividendo',
  electricity:    'Luz',
  water:          'Agua',
  gas:            'Gas',
  aseo:           'Derechos de aseo',
  contribuciones: 'Contribuciones',
  gastos_comunes: 'Gastos comunes',
  repair:         'Reparación',
  deposit:        'Garantía',
  other:          'Otro',
}
