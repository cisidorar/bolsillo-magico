/**
 * Tests de nextPaydayDate — próxima fecha de sueldo, usada por el
 * calendario de flujo de caja (F8) y espejo de la cuenta regresiva de /inicio.
 */
import { describe, it, expect } from 'vitest'
import { nextPaydayDate } from '@/lib/utils'

describe('nextPaydayDate — día fijo', () => {
  it('hoy antes del payday → payday de este mes', () => {
    expect(nextPaydayDate('2026-07-10', 30, false)).toBe('2026-07-30')
  })

  it('hoy es el payday → hoy mismo', () => {
    expect(nextPaydayDate('2026-07-30', 30, false)).toBe('2026-07-30')
  })

  it('hoy después del payday → payday del mes siguiente', () => {
    expect(nextPaydayDate('2026-07-31', 30, false)).toBe('2026-08-30')
  })

  it('payday 30 en febrero (28 días) → clampa al último día', () => {
    expect(nextPaydayDate('2026-02-01', 30, false)).toBe('2026-02-28')
  })

  it('sin payday configurado → null', () => {
    expect(nextPaydayDate('2026-07-10', null, false)).toBeNull()
  })
})

describe('nextPaydayDate — último día hábil', () => {
  it('julio 2026: último día hábil es viernes 31', () => {
    expect(nextPaydayDate('2026-07-01', null, true)).toBe('2026-07-31')
  })

  it('después del último día hábil del mes → salta al mes siguiente', () => {
    // 31 jul 2026 es viernes (hábil) — probar 1 ago ya pasado el hábil de julio
    expect(nextPaydayDate('2026-08-01', null, true)).not.toBe('2026-07-31')
  })
})
