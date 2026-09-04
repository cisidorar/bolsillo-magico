import { describe, it, expect } from 'vitest'
import {
  parseUtilityBill, detectProvider, parseClDate, parseClMoney,
  detectConsumptionSpike,
} from './utility-bill-parser'

describe('parseClDate', () => {
  it('lee formato numérico', () => {
    expect(parseClDate('12/09/2026')).toBe('2026-09-12')
    expect(parseClDate('05-08-2026')).toBe('2026-08-05')
  })

  it('lee mes escrito con palabras', () => {
    expect(parseClDate('12 de septiembre de 2026')).toBe('2026-09-12')
    expect(parseClDate('12-SEP-2026')).toBe('2026-09-12')
  })

  it('expande año de dos dígitos', () => {
    expect(parseClDate('12/09/26')).toBe('2026-09-12')
  })

  it('devuelve null si no reconoce nada', () => {
    expect(parseClDate('próximamente')).toBeNull()
  })
})

describe('parseClMoney', () => {
  it('trata el punto como separador de miles, no decimal', () => {
    // 34.560 en Chile son treinta y cuatro mil, no 34,56.
    expect(parseClMoney('$ 34.560')).toBe(34560)
    expect(parseClMoney('112.345')).toBe(112345)
  })

  it('redondea a entero — todos los montos de la app son CLP enteros', () => {
    expect(parseClMoney('1.234,60')).toBe(1235)
  })

  it('devuelve null con basura', () => {
    expect(parseClMoney('n/a')).toBeNull()
  })
})

describe('detectProvider', () => {
  it('reconoce Enel', () => {
    expect(detectProvider('ENEL DISTRIBUCIÓN CHILE S.A.')).toBe('enel')
  })

  it('reconoce Aguas Andinas', () => {
    expect(detectProvider('Aguas Andinas S.A. Boleta')).toBe('aguas_andinas')
  })

  it('devuelve unknown con otro emisor', () => {
    expect(detectProvider('Metrogas boleta de gas')).toBe('unknown')
  })
})

describe('parseUtilityBill — Enel', () => {
  const BOLETA_ENEL = `
    ENEL DISTRIBUCIÓN CHILE S.A.
    N° de cliente: 3196937-9
    Período: 05/08/2026 al 04/09/2026
    Consumo del período: 187 kWh
    Saldo anterior: $ 0
    Total a pagar: $ 34.560
    Vence el 22 de septiembre de 2026
  `

  it('extrae todos los campos', () => {
    const r = parseUtilityBill(BOLETA_ENEL)
    expect(r.provider).toBe('enel')
    expect(r.kind).toBe('electricity')
    expect(r.clientNumber).toBe('3196937-9')
    expect(r.total).toBe(34560)
    expect(r.dueDate).toBe('2026-09-22')
    expect(r.periodFrom).toBe('2026-08-05')
    expect(r.periodTo).toBe('2026-09-04')
    expect(r.consumption).toBe(187)
  })

  it('conserva el saldo anterior en 0 — es un dato, no un "no encontrado"', () => {
    expect(parseUtilityBill(BOLETA_ENEL).previousBalance).toBe(0)
  })
})

