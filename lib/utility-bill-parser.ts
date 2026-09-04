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

/**
 * Igual que parseClMoney pero conserva decimales — para consumo, no para CLP.
 * El agua se prorratea entre lecturas ("3,74 m3"), así que redondear a entero
 * (como sí corresponde para plata) perdería precisión real del dato.
 */
export function parseClNumber(raw: string): number | null {
  const cleaned = raw.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
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
  // Una boleta real de Aguas Andinas puede no decir "Aguas Andinas" en
  // ninguna parte del texto extraído: el PDF muestra la razón social del
  // cliente (ej. una inmobiliaria), no la del emisor. El RUT de la empresa
  // (61.808.000-5) sí aparece siempre y es un identificador único confiable.
  if (/aguas\s+andinas/.test(t) || t.includes('61.808.000-5') || t.includes('61808000-5')) {
    return 'aguas_andinas'
  }
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

  // unpdf (el extractor real usado al subir el PDF) no siempre reconstruye
  // el texto en orden de lectura natural: cuando el PDF tiene columnas, junta
  // todas las ETIQUETAS de una columna y recién más abajo pega todos los
  // VALORES de la otra, en el mismo orden. En la boleta de Aguas Andinas esto
  // se ve como:
  //   Total a Pagar
  //   Vencimiento
  //   Nro de cuenta
  //   $ 6.120
  //   22-AGO-2026
  //   2502874-0
  // (pdfplumber, usado antes para verificar a mano, sí arma el orden natural
  // y por eso este bug no salió en la primera vuelta de pruebas). Este bloque
  // ancla los tres valores por su orden relativo a las tres etiquetas.
  const resumenBlock = text.match(
    /total\s+a\s+pagar\s*\n\s*vencimiento\s*\n\s*nro\s+de\s+cuenta\s*\n\s*\$?\s*([\d.,]+)\s*\n\s*([\d]{1,2}[-/][a-záéíóú]{3,9}[-/][\d]{2,4})\s*\n\s*([\d.]+-[\dkK])/i
  )

  // N° de cliente — formato chileno con dígito verificador (3196937-9).
  // Las boletas reales de Enel casi nunca dicen literalmente "N° de cliente":
  // el identificador viene en el bloque PAC/PAT para inscribir el pago
  // automático ("PAT 3196937-9"), que es el mismo número. Va primero porque
  // es el más confiable — aparece en todas, no solo en algunas.
  // Aguas Andinas identifica la cuenta como "Nro de cuenta" (con "r"), no
  // "N° de cliente" — un prefijo distinto al de las otras variantes de abajo.
  const clientNumber = firstMatch(text, [
    /\bPAT\s+([\d.]+-[\dkK])/i,
    /n[°ºo.]?\s*(?:de\s+)?cliente[:\s]*([\d.]+-[\dkK])/i,
    /n[°ºo.]?\s*(?:de\s+)?cliente[:\s]*(\d{5,})/i,
    /(?:n[°º.]?|nro)\.?\s*(?:de\s+)?cuenta[:\s]*([\d.]+-[\dkK])/i,
    /n[°ºo.]?\s*(?:de\s+)?servicio[:\s]*([\d.]+-[\dkK])/i,
  ]) ?? resumenBlock?.[3] ?? null

  const totalRaw = firstMatch(text, [
    /total\s+a\s+pagar[:\s$]*([\d.,]+)/i,
    /monto\s+a\s+pagar[:\s$]*([\d.,]+)/i,
    /total\s+boleta[:\s$]*([\d.,]+)/i,
  ]) ?? resumenBlock?.[1] ?? null

  const dueRaw = firstMatch(text, [
    // \b evita que "vence" matchee dentro de "vencimiento" y falle por no
    // encontrar dígitos justo después (el resto de la palabra no son dígitos).
    /\bvence(?:\s+el)?[:\s]*([\d]{1,2}[\s/-][^\n,;]{2,20}[\s/-][\d]{2,4})/i,
    /fecha\s+de\s+vencimiento[:\s]*([\d]{1,2}[\s/-][^\n,;]{2,20}[\s/-][\d]{2,4})/i,
    // Aguas Andinas junta "VENCIMIENTO" y "TOTAL A PAGAR" en un solo renglón,
    // a veces sin espacio antes de la fecha ("...PAGAR22-AGO-2026 $ 6.120").
    /vencimiento\s+total\s+a\s+pagar\s*([\d]{1,2}[\s/-][^\n,;]{2,20}?[\s/-][\d]{2,4})/i,
    // Y "VENCIMIENTO 22-AGO-2026" a secas, sin "fecha de" ni "vence" — captura
    // no-greedy para no tragarse el resto de la línea si comparten renglón.
    /\bvencimiento[:\s]*([\d]{1,2}[\s/-][^\n,;]{2,20}?[\s/-][\d]{2,4})/i,
    /pagar\s+hasta[:\s]*([\d]{1,2}[\s/-][^\n,;]{2,20}[\s/-][\d]{2,4})/i,
  ]) ?? resumenBlock?.[2] ?? null

  // "Período: 05/08/2026 al 04/09/2026"
  const periodPair = text.match(
    /per[íi]odo[^\d]{0,20}([\d]{1,2}[/-][\d]{1,2}[/-][\d]{2,4})\s*(?:al|a|-|hasta)\s*([\d]{1,2}[/-][\d]{1,2}[/-][\d]{2,4})/i
  )

  // Aguas Andinas no siempre declara un "período" explícito: da las fechas de
  // lectura del medidor, que delimitan el mismo tramo que cobra la boleta.
  const lecturaAnterior = firstMatch(text, [
    /lectura\s+anterior\s+([\d]{1,2}[-/][a-záéíóú]{3,9}[-/][\d]{2,4})/i,
  ])
  const lecturaActual = firstMatch(text, [
    /lectura\s+actual\s+([\d]{1,2}[-/][a-záéíóú]{3,9}[-/][\d]{2,4})/i,
  ])

  // El consumo total real casi siempre dice "Consumo total del período" (con
  // "total" de por medio) o "= 125" en vez de "125 kWh" pegado — y ANTES de
  // esa frase, la boleta ya mencionó sub-consumos por horario que también
  // vienen pegados a "kWh" ("Electricidad Consumida Noche (28kWh)"). El
  // fallback genérico de abajo agarraría ese 28 en vez de los 125 reales si
  // fuera el primero en la lista — por eso esta frase específica va primero.
  // "CONSUMO TOTAL 3,74 m3" (Aguas Andinas real) tiene "TOTAL" entre
  // "consumo" y el número — a diferencia de "CONSUMO AGUA POTABLE 3,74 2.286"
  // que aparece antes en la misma boleta y NO es el consumo total a usar.
  const consumptionRaw = firstMatch(text, [
    /consumo\s+(?:total\s+)?(?:del\s+)?per[íi]odo[:=\s]*([\d.,]+)/i,
    /([\d.,]+)\s*kwh/i,
    /consumo\s*(?:total)?[:\s]*([\d.,]+)\s*(?:m3|m³)/i,
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
    periodFrom:      periodPair ? parseClDate(periodPair[1])
                     : lecturaAnterior ? parseClDate(lecturaAnterior) : null,
    periodTo:        periodPair ? parseClDate(periodPair[2])
                     : lecturaActual ? parseClDate(lecturaActual) : null,
    // parseClNumber, no parseClMoney: el consumo de agua viene prorrateado
    // ("3,74 m3") y redondear a entero perdería el dato real.
    consumption:     consumptionRaw ? parseClNumber(consumptionRaw) : null,
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
