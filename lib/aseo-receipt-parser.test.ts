import { describe, it, expect } from 'vitest'
import { parseAseoReceipt, looksLikeAseoReceipt } from './aseo-receipt-parser'

describe('looksLikeAseoReceipt', () => {
  it('reconoce el comprobante por "COBRO DE ASEO" o "WEBASEO"', () => {
    expect(looksLikeAseoReceipt('TRIBUTO COBRO DE ASEO')).toBe(true)
    expect(looksLikeAseoReceipt('CAJERO : WEBASEO')).toBe(true)
  })

  it('no reconoce un texto cualquiera', () => {
    expect(looksLikeAseoReceipt('Boleta de luz Enel')).toBe(false)
  })
})

describe('parseAseoReceipt — comprobante real (texto tal como lo entrega unpdf)', () => {
  // Extracto real de un comprobante de pago de derechos de aseo (portal
  // municipal WebAseo, sep 2026) — texto exactamente como lo devuelve unpdf,
  // no una reconstrucción a mano. La lección de los parsers de boletas: un
  // texto "prolijo" armado de memoria puede esconder bugs que solo salen con
  // el documento real.
  const COMPROBANTE_REAL = `
    INGRESO NÚMERO
    2600580211
    ROL 105980225
    RUT 6358059-7
    NOMBRE REINALDO ORDENES VEAS
    DIRECCION SANTA VICTORIA 562 DEPTO 921
    TRIBUTO COBRO DE ASEO
    PERIODO 2
    FECHA EMISIÓN 01-04-2026
    PLAZO PARA PAGAR 30-06-2026
    IMPUESTOS Y DERECHOS
    1,00 VALOR ASEO $ 13.950
    SUBTOTAL $ 13.950
    IPC $ 34
    INTERÉS $ 197
    TOTAL PAGADO $ 14.181
    FECHA PAGO : 04-09-2026 13:58
    4CFB171A8D
    EMISOR : RENTAS
    CAJERO : WEBASEO
    UNIDAD : RENTAS Y FINANZAS
    97
    GLOSA DE PAGO :
    DESTINO HABITACIONAL; TARIFA NOCTURNA
    CUOTA 02 DE 2026
  `

  it('saca el N° de giro real de "INGRESO NÚMERO" — para completar el external_ref provisorio del cobro', () => {
    expect(parseAseoReceipt(COMPROBANTE_REAL).ingresoNumero).toBe('2600580211')
  })

  it('saca el ROL', () => {
    expect(parseAseoReceipt(COMPROBANTE_REAL).rol).toBe('105980225')
  })

  it('usa TOTAL PAGADO (con IPC e interés), no el SUBTOTAL sin recargos', () => {
    expect(parseAseoReceipt(COMPROBANTE_REAL).totalPagado).toBe(14181)
  })

  it('lee la fecha de pago y descarta la hora ("04-09-2026 13:58" → solo la fecha)', () => {
    expect(parseAseoReceipt(COMPROBANTE_REAL).paidDate).toBe('2026-09-04')
  })

  it('lee PLAZO PARA PAGAR — la clave real para emparejar con el cobro (su due_date), no INGRESO NÚMERO', () => {
    expect(parseAseoReceipt(COMPROBANTE_REAL).plazoParaPagar).toBe('2026-06-30')
  })
})

describe('parseAseoReceipt — segundo comprobante real (otro giro, mismo formato)', () => {
  // Extracto real del giro de abril (2600580210) — mismo formato, otro
  // trimestre, para confirmar que plazoParaPagar/ingresoNumero cambian con
  // el documento y no quedan pegados a valores de prueba.
  const COMPROBANTE_Q1 = `
    INGRESO NÚMERO
    2600580210
    ROL 105980225
    RUT 6358059-7
    NOMBRE REINALDO ORDENES VEAS
    DIRECCION SANTA VICTORIA 562 DEPTO 921
    TRIBUTO COBRO DE ASEO
    PERIODO 1
    FECHA EMISIÓN 01-04-2026
    PLAZO PARA PAGAR 30-04-2026
    IMPUESTOS Y DERECHOS
    1,00 VALOR ASEO $ 13.950
    SUBTOTAL $ 13.950
    IPC $ 350
    INTERÉS $ 394
    TOTAL PAGADO $ 14.694
    FECHA PAGO : 04-09-2026 13:58
    19D3BACA3F
    EMISOR : RENTAS
    CAJERO : WEBASEO
    UNIDAD : RENTAS Y FINANZAS
    97
    GLOSA DE PAGO :
    DESTINO HABITACIONAL; TARIFA NOCTURNA
    CUOTA 01 DE 2026
  `

  it('extrae los cuatro campos del giro de abril, distintos del de junio', () => {
    const r = parseAseoReceipt(COMPROBANTE_Q1)
    expect(r.ingresoNumero).toBe('2600580210')
    expect(r.totalPagado).toBe(14694)
    expect(r.plazoParaPagar).toBe('2026-04-30')
  })
})

describe('parseAseoReceipt — degradación', () => {
  it('un PDF que no es un comprobante de aseo devuelve todo en null, sin lanzar', () => {
    const r = parseAseoReceipt('Cualquier otro documento con un total de $ 10.000')
    expect(r.ingresoNumero).toBeNull()
    expect(r.totalPagado).toBeNull()
    expect(r.paidDate).toBeNull()
    expect(r.plazoParaPagar).toBeNull()
  })

  it('texto vacío no rompe', () => {
    expect(() => parseAseoReceipt('')).not.toThrow()
  })
})
