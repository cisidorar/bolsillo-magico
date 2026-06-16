/**
 * Tests de lógica de facturación (billing period).
 * Cubre el caso de uso crítico: asignar un gasto al mes de estado de cuenta correcto
 * según el día de corte de la tarjeta de crédito.
 */
import { describe, it, expect } from 'vitest'
import { billingPeriod } from '@/lib/utils'

describe('billingPeriod — lógica de asignación de estado de cuenta', () => {
  /**
   * Escenario: tarjeta con corte el 5 de cada mes
   *
   *  Compra del 1 al 5  → estado del MES DE COMPRA
   *  Compra del 6 al 31 → estado del MES SIGUIENTE
   */
  describe('corte día 5', () => {
    it('compra el 1ro → estado del mismo mes', () => {
      expect(billingPeriod('2026-06-01', 5)).toEqual({ month: 6, year: 2026 })
    })

    it('compra el 5 (último día antes del corte siguiente) → mismo mes', () => {
      expect(billingPeriod('2026-06-05', 5)).toEqual({ month: 6, year: 2026 })
    })

    it('compra el 6 → mes siguiente', () => {
      expect(billingPeriod('2026-06-06', 5)).toEqual({ month: 7, year: 2026 })
    })

    it('compra el último día del mes → mes siguiente', () => {
      expect(billingPeriod('2026-06-30', 5)).toEqual({ month: 7, year: 2026 })
    })

    it('cruce de año: diciembre 6 → enero año siguiente', () => {
      expect(billingPeriod('2026-12-06', 5)).toEqual({ month: 1, year: 2027 })
    })

    it('diciembre 5 (en el corte) → diciembre mismo año', () => {
      expect(billingPeriod('2026-12-05', 5)).toEqual({ month: 12, year: 2026 })
    })
  })

  /**
   * Escenario: tarjeta con corte el 28 (caso borde — último día posible configurado)
   * Los gastos del 1 al 28 → estado del mes de compra
   * Los gastos del 29 al 31 → estado del mes siguiente
   */
  describe('corte día 28', () => {
    it('compra el 1 → mismo mes', () => {
      expect(billingPeriod('2026-05-01', 28)).toEqual({ month: 5, year: 2026 })
    })

    it('compra el 28 → mismo mes', () => {
      expect(billingPeriod('2026-05-28', 28)).toEqual({ month: 5, year: 2026 })
    })

    it('compra el 29 → mes siguiente', () => {
      expect(billingPeriod('2026-05-29', 28)).toEqual({ month: 6, year: 2026 })
    })

    it('compra el 31 → mes siguiente', () => {
      expect(billingPeriod('2026-01-31', 28)).toEqual({ month: 2, year: 2026 })
    })
  })

  /**
   * Escenario: débito, efectivo o digital sin día de corte (billingDay = null)
   * Siempre retorna el mes de la compra.
   */
  describe('sin día de corte (débito/efectivo)', () => {
    it('cualquier compra pertenece a su mes de compra', () => {
      expect(billingPeriod('2026-06-30', null)).toEqual({ month: 6, year: 2026 })
      expect(billingPeriod('2026-01-01', null)).toEqual({ month: 1, year: 2026 })
      expect(billingPeriod('2026-12-31', null)).toEqual({ month: 12, year: 2026 })
    })
  })

  /**
   * Escenario de filtrado multi-mes:
   * En la vista "Por facturación", el backend trae ±1 mes y remapea.
   * Este test verifica que los gastos de distintas fechas se mapean correctamente.
   */
  describe('rango multi-mes → clasificación correcta', () => {
    const corte = 15

    const gastos = [
      { date: '2026-05-10', esperado: { month: 5, year: 2026 } },  // antes del corte mayo → mayo
      { date: '2026-05-20', esperado: { month: 6, year: 2026 } },  // después del corte mayo → junio
      { date: '2026-06-01', esperado: { month: 6, year: 2026 } },  // antes del corte junio → junio
      { date: '2026-06-15', esperado: { month: 6, year: 2026 } },  // en el corte junio → junio
      { date: '2026-06-16', esperado: { month: 7, year: 2026 } },  // después del corte junio → julio
    ]

    gastos.forEach(({ date, esperado }) => {
      it(`${date} con corte ${corte} → mes ${esperado.month}/${esperado.year}`, () => {
        expect(billingPeriod(date, corte)).toEqual(esperado)
      })
    })
  })
})