describe('parseUtilityBill — Enel (formato real, no sintético)', () => {
  // Extracto real de una boleta de Enel (sep 2026): no dice "N° de cliente"
  // en ningún lado, el consumo va como "total del periodo" con "=" en vez de
  // dos puntos, y antes de esa frase ya aparecieron sub-consumos por horario
  // pegados a "kWh" que un regex ingenuo agarraría primero.
  const BOLETA_ENEL_REAL = `
    R.U.T. 96.800.570-7
    Verifique documentos en: www.sii.cl o también en: www.enel.cl
    BOLETA ELECTRÓNICA
    Nº 371721064
    3196937-9
    Fecha de emisión: 03 Jul 2026
    Tu código para inscribir
    PAC/PAT es
    PAC 31969379
    PAT 3196937-9 Fecha estimada próxima lectura 30 Jul 2026
    Fecha de vencimiento 21 Jul 2026
    Total a pagar $30.689
    Electricidad Consumida Noche (28kWh) $ 4.318
    Período de lectura:30/05/2026 - 30/06/2026
    Electricidad Consumida Día (64kWh) $ 14.096
    Electricidad Consumida Punta (33kWh) $ 9.448
    Consumo total del periodo= 125 kWh
    Saldo anterior $ 0
    Total a pagar $30.689
  `

  it('saca el N° de cliente del bloque PAT, no de un literal "N° de cliente" que no existe', () => {
    expect(parseUtilityBill(BOLETA_ENEL_REAL).clientNumber).toBe('3196937-9')
  })

  it('agarra el consumo TOTAL del período, no el primer sub-consumo por horario que aparece antes', () => {
    // El bug real: sin la frase completa, el fallback genérico /kwh/ pescaba
    // el "28" de "(28kWh)" en vez del "125" del total.
    expect(parseUtilityBill(BOLETA_ENEL_REAL).consumption).toBe(125)
  })

  it('lee vencimiento y total pese al ruido de "vencimiento" conteniendo "vence"', () => {
    const r = parseUtilityBill(BOLETA_ENEL_REAL)
    expect(r.dueDate).toBe('2026-07-21')
    expect(r.total).toBe(30689)
  })

  it('lee el período con formato "Período de lectura:DD/MM/AAAA - DD/MM/AAAA"', () => {
    const r = parseUtilityBill(BOLETA_ENEL_REAL)
    expect(r.periodFrom).toBe('2026-05-30')
    expect(r.periodTo).toBe('2026-06-30')
  })
})

describe('parseUtilityBill — Aguas Andinas', () => {
  const BOLETA_AGUAS = `
    Aguas Andinas S.A.
    N° de cliente 2502874-0
    Período: 01/08/2026 al 31/08/2026
    Consumo: 14 m3
    Total a pagar $ 18.940
    Fecha de vencimiento: 18/09/2026
  `

  it('extrae los campos y marca kind=water', () => {
    const r = parseUtilityBill(BOLETA_AGUAS)
    expect(r.provider).toBe('aguas_andinas')
    expect(r.kind).toBe('water')
    expect(r.clientNumber).toBe('2502874-0')
    expect(r.total).toBe(18940)
    expect(r.dueDate).toBe('2026-09-18')
    expect(r.consumption).toBe(14)
  })
})

describe('parseUtilityBill — Aguas Andinas (formato real, no sintético)', () => {
  // Extracto real de una boleta de Aguas Andinas (ago 2026), reproducido en
  // el ORDEN QUE unpdf REALMENTE ENTREGA — no en orden de lectura natural.
  // unpdf (el extractor usado en producción al subir el PDF) reconstruye
  // texto por columnas del PDF: cuando la boleta tiene un resumen en dos
  // columnas (etiquetas a la izquierda, valores a la derecha), unpdf primero
  // vuelca TODAS las etiquetas y recién después TODOS los valores:
  //   Total a Pagar
  //   Vencimiento
  //   Nro de cuenta
  //   $ 6.120
  //   22-AGO-2026
  //   2502874-0
  // Una primera vuelta de pruebas usó texto reconstruido a mano en orden
  // natural (como lo arma pdfplumber) y no detectó este bug — quedó al
  // subir la boleta real. El texto nunca dice "Aguas Andinas" tampoco (el
  // PDF muestra la razón social del cliente, no la del emisor).
  const BOLETA_AGUAS_REAL = `
    Timbre Electrónico SII
    Res. 58 del 2012. - Verifique documento: www.sii.cl
    CARGO FIJO 944
    CONSUMO AGUA POTABLE 3,74 2.286
    RECOLECCION AGUAS SERVIDAS 3,74 1.726
    TRATAMIENTO AGUAS SERVIDAS 3,74 1.164
    SUBTOTAL SERVICIO 6.120
    TOTAL VENTA 6.120
    TOTAL A PAGAR $ 6.120
    Ultimo pago 14-JUL-2026 $9.370
    MODALIDAD DE PRORRATEO Con reparto (Proporcional al consumo)
    FECHA ESTIMADA PRÓXIMA LECTURA 25-AGO-2026
    LECTURA ACTUAL 25-JUL-2026 461 m3
    LECTURA ANTERIOR 24-JUN-2026 458 m3
    DIFERENCIA DE LECTURAS 3 m3
    ADICIONALES POR PRORRATEO (+) 0,74 m3
    CONSUMO TOTAL 3,74 m3
    R.U.T. : 61.808.000-5
    BOLETA ELECTRÓNICA
    Nº 319628734
    Av. Presidente Balmaceda 1398 - Santiago
    2502874-0
    INMOBILIARIA LOS ALGARROBOS LIMITADA
    SANTA VICTORIA 562 B/B-*-921
    RUTA: 03.150.0550/2 MEC: 00000445-0000000
    SANTIAGO
    VENCIMIENTO TOTAL A PAGAR22-AGO-2026 $ 6.120
    Total a Pagar
    Vencimiento
    Nro de cuenta
    $ 6.120
    22-AGO-2026
    2502874-0
  `

  it('reconoce Aguas Andinas por su RUT aunque el nombre no aparezca en el texto', () => {
    expect(parseUtilityBill(BOLETA_AGUAS_REAL).provider).toBe('aguas_andinas')
  })

  it('saca la cuenta del bloque "Total a Pagar / Vencimiento / Nro de cuenta" reordenado por columnas, no del "2502874-0" suelto que aparece antes sin etiqueta', () => {
    expect(parseUtilityBill(BOLETA_AGUAS_REAL).clientNumber).toBe('2502874-0')
  })

  it('lee "VENCIMIENTOTOTAL A PAGAR22-AGO-2026 $ 6.120" pegado, sin espacio antes de la fecha', () => {
    const r = parseUtilityBill(BOLETA_AGUAS_REAL)
    expect(r.dueDate).toBe('2026-08-22')
    expect(r.total).toBe(6120)
  })

  it('agarra el consumo TOTAL, no el sub-consumo "3,74 2.286" que aparece antes', () => {
    expect(parseUtilityBill(BOLETA_AGUAS_REAL).consumption).toBe(3.74)
  })

  it('conserva el decimal del consumo de agua — redondear perdería el prorrateo real', () => {
    // A diferencia de los montos CLP (siempre enteros), 3,74 m3 no debe
    // convertirse en 4.
    expect(parseUtilityBill(BOLETA_AGUAS_REAL).consumption).not.toBe(4)
  })

  it('deriva el período de las fechas de lectura cuando no hay frase "período"', () => {
    const r = parseUtilityBill(BOLETA_AGUAS_REAL)
    expect(r.periodFrom).toBe('2026-06-24')
    expect(r.periodTo).toBe('2026-07-25')
  })
})

