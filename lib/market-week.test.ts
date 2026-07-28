import { describe, it, expect } from 'vitest'
import { nextFomcMeeting, fedRateSentence, inflationSentence, FOMC_DECISION_DATES_2026 } from './market-week'

describe('nextFomcMeeting', () => {
  it('encuentra una reunión dentro de la ventana', () => {
    expect(nextFomcMeeting('2026-07-25', 7, FOMC_DECISION_DATES_2026)).toBe('2026-07-29')
  })

  it('devuelve null si la próxima reunión queda fuera de la ventana', () => {
    expect(nextFomcMeeting('2026-08-01', 7, FOMC_DECISION_DATES_2026)).toBeNull()
  })

  it('no cuenta reuniones ya pasadas', () => {
    expect(nextFomcMeeting('2026-07-30', 50, FOMC_DECISION_DATES_2026)).toBe('2026-09-16')
  })

  it('el día exacto de la reunión cuenta como "dentro de la ventana"', () => {
    expect(nextFomcMeeting('2026-07-29', 0, FOMC_DECISION_DATES_2026)).toBe('2026-07-29')
  })
})

describe('fedRateSentence', () => {
  it('sin datos, no hay frase', () => {
    expect(fedRateSentence([])).toBeNull()
  })

  it('tasa estable en la ventana: mensaje de estabilidad', () => {
    const obs = Array.from({ length: 20 }, (_, i) => ({ date: `2026-07-${String(i + 1).padStart(2, '0')}`, value: 4.25 }))
    const s = fedRateSentence(obs)
    expect(s).toContain('mantiene')
    expect(s).toContain('4.25%')
  })

  it('tasa cambió dentro de la ventana: mensaje de cambio reciente', () => {
    const obs = [
      { date: '2026-07-01', value: 4.50 },
      { date: '2026-07-15', value: 4.50 },
      { date: '2026-07-20', value: 4.25 },
    ]
    const s = fedRateSentence(obs)
    expect(s).toContain('movió')
    expect(s).toContain('4.25%')
  })
})

describe('inflationSentence', () => {
  it('sin historia suficiente, no hay frase', () => {
    expect(inflationSentence([{ date: '2026-06-01', value: 300 }])).toBeNull()
  })

  it('inflación bajando: lo dice explícito', () => {
    // Índice CPI creciendo más lento en el último trimestre que un año atrás
    const obs: { date: string; value: number }[] = []
    // año base: crecimiento fuerte
    for (let m = 0; m < 12; m++) obs.push({ date: `2025-${String(m + 1).padStart(2, '0')}-01`, value: 300 * Math.pow(1.004, m) })
    // últimos 6 meses: crecimiento más lento (yoy baja)
    for (let m = 12; m < 18; m++) obs.push({ date: `2026-${String(m - 11).padStart(2, '0')}-01`, value: 300 * Math.pow(1.004, 11) * Math.pow(1.001, m - 11) })
    const s = inflationSentence(obs)
    expect(s).toContain('bajando')
  })

  it('inflación estable: mensaje neutro sin dirección', () => {
    const obs = Array.from({ length: 24 }, (_, m) => ({ date: `${2024 + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}-01`, value: 300 * Math.pow(1.002, m) }))
    const s = inflationSentence(obs)
    expect(s).toContain('estable')
  })
})
