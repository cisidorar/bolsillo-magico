// ── P3 (PLAN_PROPIEDAD): boletas de luz y agua en PDF ───────────────────────
//
// Puro y sin dependencias: recibe el texto ya extraído del PDF (unpdf lo hace
// en la server action) y devuelve campos. Mismo contrato que
// lib/payslip-parser.ts — si no reconoce algo devuelve null, nunca inventa.
//
// El parser NUNCA escribe: su salida alimenta un borrador editable que Cas
// confirma. Un regex que falla degrada a carga manual, no a un dato falso.

export type UtilityProvider = 'enel' | 'aguas_andinas' | 'unknown'

export interface ParsedUtilityBill {
  provider:        UtilityProvider
  kind:            'electricity' | 'water' | null
  clientNumber:    string | null
  total:           number | null   // CLP
  dueDate:         string | null   // YYYY-MM-DD
  periodFrom:      string | null
  periodTo:        string | null
  consumption:     number | null   // kWh (luz) o m³ (agua)
  previousBalance: number | null   // saldo anterior impago
}

const MESES: Record<string, number> = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
  jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12,
}

/** "12 de septiembre de 2026", "12-SEP-2026", "12/09/2026" → "2026-09-12". */
export function parseClDate(raw: string): string | null {
  const s = raw.trim().toLowerCase()

  // 12/09/2026 o 12-09-2026
  const numeric = s.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/)
  if (numeric) {
    const [, d, m, y] = numeric
    const year = y.length === 2 ? 2000 + Number(y) : Number(y)
    return iso(year, Number(m), Number(d))
  }

  // 12 de septiembre de 2026 / 12-SEP-2026 / 12 sep 2026
  const named = s.match(/(\d{1,2})\s*(?:de\s+)?[-\s]?([a-záéíóú]{3,})\.?\s*(?:de\s+)?[-\s]?(\d{4})/)
  if (named) {
    const [, d, monthWord, y] = named
    const m = MESES[monthWord.slice(0, 3)]
    if (m) return iso(Number(y), m, Number(d))
  }
  return null
}

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * "$ 34.560" / "34.560" → 34560.
 *
 * En Chile el punto es separador de miles, no decimal: 34.560 son treinta y
 * cuatro mil quinientos sesenta, no 34,56. Por eso se eliminan los puntos en
 * vez de tratarlos como coma decimal — y como todos los montos de la app son
 * enteros en CLP, cualquier decimal residual se descarta.
 */
export function parseClMoney(raw: string): number | null {
  const cleaned = raw.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? Math.round(n) : null
}

/** Primer grupo capturado del primer patrón que matchee. */
function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = text.match(re)
    if (m?.[1]) return m[1]
  }
  return null
}

export function detectProvider(text: string): UtilityProvider {
  const t = text.toLowerCase()
  if (/aguas\s+andinas/.test(t)) return 'aguas_andinas'
  if (/\benel\b/.test(t)) return 'enel'
  return 'unknown'
}

export function parseUtilityBill(text: string): ParsedUtilityBill {
  const provider = detectProvider(text)
  const kind = provider === 'enel' ? 'electricity'
             : provider === 'aguas_andinas' ? 'water'
             : null

  const empty: ParsedUtilityBill = {
    provider, kind,
    clientNumber: null, total: null, dueDate: null,
    periodFrom: null, periodTo: null, consumption: null, previousBalance: null,
  }
  if (provider === 'unknown') return empty

  // N° de cliente — formato chileno con dígito verificador (3196937-9)
  const clientNumber = firstMatch(text, [
    /n[°ºo.]?\s*(?:de\s+)?cliente[:\s]*([\d.]+-[\dkK])/i,
    /n[°ºo.]?\s*(?:de\s+)?cliente[:\s]*(\d{5,})/i,
    /n[°ºo.]?\s*(?:de\s+)?servicio[:\s]*([\d.]+-[\dkK])/i,
  ])

  const totalRaw = firstMatch(text, [
    /total\s+a\s+pagar[:\s$]*([\d.,]+)/i,
    /monto\s+a\s+pagar[:\s$]*([\d.,]+)/i,
    /total\s+boleta[:\s$]*([\d.,]+)/i,
  ])

  const dueRaw = firstMatch(text, [
    /vence(?:\s+el)?[:\s]*([\d]{1,2}[\s/-][^\n,;]{2,20}[\s/-][\d]{2,4})/i,
    /fecha\s+de\s+vencimiento[:\s]*([\d]{1,2}[\s/-][^\n,;]{2,20}[\s/-][\d]{2,4})/i,
    /pagar\s+hasta[:\s]*([\d]{1,2}[\s/-][^\n,;]{2,20}[\s/-][\d]{2,4})/i,
  ])

  // "Período: 05/08/2026 al 04/09/2026"
  const periodPair = text.match(
    /per[íi]odo[^\d]{0,20}([\d]{1,2}[/-][\d]{1,2}[/-][\d]{2,4})\s*(?:al|a|-|hasta)\s*([\d]{1,2}[/-][\d]{1,2}[/-][\d]{2,4})/i
  )

  const consumptionRaw = firstMatch(text, [
    /consumo\s+(?:del\s+)?per[íi]odo[:\s]*([\d.,]+)\s*(?:kwh|m3|m³)/i,
    /([\d.,]+)\s*kwh/i,
    /consumo[:\s]*([\d.,]+)\s*(?:m3|m³)/i,
  ])

  const prevRaw = firstMatch(text, [
    /saldo\s+anterior[:\s$]*([\d.,]+)/i,
    /deuda\s+anterior[:\s$]*([\d.,]+)/i,
  ])

  return {
    provider, kind,
    clientNumber:    clientNumber?.trim() ?? null,
    total:           totalRaw ? parseClMoney(totalRaw) : null,
    dueDate:         dueRaw ? parseClDate(dueRaw) : null,
    periodFrom:      periodPair ? parseClDate(periodPair[1]) : null,
    periodTo:        periodPair ? parseClDate(periodPair[2]) : null,
    consumption:     consumptionRaw ? parseClMoney(consumptionRaw) : null,
    // Un saldo anterior de 0 es un dato válido ("no debes nada"), distinto de
    // "no lo encontré" — por eso se conserva el 0 en vez de colapsarlo a null.
    previousBalance: prevRaw ? parseClMoney(prevRaw) : null,
  }
}

/** Umbral de salto de consumo que enciende la alerta (fracción, no %). */
export const CONSUMPTION_SPIKE = 0.4

export interface SpikeResult {
  isSpike:  boolean
  avg:      number
  pctAbove: number
}

/**
 * ¿El consumo de esta boleta se disparó contra el promedio de los períodos
 * anteriores?
 *
 * Esto no es una curiosidad estadística: en un departamento donde no vives, un
 * salto de agua sin explicación suele ser una filtración. La boleta la paga el
 * arrendatario, pero la cañería es tuya — detectarlo temprano es la diferencia
 * entre una llave y un piso levantado.
 *
 * Necesita al menos 2 períodos previos para tener una base con sentido; con
 * uno solo cualquier variación estacional daría falsa alarma.
 */
export function detectConsumptionSpike(current: number, previous: number[]): SpikeResult {
  const valid = previous.filter(n => n > 0)
  if (valid.length < 2) return { isSpike: false, avg: 0, pctAbove: 0 }

  const avg = valid.reduce((a, b) => a + b, 0) / valid.length
  const pctAbove = (current - avg) / avg
  return { isSpike: pctAbove > CONSUMPTION_SPIKE, avg: Math.round(avg), pctAbove }
}
