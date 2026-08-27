import { describe, it, expect } from 'vitest'
import { parsePayslipText } from './payslip-parser'

// Texto simulando lo que extraería una librería de PDF-a-texto (pdf.js) del
// layout real de la liquidación: multi-columna, con "Label: valor" y líneas
// de tabla "Label $ monto" (a veces con ":", a veces sin). El orden y el
// espaciado imitan cómo el layout se vería aplanado a texto plano.
const SAMPLE = `
Liquidación de Sueldo
Empleador: Asesoría, Consultoría y Desarrollo FIAH SpA (76.211.029-6)
Mes: Enero 2026

Sr(a): Riquelme Zamora, Catalina Isidora     Tipo Contrato: Indefinido     Previsión: Uno (10.46%)
RUT: 20.642.812-0     Inicio Contrato: 27 enero 2026     Salud: Colmena 3.246 UF (100.0%)
Cargo: Data Engineer     Días Trabajados: 5 días     UF: $ 39.706,07

Sueldo Base: $ 2.154.149

HABERES IMPONIBLES $ 448.781     DESCUENTOS LEGALES $ 81.050
Sueldo Base $ 359.025     Cotiz. Previ. Obligatoria $ 46.942
Gratificación $ 89.756     Cotiz. Salud Obligatoria $ 31.415
     Seguro Cesantía $ 2.693
HABERES NO IMPONIBLES $ 66.666
Colación $ 33.333     OTROS DESCUENTOS $ 0
Movilización $ 33.333

TOTAL HABERES $ 515.447     TOTAL DESCUENTOS $ 81.050

IMP. PREV./SALUD: $ 448.781     IMP. CESANTÍA: $ 448.781     BASE TRIBUTABLE: $ 367.731

LÍQUIDO A RECIBIR: $ 434.397
`

describe('parsePayslipText', () => {
  const parsed = parsePayslipText(SAMPLE)

  it('extrae mes y año', () => {
    expect(parsed.month).toBe(1)
    expect(parsed.year).toBe(2026)
  })

  it('extrae empleador y RUT', () => {
    expect(parsed.employerName).toBe('Asesoría, Consultoría y Desarrollo FIAH SpA')
    expect(parsed.employerRut).toBe('76.211.029-6')
  })

  it('extrae datos del trabajador', () => {
    expect(parsed.employeeName).toBe('Riquelme Zamora, Catalina Isidora')
    expect(parsed.employeeRut).toBe('20.642.812-0')
    expect(parsed.position).toBe('Data Engineer')
    expect(parsed.contractType).toBe('Indefinido')
    expect(parsed.contractStart).toBe('2026-01-27')
    expect(parsed.daysWorked).toBe(5)
    expect(parsed.ufValue).toBeCloseTo(39706.07, 2)
  })

  it('extrae haberes imponibles', () => {
    expect(parsed.haberesImponibles).toEqual([
      { label: 'Sueldo Base', amount: 359025 },
      { label: 'Gratificación', amount: 89756 },
    ])
  })

  it('extrae haberes no imponibles', () => {
    expect(parsed.haberesNoImponibles).toEqual([
      { label: 'Colación', amount: 33333 },
      { label: 'Movilización', amount: 33333 },
    ])
  })

  it('extrae descuentos legales', () => {
    expect(parsed.descuentosLegales).toEqual([
      { label: 'Cotiz. Previ. Obligatoria', amount: 46942 },
      { label: 'Cotiz. Salud Obligatoria', amount: 31415 },
      { label: 'Seguro Cesantía', amount: 2693 },
    ])
  })

  it('no agrega otros descuentos cuando el total es $0', () => {
    expect(parsed.otrosDescuentos).toEqual([])
  })

  it('extrae totales y líquido', () => {
    expect(parsed.totalHaberes).toBe(515447)
    expect(parsed.totalDescuentos).toBe(81050)
    expect(parsed.liquido).toBe(434397)
  })
})

describe('parsePayslipText — con otros descuentos > 0', () => {
  it('agrega la línea cuando el total es mayor a 0', () => {
    const parsed = parsePayslipText(SAMPLE.replace('OTROS DESCUENTOS $ 0', 'OTROS DESCUENTOS $ 15.000'))
    expect(parsed.otrosDescuentos).toEqual([{ label: 'Otros descuentos', amount: 15000 }])
  })
})
