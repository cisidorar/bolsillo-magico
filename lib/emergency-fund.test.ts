import { describe, it, expect } from 'vitest'
import { countsAsEmergencyFund, emergencyFundNote, LIQUID_HORIZON_DAYS } from './emergency-fund'

const HOY = '2026-09-02'

describe('countsAsEmergencyFund', () => {
  it('un depósito ya vencido cuenta: es rescatable', () => {
    expect(countsAsEmergencyFund({ maturity_date: '2026-08-01' }, HOY)).toBe(true)
  })

  it('uno que vence hoy cuenta', () => {
    expect(countsAsEmergencyFund({ maturity_date: HOY }, HOY)).toBe(true)
  })

  // El caso que reportó Cas: sus dos DAP vencían en 4 y 34 días y la tarjeta
  // los dejaba completamente fuera, mostrando 1,7 meses cubiertos sobre $1,8M
  // cuando tenía $2,6M disponibles dentro del mes.
  it('los DAP de Cas (4 y 34 días) cuentan', () => {
    expect(countsAsEmergencyFund({ maturity_date: '2026-09-07' }, HOY)).toBe(true)
    expect(countsAsEmergencyFund({ maturity_date: '2026-10-07' }, HOY)).toBe(true)
  })

  it('justo en el borde del horizonte cuenta', () => {
    expect(countsAsEmergencyFund({ maturity_date: '2026-11-30' }, HOY)).toBe(true)  // 89 días
    expect(countsAsEmergencyFund({ maturity_date: '2026-12-01' }, HOY)).toBe(true)  // 90 días
  })

  it('pasado el horizonte deja de contar: no es plata para una emergencia', () => {
    expect(countsAsEmergencyFund({ maturity_date: '2026-12-02' }, HOY)).toBe(false) // 91 días
    expect(countsAsEmergencyFund({ maturity_date: '2028-09-02' }, HOY)).toBe(false) // 2 años
  })

  it('el horizonte es configurable', () => {
    expect(countsAsEmergencyFund({ maturity_date: '2026-10-07' }, HOY, 7)).toBe(false)
    expect(countsAsEmergencyFund({ maturity_date: '2026-09-07' }, HOY, 7)).toBe(true)
  })

  it('el horizonte por defecto son 90 días', () => {
    expect(LIQUID_HORIZON_DAYS).toBe(90)
  })
})

describe('emergencyFundNote', () => {
  it('dice en cuántos días vence', () => {
    expect(emergencyFundNote({ maturity_date: '2026-09-07' }, HOY)).toBe('vence en 5 días')
  })

  it('usa lenguaje natural para hoy y mañana', () => {
    expect(emergencyFundNote({ maturity_date: HOY }, HOY)).toBe('vence hoy')
    expect(emergencyFundNote({ maturity_date: '2026-09-03' }, HOY)).toBe('vence mañana')
  })

  it('marca los ya vencidos', () => {
    expect(emergencyFundNote({ maturity_date: '2026-08-01' }, HOY)).toBe('vencido')
  })
})
