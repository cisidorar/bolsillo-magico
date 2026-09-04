// ── Comprobante de pago de derechos de aseo (portal municipal / WebAseo) ────
//
// Mismo contrato que lib/utility-bill-parser.ts y lib/payslip-parser.ts: si
// no reconoce algo devuelve null, nunca inventa. Reutiliza los parsers de
// fecha/plata de utility-bill-parser para no duplicar esas reglas (el punto
// como separador de miles, el redondeo a entero de los CLP, etc).
//
// El comprobante lo entrega el portal de pago municipal cuando Cas paga un
// giro de aseo. OJO: el "N° de giro" real (INGRESO NÚMERO, ej. 2600580211)
// NO es lo mismo que el external_ref que ya tiene el cobro en
// property_charges — generateAseoCharges genera un external_ref PROVISORIO
// tipo "aseo-2026-Q2" (ver aseoRef en lib/property-charges.ts) porque el
// folio real recién se conoce cuando llega esta boleta. El emparejamiento
// automático con el cobro pendiente, entonces, no puede ser por número de
// giro — se hace por PLAZO PARA PAGAR, que sí coincide exacto con la
// due_date del cobro (los 4 vencimientos de aseo son fechas fijas: 30 abr,
// 30 jun, 30 sep, 30 nov). El ingresoNumero que sí se extrae acá sirve para
// completar el external_ref real una vez encontrado el cobro, cerrando el
// "hasta que se conozca el folio real" de aseoRef.

import { parseClDate, parseClMoney } from './utility-bill-parser'

export interface ParsedAseoReceipt {
  ingresoNumero:   string | null   // N° de giro real — para completar el external_ref provisorio
  rol:             string | null
  totalPagado:     number | null   // CLP, ya con IPC + interés si hubo mora
  paidDate:        string | null   // YYYY-MM-DD (el comprobante trae hora también, se descarta)
  plazoParaPagar:  string | null   // YYYY-MM-DD — el vencimiento del giro, para emparejar con el cobro
}

/** Primer grupo capturado del primer patrón que matchee. */
function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = text.match(re)
    if (m?.[1]) return m[1]
  }
  return null
}

/**
 * ¿Este texto es de un comprobante de pago de aseo? Un PDF que no lo es
 * (por ejemplo, cualquier otro papel) debe degradar a "no reconocido", no a
 * campos inventados a partir de coincidencias sueltas.
 */
export function looksLikeAseoReceipt(text: string): boolean {
  const t = text.toLowerCase()
  return /cobro\s+de\s+aseo/.test(t) || /webaseo/.test(t)
}

export function parseAseoReceipt(text: string): ParsedAseoReceipt {
  const empty: ParsedAseoReceipt = {
    ingresoNumero: null, rol: null, totalPagado: null, paidDate: null, plazoParaPagar: null,
  }
  if (!looksLikeAseoReceipt(text)) return empty

  const ingresoNumero = firstMatch(text, [
    /ingreso\s+n[uú]mero[:\s]*(\d{5,})/i,
  ])

  const rol = firstMatch(text, [
    /\brol[:\s]*(\d{5,})/i,
  ])

  const totalRaw = firstMatch(text, [
    // "TOTAL PAGADO" es el monto realmente pagado (subtotal + IPC + interés
    // si el giro llegó con mora) — el dato que debe llenar el pago, no el
    // "SUBTOTAL" que es solo el valor base sin recargos.
    /total\s+pagado[:\s$]*([\d.,]+)/i,
  ])

  const paidRaw = firstMatch(text, [
    // "FECHA PAGO : 04-09-2026 13:58" — se corta antes de la hora, no hace
    // falta capturarla para paid_date.
    /fecha\s+pago\s*:?[:\s]*([\d]{1,2}[-/][\d]{1,2}[-/][\d]{2,4})/i,
  ])

  const plazoRaw = firstMatch(text, [
    // El vencimiento del giro (no el de pago) — es lo único fijo y conocido
    // de antemano, así que es la clave real para emparejar con el cobro.
    /plazo\s+para\s+pagar[:\s]*([\d]{1,2}[-/][\d]{1,2}[-/][\d]{2,4})/i,
  ])

  return {
    ingresoNumero:  ingresoNumero?.trim() ?? null,
    rol:            rol?.trim() ?? null,
    totalPagado:    totalRaw ? parseClMoney(totalRaw) : null,
    paidDate:       paidRaw ? parseClDate(paidRaw) : null,
    plazoParaPagar: plazoRaw ? parseClDate(plazoRaw) : null,
  }
}
