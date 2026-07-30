import { describe, it, expect } from 'vitest'
import { nextFomcMeeting, fedRateSentence, inflationSentence, FOMC_DECISION_DATES_2026 } from './market-week'
import { computeRatePath } from './rate-path'

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

  // M5 (roadmap macro/tasas, jul 2026): la lista se había quedado solo con
  // 2026 — desde el 9 de diciembre nextFomcMeeting() devolvía null para
  // siempre, en silencio. Este test exige que SIEMPRE haya cobertura de al
  // menos 6 meses hacia adelante desde "hoy", para que la próxima vez que se
  // venza lo diga la suite y no el silencio de la UI.
  it('la lista cubre al menos 6 meses hacia adelante desde hoy', () => {
    const today = new Date()
    const sixMonthsOut = new Date(today)
    sixMonthsOut.setMonth(sixMonthsOut.getMonth() + 6)
    const hasCoverage = FOMC_DECISION_DATES_2026.some(d => new Date(d + 'T12:00:00') >= sixMonthsOut)
    expect(hasCoverage).toBe(true)
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

  // M1 (roadmap macro/tasas, jul 2026): caso real que motivó el cambio — la
  // Fed mantiene (nivel estable) pero el mercado ya tiene precio para alzas.
  // Antes esto daba "sin presión nueva sobre las acciones", que era falso.
  const stableObs = Array.from({ length: 20 }, (_, i) => ({ date: `2026-07-${String(i + 1).padStart(2, '0')}`, value: 3.63 }))

  it('tasa estable pero el mercado espera alzas: la frase lo dice, ya no "sin presión nueva"', () => {
    const ratePath = computeRatePath(4.13, 3.63)   // +50pb
    const s = fedRateSentence(stableObs, ratePath)
    expect(s).toContain('mantiene')
    expect(s).not.toContain('sin presión nueva')
    expect(s).toContain('alza')
  })

  it('tasa estable y mercado espera bajas: viento a favor para crecimiento', () => {
    const ratePath = computeRatePath(3.13, 3.63)   // -50pb
    const s = fedRateSentence(stableObs, ratePath)
    expect(s).toContain('baja')
    expect(s).toContain('viento a favor')
  })

  it('tasa estable y ratePath también estable: mensaje sin cambios (compatibilidad)', () => {
    const ratePath = computeRatePath(3.68, 3.63)   // +5pb, ruido
    const s = fedRateSentence(stableObs, ratePath)
    expect(s).toContain('sin presión nueva')
  })

  it('sin ratePath (undefined): se comporta igual que antes', () => {
    const s = fedRateSentence(stableObs)
    expect(s).toContain('sin presión nueva')
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
