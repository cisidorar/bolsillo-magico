// ── Comprobante de pago de derechos de aseo (portal municipal / WebAseo) ────
//
// Mismo contrato que lib/utility-bill-parser.ts y lib/payslip-parser.ts: si
// no reconoce algo devuelve null, nunca inventa. Reutiliza los parsers de
// fecha/plata de utility-bill-parser para no duplicar esas reglas (el punto
// como separador de miles, el redondeo a entero de los CLP, etc).
//
// El comprobante lo entrega el portal de pago municipal cuando Cas paga un
// giro de aseo — trae el mismo N° de giro (external_ref) con el que ya se
// generó el cobro en property_charges, así que sirve para "adjuntar y marcar
// pagado" en un solo paso en vez de escribir la fecha y el monto a mano.

import { parseClDate, parseClMoney } from './utility-bill-parser'

export interface ParsedAseoReceipt {
  ingresoNumero: string | null   // N° de giro — coincide con external_ref del cobro
  rol:           string | null
  totalPagado:   number | null   // CLP, ya con IPC + interés si hubo mora
  paidDate:      string | null   // YYYY-MM-DD (el comprobante trae hora también, se descarta)
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
    ingresoNumero: null, rol: null, totalPagado: null, paidDate: null,
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

  const dueRaw = firstMatch(text, [
    // "FECHA PAGO : 04-09-2026 13:58" — se corta antes de la hora, no hace
    // falta capturarla para paid_date.
    /fecha\s+pago\s*:?[:\s]*([\d]{1,2}[-/][\d]{1,2}[-/][\d]{2,4})/i,
  ])

  return {
    ingresoNumero: ingresoNumero?.trim() ?? null,
    rol:           rol?.trim() ?? null,
    totalPagado:   totalRaw ? parseClMoney(totalRaw) : null,
    paidDate:      dueRaw ? parseClDate(dueRaw) : null,
  }
}