describe('parseUtilityBill — degradación', () => {
  it('un emisor desconocido devuelve todo en null, sin lanzar', () => {
    const r = parseUtilityBill('Boleta de gas Metrogas. Total a pagar: $ 20.000')
    expect(r.provider).toBe('unknown')
    expect(r.kind).toBeNull()
    // No adivina el total aunque el texto lo tenga: sin proveedor reconocido
    // no hay certeza de qué representa ese número.
    expect(r.total).toBeNull()
  })

  it('un PDF reconocido pero incompleto deja en null solo lo que falta', () => {
    const r = parseUtilityBill('ENEL DISTRIBUCIÓN\nTotal a pagar: $ 12.000')
    expect(r.provider).toBe('enel')
    expect(r.total).toBe(12000)
    expect(r.dueDate).toBeNull()
    expect(r.clientNumber).toBeNull()
  })

  it('texto vacío no rompe', () => {
    expect(() => parseUtilityBill('')).not.toThrow()
  })
})

describe('detectConsumptionSpike', () => {
  it('detecta un salto sobre 40% del promedio', () => {
    // Promedio 12 m³, esta boleta 20 → +66%: posible filtración.
    const r = detectConsumptionSpike(20, [12, 11, 13])
    expect(r.isSpike).toBe(true)
    expect(r.avg).toBe(12)
    expect(r.pctAbove).toBeCloseTo(0.667, 2)
  })

  it('no alarma con variación normal', () => {
    expect(detectConsumptionSpike(14, [12, 13, 12]).isSpike).toBe(false)
  })

  it('no alarma si el consumo bajó', () => {
    expect(detectConsumptionSpike(8, [12, 13, 12]).isSpike).toBe(false)
  })

  it('exige al menos 2 períodos previos — con uno cualquier mes daría falsa alarma', () => {
    expect(detectConsumptionSpike(30, [10]).isSpike).toBe(false)
    expect(detectConsumptionSpike(30, []).isSpike).toBe(false)
  })

  it('ignora períodos en cero al promediar', () => {
    // Un mes sin lectura no debe hundir el promedio y disparar la alerta.
    const r = detectConsumptionSpike(14, [12, 13, 0])
    expect(r.avg).toBe(13)
    expect(r.isSpike).toBe(false)
  })
})
