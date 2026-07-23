import { describe, it, expect } from 'vitest'
import { businessDaysUntil } from './earnings'

describe('businessDaysUntil', () => {
  it('fecha es hoy → 0', () => {
    expect(businessDaysUntil('2026-07-22', '2026-07-22')).toBe(0)   // miércoles
  })

  it('fecha es mañana (día hábil) → 1', () => {
    expect(businessDaysUntil('2026-07-23', '2026-07-22')).toBe(1)   // jueves
  })

  it('fecha cruza un fin de semana → no cuenta sábado/domingo', () => {
    // 2026-07-22 es miércoles; el próximo lunes 2026-07-27 debería dar 3
    // (jue, vie, [sáb, dom no cuentan], lun)
    expect(businessDaysUntil('2026-07-27', '2026-07-22')).toBe(3)
  })

  it('fecha pasada → null', () => {
    expect(businessDaysUntil('2026-07-20', '2026-07-22')).toBeNull()
  })

  it('sin fecha → null', () => {
    expect(businessDaysUntil(null, '2026-07-22')).toBeNull()
  })

  it('fecha inválida → null', () => {
    expect(businessDaysUntil('no-es-una-fecha', '2026-07-22')).toBeNull()
  })
})
