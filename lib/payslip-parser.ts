// Parser de liquidaciones de sueldo (PDF → texto → campos estructurados).
// Pedido de Cas (ago 2026): sube la liquidación en PDF cada mes y se registra
// sola. El usuario confirmó que su empleador siempre genera el mismo formato
// (mismo software de nómina), así que el parser apunta a labels exactos de
// ESE template. Como la extracción de texto de un PDF multi-columna puede
// reordenar el contenido (pdf.js extrae en el orden del content stream, no
// necesariamente fila por fila), cada campo se busca por su label en TODO el
// texto en vez de asumir una posición fija — tolera reordenamientos de
// columnas, pero no toleraría un layout completamente distinto (por eso el
// resultado siempre se muestra en un formulario editable antes de guardar).

export interface BreakdownLine {
  label: string
  amount: number
}

export interface ParsedPayslip {
  month: number | null
  year: number | null
  employerName: string | null
  employerRut: string | null
  employeeName: string | null
  employeeRut: string | null
  position: string | null
  contractType: string | null
  contractStart: string | null // YYYY-MM-DD
  daysWorked: number | null
  ufValue: number | null
  previsionLabel: string | null
  saludLabel: string | null
  haberesImponibles: BreakdownLine[]
  haberesNoImponibles: BreakdownLine[]
  descuentosLegales: BreakdownLine[]
  otrosDescuentos: BreakdownLine[]
  totalHaberes: number | null
  totalDescuentos: number | null
  liquido: number | null
}

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
}

/** "2.154.149" → 2154149 · "39.706,07" → 39706.07 */
function parseCLPNumber(raw: string | undefined | null): number | null {
  if (!raw) return null
  const cleaned = raw.trim().replace(/\$/g, '').replace(/\s/g, '')
  if (!cleaned) return null
  // Miles con "." y decimales con "," (formato chileno)
  const normalized = cleaned.replace(/\./g, '').replace(',', '.')
  const n = parseFloat(normalized)
  return Number.isFinite(n) ? n : null
}

function parseCLPInt(raw: string | undefined | null): number | null {
  const n = parseCLPNumber(raw)
  return n === null ? null : Math.round(n)
}

/** Busca `Label: valor` en cualquier parte del texto (case-insensitive),
 *  cortando el valor antes del siguiente label conocido o salto de línea. */
function findLabelValue(text: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`${escaped}\\s*:\\s*([^\\n]+?)(?=\\s{2,}[A-ZÁÉÍÓÚÑ][a-záéíóúñ]|\\n|$)`, 'i')
  const m = text.match(re)
  return m ? m[1].trim() : null
}

/** Busca el monto en $ que sigue inmediatamente a un label de línea de
 *  haberes/descuentos (ej: "Sueldo Base" → "$ 359.025"). */
function findLineAmount(text: string, label: string): number | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Sin ":" — distingue una línea de tabla ("Sueldo Base $ 359.025") del
  // campo resumen homónimo que sí lleva ":" ("Sueldo Base: $ 2.154.149",
  // el sueldo base mensual completo antes de prorratear por días trabajados).
  const re = new RegExp(`${escaped}\\s*\\$\\s*([\\d.,]+)`, 'i')
  const m = text.match(re)
  return m ? parseCLPInt(m[1]) : null
}

/** Igual que findLineAmount pero el ":" antes del "$" es opcional — para los
 *  totales, que a veces lo llevan (ej. "LÍQUIDO A RECIBIR: $ 434.397") y a
 *  veces no (ej. "TOTAL HABERES $ 515.447"). */
function findTotalAmount(text: string, label: string): number | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`${escaped}\\s*:?\\s*\\$\\s*([\\d.,]+)`, 'i')
  const m = text.match(re)
  return m ? parseCLPInt(m[1]) : null
}

function buildLines(text: string, candidates: string[]): BreakdownLine[] {
  const lines: BreakdownLine[] = []
  for (const label of candidates) {
    const amount = findLineAmount(text, label)
    if (amount !== null && amount > 0) lines.push({ label, amount })
  }
  return lines
}

/** Labels típicos de cada sección — el parser solo incluye las que
 *  efectivamente aparecen (con monto > 0) en el PDF. Si el empleador agrega
 *  una línea nueva que no está en esta lista, no se pierde: el formulario de
 *  revisión permite agregarla a mano antes de guardar. */
