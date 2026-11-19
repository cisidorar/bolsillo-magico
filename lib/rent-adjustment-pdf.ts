// PDF "Aviso de Reajuste de Arriendo" (nov 2026). Mismo contenido que el aviso
// de la corredora: renta vigente, IPC mes a mes, acumulado, renta nueva y desde
// cuándo rige. Cita la cláusula del contrato para que el arrendatario pueda
// verificar. Solo caracteres WinAnsi (Helvetica estándar): tildes y ñ sí,
// flechas y símbolos raros no.

import { PDFDocument, StandardFonts, type PDFFont } from 'pdf-lib'
import { PDF, drawPdfHeader, drawPdfFooter, setPdfMetadata } from './pdf-brand'
import type { RentAdjustment } from './rent-adjustment'

export interface RentAdjustmentPdfInput {
  propertyLabel: string          // "Depto 921, Santa Victoria 562, Santiago"
  landlordName:  string
  tenantName:    string
  adjustment:    RentAdjustment
  issuedOn:      string          // YYYY-MM-DD
  /** Mes en que rige la renta nueva ya dicho en palabras: "diciembre de 2026". */
  clauseText?:   string
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export const CLAUSE_QUINTO =
  'QUINTO: Reajuste. La renta se reajustará durante toda la vigencia del arrendamiento, reajuste que se hará cada 6 meses, ' +
  'en la misma proporción o porcentaje en que haya podido variar el Índice de Precios al Consumidor (IPC) determinado por el ' +
  'Instituto Nacional de Estadísticas, del período anterior y en forma acumulada. Si durante algún período resulta un IPC ' +
  'negativo, se mantendrá el canon de arriendo que está rigiendo en ese momento hasta el próximo reajuste.'

const clp = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')
const pct = (n: number, d = 2) => n.toLocaleString('es-CL', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%'

export function monthLong(dateStr: string): string {
  const [y, m] = dateStr.split('-').map(Number)
  return `${MESES[m - 1]} de ${y}`
}
export function monthShort(dateStr: string): string {
  const [y, m] = dateStr.split('-').map(Number)
  return `${MES_CORTO[m - 1]}-${String(y).slice(2)}`
}
function dayLong(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return `${d} de ${MESES[m - 1]} de ${y}`
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    if (font.widthOfTextAtSize(next, size) <= maxWidth) cur = next
    else { if (cur) lines.push(cur); cur = w }
  }
  if (cur) lines.push(cur)
  return lines
}

export async function buildRentAdjustmentPdf(input: RentAdjustmentPdfInput): Promise<Uint8Array> {
  const { adjustment: a } = input
  const doc = await PDFDocument.create()
  setPdfMetadata(doc, `Aviso de reajuste de arriendo · ${monthLong(a.adjustmentMonth)}`, input.propertyLabel)
  const page = doc.addPage([PDF.pageW, PDF.pageH])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const { margin: M, navy, muted, hairline } = PDF
  const W = PDF.pageW - M * 2

  // Norma docs/PDF_SYSTEM.md: marca chica arriba, regla fina y texto chico abajo.
  let y = drawPdfHeader(page, { regular: font, bold }, 'Aviso de reajuste')
  drawPdfFooter(page, { regular: font })

  const text = (s: string, x: number, size = 10, f: PDFFont = font, color = navy) =>
    page.drawText(s, { x, y, size, font: f, color })
  const rightText = (s: string, xRight: number, size = 10, f: PDFFont = font, color = navy) =>
    page.drawText(s, { x: xRight - f.widthOfTextAtSize(s, size), y, size, font: f, color })
  const rule = (yy: number) => page.drawLine({ start: { x: M, y: yy }, end: { x: M + W, y: yy }, thickness: 0.8, color: hairline })
  const para = (s: string, size = 10, f: PDFFont = font, color = navy, gap = 14) => {
    for (const l of wrap(s, f, size, W)) { text(l, M, size, f, color); y -= gap }
  }

  // Título + fecha de emisión
  text('Aviso de Reajuste de Arriendo', M, 19, bold)
  y -= 18
  text(`Emitido el ${dayLong(input.issuedOn)}`, M, 9.5, font, muted)
  y -= 28

  // Partes
  const rows: [string, string][] = [
    ['Propiedad', input.propertyLabel],
    ['Arrendadora', input.landlordName],
    ['Arrendatario', input.tenantName],
  ]
  for (const [k, v] of rows) { text(k, M, 10, font, muted); text(v, M + 90, 10, bold); y -= 16 }
  y -= 8

  para(
    `Se informa al arrendatario que, conforme al contrato de arrendamiento, la renta se reajusta a partir del arriendo de ` +
    `${monthLong(a.adjustmentMonth)}, según la variación acumulada del IPC de los 6 meses indicados abajo.`,
    10, font, navy, 14,
  )
  y -= 10

  // Tabla IPC: encabezado en tinte suave (acento, no relleno sólido)
  page.drawRectangle({ x: M, y: y - 7, width: W, height: 22, color: PDF.tint })
  text('MES', M + 10, 8, bold, muted)
  rightText('VARIACIÓN MENSUAL IPC', M + W - 10, 8, bold, muted)
  y -= 26
  for (const m of a.windowMonths) {
    text(monthShort(m.date), M + 10, 10)
    rightText(m.pct === null ? 'sin dato' : pct(m.pct), M + W - 10, 10)
    y -= 5; rule(y); y -= 14
  }
  text('IPC acumulado (compuesto mes a mes)', M + 10, 10, bold)
  rightText(a.cumulativePct === null ? '-' : pct(a.cumulativePct, 4), M + W - 10, 10, bold)
  y -= 30

  // Resultado: un solo bloque destacado, en tinte suave con borde fino. El
  // azul de marca va solo en la cifra principal.
  const boxH = 76
  page.drawRectangle({ x: M, y: y - boxH + 14, width: W, height: boxH, color: PDF.tint, borderColor: PDF.tintLine, borderWidth: 1 })
  y -= 6
  text('Renta vigente', M + 16, 10, font, muted); rightText(clp(a.previousRent), M + W - 16, 10)
  y -= 18
  text(a.floored ? 'Ajuste (IPC negativo: se mantiene la renta)' : 'Aumento', M + 16, 10, font, muted)
  rightText(a.floored ? clp(0) : '+' + clp(a.delta), M + W - 16, 10)
  y -= 24
  text(`Renta desde ${monthLong(a.adjustmentMonth)}`, M + 16, 12, bold)
  rightText(clp(a.newRent), M + W - 16, 18, bold, PDF.blue)
  y -= 52

  // Notas
  const notes = [
    'Cómo se calcula: se multiplica (1 + IPC mensual) de cada uno de los 6 meses y se resta 1. El resultado se aplica a la renta vigente y se redondea al peso.',
    'Los valores mensuales se muestran con 2 decimales; el cálculo oficial puede diferir en pocos pesos por redondeo. Fuente de los datos: INE (IPC mensual).',
    'Período de IPC: se usan los 6 meses cuyo IPC ya estaba publicado a la fecha de pago del arriendo (el INE publica el IPC de un mes alrededor del día 8 del mes siguiente).',
  ]
  for (const n of notes) { para(n, 8.5, font, muted, 12); y -= 4 }
  y -= 6
  rule(y); y -= 18
  text('Cláusula del contrato', M, 9, bold, muted); y -= 14
  para(input.clauseText ?? CLAUSE_QUINTO, 8.5, font, muted, 12)

  return doc.save()
}
