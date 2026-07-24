/**
 * Tests de statementDueDate — fecha de vencimiento de pago de un estado de
 * cuenta ya cerrado. Usado por la card "Ciclo de sueldo" en /inicio.
 */
import { describe, it, expect } from 'vitest'
import { statementDueDate } from '@/lib/utils'

describe('statementDueDate — vencimiento del mes siguiente al estado', () => {
  it('estado de julio, vence el 5 → 5 de agosto', () => {
    expect(statementDueDate(7, 2026, 5)).toBe('2026-08-05')
  })

  it('estado de diciembre → vence en enero del año siguiente', () => {
    expect(statementDueDate(12, 2026, 5)).toBe('2027-01-05')
  })

  it('clampa al último día real del mes de vencimiento (ej: 31 en febrero)', () => {
    expect(statementDueDate(1, 2026, 31)).toBe('2026-02-28')
  })

  it('clampa al último día real en un mes de 30 días (ej: 31 en abril)', () => {
    expect(statementDueDate(3, 2026, 31)).toBe('2026-04-30')
  })

  it('vencimiento a inicio de mes (día 1)', () => {
    expect(statementDueDate(6, 2026, 1)).toBe('2026-07-01')
  })
})
