// PDF "Aviso de Reajuste de Arriendo" (nov 2026). Mismo contenido que el aviso
// de la corredora: renta vigente, IPC mes a mes, acumulado, renta nueva y desde
// cuándo rige. Cita la cláusula del contrato para que el arrendatario pueda
// verificar. Solo caracteres WinAnsi (Helvetica estándar): tildes y ñ sí,
// flechas y símbolos raros no.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
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

// Marca Bolsillo Mágico dibujada en vectores (sin archivos de imagen: funciona
// igual en el cron de Vercel). Las formas son las de public/bolsillo-magico-icono-invertido.svg.
const ICON_BOX  = 'M138.24 0 H373.76 A138.24 138.24 0 0 1 512 138.24 V373.76 A138.24 138.24 0 0 1 373.76 512 H138.24 A138.24 138.24 0 0 1 0 373.76 V138.24 A138.24 138.24 0 0 1 138.24 0 Z'
const ICON_STAR = 'M256 117.76 L270.64 169.68 L322.56 184.32 L270.64 198.96 L256 250.88 L241.36 198.96 L189.44 184.32 L241.36 169.68 Z'
const ICON_CUP  = 'M148.48 307.2 A107.52 107.52 0 0 0 363.52 307.2 Z'
const BRAND_BLUE = rgb(0.169, 0.486, 0.965)   // #2B7CF6
const BRAND_GOLD = rgb(1, 0.76, 0.235)        // #FFC23C
const BRAND_NAVY = rgb(0.055, 0.165, 0.32)    // #0E2A52

/** Icono (esquina superior izquierda en x, topY) + wordmark "Bolsillo Mágico". */
function drawBrand(page: PDFPage, bold: PDFFont, x: number, topY: number, size: number, onDark = true) {
  const scale = size / 512
  const pageH = page.getHeight()
  page.drawSvgPath(ICON_BOX,  { x, y: pageH - topY, scale, color: rgb(1, 1, 1) })
  page.drawSvgPath(ICON_STAR, { x, y: pageH - topY, scale, color: BRAND_GOLD })
  page.drawSvgPath(ICON_CUP,  { x, y: pageH - topY, scale, color: onDark ? BRAND_BLUE : BRAND_NAVY })
  const fs = size * 0.5
  const ty = pageH - topY - size / 2 - fs * 0.33
  const tx = x + size + 8
  page.drawText('Bolsillo ', { x: tx, y: ty, size: fs, font: bold, color: rgb(1, 1, 1) })
  page.drawText('Mágico', { x: tx + bold.widthOfTextAtSize('Bolsillo ', fs), y: ty, size: fs, font: bold, color: BRAND_GOLD })
}

export async function buildRentAdjustmentPdf(input: RentAdjustmentPdfInput): Promise<Uint8Array> {
  const { adjustment: a } = input
  const doc = await PDFDocument.create()
  const page = doc.addPage([595, 842]) // A4
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const ink = rgb(0.055, 0.165, 0.32)
  const muted = rgb(0.36, 0.42, 0.51)
  const line = rgb(0.89, 0.92, 0.95)
  const blue = rgb(0.169, 0.486, 0.965)

  const M = 50
  const W = 595 - M * 2

  // Banda de marca arriba y pie navy abajo.
  page.drawRectangle({ x: 0, y: 842 - 84, width: 595, height: 84, color: BRAND_BLUE })
  drawBrand(page, bold, M, 22, 40)
  page.drawRectangle({ x: 0, y: 0, width: 595, height: 44, color: BRAND_NAVY })
  page.drawText('Generado con Bolsillo Mágico · bolsillomagico.com', {
    x: M, y: 17, size: 8.5, font, color: rgb(0.62, 0.71, 0.83),
  })

  let y = 842 - 84 - 44

  const text = (s: string, x: number, size = 10, f: PDFFont = font, color = ink) =>
    page.drawText(s, { x, y, size, font: f, color })
  const rightText = (s: string, xRight: number, size = 10, f: PDFFont = font, color = ink) =>
    page.drawText(s, { x: xRight - f.widthOfTextAtSize(s, size), y, size, font: f, color })
  const rule = (yy: number) => page.drawLine({ start: { x: M, y: yy }, end: { x: M + W, y: yy }, thickness: 0.8, color: line })
  const para = (s: string, size = 10, f: PDFFont = font, color = ink, gap = 14) => {
    for (const l of wrap(s, f, size, W)) { text(l, M, size, f, color); y -= gap }
  }

  // Encabezado
  text('Aviso de Reajuste de Arriendo', M, 20, bold)
  y -= 20
  text(`Emitido el ${dayLong(input.issuedOn)}`, M, 10, font, muted)
  y -= 12
  rule(y); y -= 22

  // Partes
  const rows: [string, string][] = [
    ['Propiedad', input.propertyLabel],
    ['Arrendadora', input.landlordName],
    ['Arrendatario', input.tenantName],
  ]
  for (const [k, v] of rows) { text(k, M, 10, font, muted); text(v, M + 90, 10, bold); y -= 16 }
  y -= 6

  // Resumen
  para(
    `Se informa al arrendatario que, conforme al contrato de arrendamiento, la renta se reajusta a partir del arriendo de ` +
    `${monthLong(a.adjustmentMonth)}, según la variación acumulada del IPC de los 6 meses indicados abajo.`,
    10, font, ink, 14,
  )
  y -= 8

  // Tabla IPC
  page.drawRectangle({ x: M, y: y - 6, width: W, height: 22, color: rgb(0.93, 0.96, 1) })
  text('Mes', M + 10, 9, bold, muted)
  rightText('Variación mensual IPC', M + W - 10, 9, bold, muted)
  y -= 24
  for (const m of a.windowMonths) {
    text(monthShort(m.date), M + 10, 10)
    rightText(m.pct === null ? 'sin dato' : pct(m.pct), M + W - 10, 10)
    y -= 4; rule(y); y -= 14
  }
  text('IPC acumulado (compuesto mes a mes)', M + 10, 10, bold)
  rightText(a.cumulativePct === null ? '-' : pct(a.cumulativePct, 4), M + W - 10, 10, bold)
  y -= 28

  // Resultado
  page.drawRectangle({ x: M, y: y - 64, width: W, height: 78, color: blue })
  const white = rgb(1, 1, 1)
  y -= 8
  text('Renta vigente', M + 16, 10, font, white); rightText(clp(a.previousRent), M + W - 16, 10, font, white)
  y -= 18
  text(a.floored ? 'Ajuste (IPC negativo: se mantiene la renta)' : 'Aumento', M + 16, 10, font, white)
  rightText(a.floored ? clp(0) : '+' + clp(a.delta), M + W - 16, 10, font, white)
  y -= 22
  text(`Renta desde ${monthLong(a.adjustmentMonth)}`, M + 16, 13, bold, white)
  rightText(clp(a.newRent), M + W - 16, 16, bold, white)
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

  void (page as PDFPage)
  return doc.save()
}
