import { describe, it, expect } from 'vitest'
import { imageSize } from './image-size'

/** PNG mínimo válido: firma + IHDR con las dimensiones pedidas. */
function png(w: number, h: number): Uint8Array {
  const b = new Uint8Array(32)
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  b.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8)   // len + 'IHDR'
  new DataView(b.buffer).setUint32(16, w)
  new DataView(b.buffer).setUint32(20, h)
  return b
}

/** ICO con N entradas de directorio. 0 en el byte significa 256. */
function ico(entries: [number, number][]): Uint8Array {
  const b = new Uint8Array(6 + entries.length * 16)
  b.set([0x00, 0x00, 0x01, 0x00], 0)
  b[4] = entries.length & 0xff
  b[5] = entries.length >> 8
  entries.forEach(([w, h], i) => {
    b[6 + i * 16]     = w === 256 ? 0 : w
    b[6 + i * 16 + 1] = h === 256 ? 0 : h
  })
  return b
}

describe('imageSize — PNG', () => {
  it('lee las dimensiones del IHDR', () => {
    expect(imageSize(png(128, 128))).toEqual({ width: 128, height: 128, min: 128 })
  })

  it('el favicon chico que causaba el borroneo se detecta como 32×32', () => {
    expect(imageSize(png(32, 32))?.min).toBe(32)
  })

  it('min es el lado menor en imágenes no cuadradas', () => {
    expect(imageSize(png(512, 64))).toEqual({ width: 512, height: 64, min: 64 })
  })
})

describe('imageSize — ICO', () => {
  it('se queda con la resolución más grande del archivo', () => {
    expect(imageSize(ico([[16, 16], [48, 48], [32, 32]]))?.min).toBe(48)
  })

  it('un 0 en el directorio significa 256, no 0', () => {
    expect(imageSize(ico([[16, 16], [256, 256]]))?.min).toBe(256)
  })
})

describe('imageSize — GIF', () => {
  it('lee ancho/alto little-endian', () => {
    const b = new Uint8Array(16)
    b.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0)   // GIF89a
    b[6] = 0x80; b[7] = 0x00                          // 128
    b[8] = 0x40; b[9] = 0x00                          // 64
    expect(imageSize(b)).toEqual({ width: 128, height: 64, min: 64 })
  })
})

describe('imageSize — SVG', () => {
  it('el vector gana siempre: nunca pixela', () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"></svg>')
    expect(imageSize(svg)?.min).toBe(Infinity)
  })

  it('lo detecta aunque venga con declaración XML antes', () => {
    const svg = new TextEncoder().encode('<?xml version="1.0"?>\n<svg width="10"></svg>')
    expect(imageSize(svg)?.min).toBe(Infinity)
  })
})

describe('imageSize — JPEG', () => {
  it('encuentra el SOF0 saltando segmentos previos', () => {
    const b = new Uint8Array(40)
    b.set([0xff, 0xd8], 0)                            // SOI
    b.set([0xff, 0xe0, 0x00, 0x08, 0, 0, 0, 0, 0, 0], 2)  // APP0 de largo 8
    b.set([0xff, 0xc0, 0x00, 0x11, 0x08], 12)         // SOF0
    b[17] = 0x00; b[18] = 0xc8                        // alto 200
    b[19] = 0x01; b[20] = 0x40                        // ancho 320
    expect(imageSize(b)).toEqual({ width: 320, height: 200, min: 200 })
  })
})

describe('imageSize — casos borde', () => {
  it('null si el buffer es muy corto para decidir', () => {
    expect(imageSize(new Uint8Array(4))).toBeNull()
  })

  it('null si el formato no se reconoce, para no descartar la imagen a ciegas', () => {
    expect(imageSize(new Uint8Array(64).fill(0x42))).toBeNull()
  })
})