const HABERES_IMPONIBLES_LABELS = ['Sueldo Base', 'Gratificación', 'Horas Extras', 'Comisiones', 'Bono']
const HABERES_NO_IMPONIBLES_LABELS = ['Colación', 'Movilización', 'Viático', 'Asignación Familiar']
const DESCUENTOS_LEGALES_LABELS = ['Cotiz. Previ. Obligatoria', 'Cotiz. Salud Obligatoria', 'Seguro Cesantía', 'Impuesto Único']

export function parsePayslipText(text: string): ParsedPayslip {
  const flat = text.replace(/\r/g, '')

  // ── Mes ──────────────────────────────────────────────────────────────────
  let month: number | null = null
  let year: number | null = null
  const mesMatch = findLabelValue(flat, 'Mes')
  if (mesMatch) {
    const m = mesMatch.match(/([a-záéíóúñ]+)\s+(\d{4})/i)
    if (m) {
      month = MESES[m[1].toLowerCase()] ?? null
      year = parseInt(m[2], 10)
    }
  }

  // ── Empleador ────────────────────────────────────────────────────────────
  const empleadorRaw = findLabelValue(flat, 'Empleador')
  let employerName: string | null = null
  let employerRut: string | null = null
  if (empleadorRaw) {
    const m = empleadorRaw.match(/^(.*?)\s*\(([\d.kK-]+)\)\s*$/)
    if (m) { employerName = m[1].trim(); employerRut = m[2].trim() }
    else employerName = empleadorRaw.trim()
  }

  // ── Trabajador ───────────────────────────────────────────────────────────
  const employeeName = findLabelValue(flat, 'Sr(a)')
  const employeeRut = findLabelValue(flat, 'RUT')
  const position = findLabelValue(flat, 'Cargo')
  const contractType = findLabelValue(flat, 'Tipo Contrato')
  const previsionLabel = findLabelValue(flat, 'Previsión')
  const saludLabel = findLabelValue(flat, 'Salud')

  const daysRaw = findLabelValue(flat, 'Días Trabajados')
  const daysWorked = daysRaw ? parseInt(daysRaw.replace(/\D/g, ''), 10) || null : null

  const ufRaw = findLabelValue(flat, 'UF')
  const ufValue = parseCLPNumber(ufRaw)

  let contractStart: string | null = null
  const inicioRaw = findLabelValue(flat, 'Inicio Contrato')
  if (inicioRaw) {
    const m = inicioRaw.match(/(\d{1,2})\s+([a-záéíóúñ]+)\s+(\d{4})/i)
    if (m) {
      const mm = MESES[m[2].toLowerCase()]
      if (mm) contractStart = `${m[3]}-${String(mm).padStart(2, '0')}-${String(parseInt(m[1], 10)).padStart(2, '0')}`
    }
  }

  // ── Desglose ─────────────────────────────────────────────────────────────
  const haberesImponibles = buildLines(flat, HABERES_IMPONIBLES_LABELS)
  const haberesNoImponibles = buildLines(flat, HABERES_NO_IMPONIBLES_LABELS)
  const descuentosLegales = buildLines(flat, DESCUENTOS_LEGALES_LABELS)

  // Otros descuentos: sección con posibles líneas variables (préstamos,
  // anticipos, etc.) — a diferencia de las anteriores no tiene labels fijos,
  // así que solo se captura el total; el detalle línea a línea se deja para
  // que el usuario lo agregue a mano si le importa.
  const otrosDescuentosTotal = findTotalAmount(flat, 'OTROS DESCUENTOS') ?? findTotalAmount(flat, 'Otros Descuentos')
  const otrosDescuentos: BreakdownLine[] =
    otrosDescuentosTotal && otrosDescuentosTotal > 0 ? [{ label: 'Otros descuentos', amount: otrosDescuentosTotal }] : []

  const totalHaberes = findTotalAmount(flat, 'TOTAL HABERES') ?? findTotalAmount(flat, 'Total Haberes')
  const totalDescuentos = findTotalAmount(flat, 'TOTAL DESCUENTOS') ?? findTotalAmount(flat, 'Total Descuentos')
  const liquido =
    findTotalAmount(flat, 'LÍQUIDO A RECIBIR') ??
    findTotalAmount(flat, 'Líquido a Recibir') ??
    findTotalAmount(flat, 'LIQUIDO A RECIBIR')

  return {
    month, year,
    employerName, employerRut,
    employeeName, employeeRut,
    position, contractType, contractStart, daysWorked, ufValue,
    previsionLabel, saludLabel,
    haberesImponibles, haberesNoImponibles, descuentosLegales, otrosDescuentos,
    totalHaberes, totalDescuentos, liquido,
  }
}
