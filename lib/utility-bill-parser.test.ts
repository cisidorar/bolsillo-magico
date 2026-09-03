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
