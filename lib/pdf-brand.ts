// ── Marca de Bolsillo Mágico en documentos PDF (nov 2026) ───────────────────
// Norma completa en docs/PDF_SYSTEM.md. La idea, tomada de dos documentos de
// referencia (una liquidación de Buk y un aviso de reajuste de una corredora):
// la marca ACOMPAÑA, no protagoniza. Página blanca, logo chico en una esquina
// arriba, una línea fina y texto chico abajo. Nada de bandas de color a todo el
// ancho ni logos grandes — el documento es del usuario, la marca es la firma.
//
// Solo vectores + fuentes estándar de PDF (Helvetica): funciona igual en el
// cron de Vercel sin archivos de imagen ni fuentes que empaquetar.

import { rgb, type PDFDocument, type PDFFont, type PDFPage } from 'pdf-lib'

export const PDF = {
  pageW: 595,           // A4 en puntos
  pageH: 842,
  margin: 50,
  // Paleta (DESIGN.md / EMAIL_SYSTEM.md). El azul es acento, no relleno.
  blue:     rgb(0.169, 0.486, 0.965),   // #2B7CF6
  navy:     rgb(0.055, 0.165, 0.32),    // #0E2A52 — títulos y texto
  gold:     rgb(1, 0.76, 0.235),        // #FFC23C — solo dentro del ícono
  muted:    rgb(0.36, 0.42, 0.51),      // texto secundario
  hairline: rgb(0.89, 0.92, 0.95),      // #E4EAF3 — reglas finas
  tint:     rgb(0.933, 0.957, 1),       // #EEF4FF — fondo suave de bloques
  tintLine: rgb(0.835, 0.902, 1),       // #D5E6FF — borde de bloques
  white:    rgb(1, 1, 1),
} as const

const ICON_BOX  = 'M138.24 0 H373.76 A138.24 138.24 0 0 1 512 138.24 V373.76 A138.24 138.24 0 0 1 373.76 512 H138.24 A138.24 138.24 0 0 1 0 373.76 V138.24 A138.24 138.24 0 0 1 138.24 0 Z'
const ICON_STAR = 'M256 117.76 L270.64 169.68 L322.56 184.32 L270.64 198.96 L256 250.88 L241.36 198.96 L189.44 184.32 L241.36 169.68 Z'
const ICON_CUP  = 'M148.48 307.2 A107.52 107.52 0 0 0 363.52 307.2 Z'

/**
 * Logo (ícono + wordmark) sobre fondo BLANCO: cuadrado azul con estrella dorada
 * y copa blanca (variante estándar de public/bolsillo-magico-icono.svg), y
 * "Bolsillo" navy + "Mágico" azul. `topY` = distancia desde el borde superior.
 */
export function drawBrandMark(page: PDFPage, bold: PDFFont, x: number, topY: number, size: number): number {
  const scale = size / 512
  const oy = PDF.pageH - topY
  page.drawSvgPath(ICON_BOX,  { x, y: oy, scale, color: PDF.blue })
  page.drawSvgPath(ICON_STAR, { x, y: oy, scale, color: PDF.gold })
  page.drawSvgPath(ICON_CUP,  { x, y: oy, scale, color: PDF.white })
  const fs = size * 0.55
  const ty = oy - size / 2 - fs * 0.33
  const tx = x + size + 6
  page.drawText('Bolsillo ', { x: tx, y: ty, size: fs, font: bold, color: PDF.navy })
  const w1 = bold.widthOfTextAtSize('Bolsillo ', fs)
  page.drawText('Mágico', { x: tx + w1, y: ty, size: fs, font: bold, color: PDF.blue })
  return w1 + bold.widthOfTextAtSize('Mágico', fs) + size + 6   // ancho total
}

/** Encabezado: logo chico a la izquierda, etiqueta del documento a la derecha, regla fina. Devuelve la y (desde abajo) donde empieza el contenido. */
export function drawPdfHeader(page: PDFPage, fonts: { regular: PDFFont; bold: PDFFont }, label: string): number {
  const { margin, pageW, pageH } = PDF
  drawBrandMark(page, fonts.bold, margin, 34, 20)
  const fs = 8.5
  page.drawText(label.toUpperCase(), {
    x: pageW - margin - fonts.bold.widthOfTextAtSize(label.toUpperCase(), fs),
    y: pageH - 34 - 10 - fs * 0.33, size: fs, font: fonts.bold, color: PDF.muted,
  })
  const ruleY = pageH - 34 - 20 - 12
  page.drawLine({ start: { x: margin, y: ruleY }, end: { x: pageW - margin, y: ruleY }, thickness: 0.8, color: PDF.hairline })
  return ruleY - 28
}

/** Pie: regla fina + texto chico. Sin bloques de color. */
export function drawPdfFooter(page: PDFPage, fonts: { regular: PDFFont }, left = 'Generado con Bolsillo Mágico') {
  const { margin, pageW } = PDF
  page.drawLine({ start: { x: margin, y: 44 }, end: { x: pageW - margin, y: 44 }, thickness: 0.8, color: PDF.hairline })
  page.drawText(left, { x: margin, y: 28, size: 8, font: fonts.regular, color: PDF.muted })
  const site = 'bolsillomagico.com'
  page.drawText(site, {
    x: pageW - margin - fonts.regular.widthOfTextAtSize(site, 8), y: 28, size: 8, font: fonts.regular, color: PDF.muted,
  })
}

/** Metadatos del archivo (título, autor) — lo que ve el visor de PDF. */
export function setPdfMetadata(doc: PDFDocument, title: string, subject?: string) {
  doc.setTitle(title)
  doc.setAuthor('Bolsillo Mágico')
  doc.setCreator('Bolsillo Mágico')
  doc.setProducer('Bolsillo Mágico')
  if (subject) doc.setSubject(subject)
  doc.setCreationDate(new Date())
}
