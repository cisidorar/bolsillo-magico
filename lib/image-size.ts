// ── Dimensiones reales de una imagen desde sus primeros bytes ───────────────
// sep 2026 (Cas: "mejora la calidad del icono del banco de chile"): /api/logo
// devolvía la PRIMERA fuente que respondiera algo >200 bytes, sin mirar de qué
// tamaño era. Como los servicios de favicon devuelven lo que el sitio tenga
// (muchas veces 32×32), el logo llegaba diminuto y el `object-contain` del
// componente lo estiraba a 40px: borroso.
//
// Con esto el proxy puede pedir varias fuentes/tamaños y quedarse con la de
// mayor resolución de verdad, en vez de con la que llegó primero. Se lee del
// header, sin decodificar la imagen ni dependencias.

/** Alto/ancho en píxeles. `Infinity` para vectores (SVG), que nunca pixelan. */
export interface ImageSize {
  width:  number
  height: number
  /** Lado menor — lo que determina si se ve nítido a un tamaño dado. */
  min:    number
}

function u32be(b: Uint8Array, o: number): number {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0
}
function u16be(b: Uint8Array, o: number): number { return (b[o] << 8) | b[o + 1] }
function u16le(b: Uint8Array, o: number): number { return b[o] | (b[o + 1] << 8) }

function size(width: number, height: number): ImageSize {
  return { width, height, min: Math.min(width, height) }
}

/**
 * Devuelve las dimensiones de la imagen, o `null` si el formato no se
 * reconoce (en ese caso quien llame debe tratarla como "tamaño desconocido",
 * no como inválida).
 */
export function imageSize(buf: ArrayBuffer | Uint8Array): ImageSize | null {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  if (b.length < 16) return null

  // ── SVG: vectorial, nítido a cualquier tamaño → gana siempre ──────────────
  // Se mira solo el arranque del archivo, que puede traer BOM o <?xml antes.
  const head = new TextDecoder('utf-8', { fatal: false }).decode(b.subarray(0, 300)).toLowerCase()
  if (head.includes('<svg')) return { width: Infinity, height: Infinity, min: Infinity }

  // ── PNG: firma + IHDR con ancho/alto en big-endian ────────────────────────
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return size(u32be(b, 16), u32be(b, 20))
  }

  // ── GIF: 'GIF8' + ancho/alto little-endian ────────────────────────────────
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) {
    return size(u16le(b, 6), u16le(b, 8))
  }

  // ── ICO: puede traer varias resoluciones; se toma la más grande ───────────
  // Byte 0 en la entrada del directorio: 0 significa 256 (no cabe en un byte).
  if (b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01 && b[3] === 0x00) {
    const count = u16le(b, 4)
    let best: ImageSize | null = null
    for (let i = 0; i < count; i++) {
      const off = 6 + i * 16
      if (off + 2 > b.length) break
      const w = b[off] === 0 ? 256 : b[off]
      const h = b[off + 1] === 0 ? 256 : b[off + 1]
      if (!best || Math.min(w, h) > best.min) best = size(w, h)
    }
    return best
  }

  // ── WEBP: 'RIFF' … 'WEBP' + chunk VP8/VP8L/VP8X ───────────────────────────
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    const chunk = String.fromCharCode(b[12], b[13], b[14], b[15])
    if (chunk === 'VP8X' && b.length >= 30) {
      // 24 bits little-endian, menos 1
      const w = 1 + (b[24] | (b[25] << 8) | (b[26] << 16))
      const h = 1 + (b[27] | (b[28] << 8) | (b[29] << 16))
      return size(w, h)
    }
    if (chunk === 'VP8 ' && b.length >= 30) {
      return size(u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff)
    }
    if (chunk === 'VP8L' && b.length >= 25) {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)
      return size(1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff))
    }
    return null
  }

  // ── JPEG: recorrer los segmentos hasta un SOF con las dimensiones ─────────
  if (b[0] === 0xff && b[1] === 0xd8) {
    let o = 2
    while (o + 9 < b.length) {
      if (b[o] !== 0xff) { o++; continue }
      const marker = b[o + 1]
      // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15 (se saltan DHT/JPG/DAC)
      const isSof = (marker >= 0xc0 && marker <= 0xcf) &&
                    marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
      if (isSof) return size(u16be(b, o + 7), u16be(b, o + 5))
      o += 2 + u16be(b, o + 2)
    }
    return null
  }

  return null
}
