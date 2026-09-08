import { describe, it, expect } from 'vitest'
import { isNyseWeekend, nyseHolidayLabel, isNyseTradingDay, lastNyseTradingDayOnOrBefore } from './nyse-calendar'

describe('isNyseWeekend', () => {
  it('detecta sábado y domingo', () => {
    expect(isNyseWeekend('2026-09-05')).toBe(true)   // sábado
    expect(isNyseWeekend('2026-09-06')).toBe(true)   // domingo
  })
  it('un día de semana no es fin de semana', () => {
    expect(isNyseWeekend('2026-09-04')).toBe(false)  // viernes
    expect(isNyseWeekend('2026-09-08')).toBe(false)  // martes
  })
})

describe('nyseHolidayLabel', () => {
  it('reconoce Labor Day 2026 (lunes 7 sep)', () => {
    expect(nyseHolidayLabel('2026-09-07')).toBe('Labor Day')
  })
  it('null para un día hábil cualquiera', () => {
    expect(nyseHolidayLabel('2026-09-08')).toBeNull()
  })
  it('null si el año no está cargado (degradación limpia, no lanza)', () => {
    expect(nyseHolidayLabel('2030-01-01')).toBeNull()
  })
})

describe('isNyseTradingDay', () => {
  it('viernes hábil: true', () => {
    expect(isNyseTradingDay('2026-09-04')).toBe(true)
  })
  it('fin de semana: false', () => {
    expect(isNyseTradingDay('2026-09-05')).toBe(false)
    expect(isNyseTradingDay('2026-09-06')).toBe(false)
  })
  it('feriado entre semana (Labor Day): false', () => {
    expect(isNyseTradingDay('2026-09-07')).toBe(false)
  })
  it('martes normal después del feriado: true', () => {
    expect(isNyseTradingDay('2026-09-08')).toBe(true)
  })
})

describe('lastNyseTradingDayOnOrBefore', () => {
  it('un día hábil se devuelve a sí mismo', () => {
    expect(lastNyseTradingDayOnOrBefore('2026-09-04')).toBe('2026-09-04')
  })
  it('domingo retrocede hasta el viernes', () => {
    expect(lastNyseTradingDayOnOrBefore('2026-09-06')).toBe('2026-09-04')
  })
  it('el feriado del lunes retrocede hasta el viernes anterior (salta el fin de semana también)', () => {
    expect(lastNyseTradingDayOnOrBefore('2026-09-07')).toBe('2026-09-04')
  })
})
