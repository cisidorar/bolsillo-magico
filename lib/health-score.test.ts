import { describe, it, expect } from 'vitest'
import { computeHealthScore, type HealthScoreInputs } from './health-score'

// Base "todo sano" — cada test parte de acá y sobreescribe solo lo que evalúa,
// para que cada caso quede aislado de los demás campos.
const base: HealthScoreInputs = {
  scoreRate: 25,
  monthlyInvestGoal: 1_000_000,
  investedThisMonth: 1_000_000,
  isCurrentMonth: false,
  dayOfMonth: 30,
  daysInMonth: 30,
  monthsCovered: 6,
  commitRatio: 10,
  numExcedidas: 0,
  projection: null,
  effectiveBudget: null,
  projInflatedByTop: false,
}

describe('computeHealthScore', () => {
  it('puntaje máximo con todas las señales en verde', () => {
    const r = computeHealthScore(base)
    expect(r.total).toBe(100)
    expect(r.label).toBe('Buena salud')
  })

  it('sin ningún dato registrado da un puntaje neutral, no cero', () => {
    const r = computeHealthScore({
      ...base,
      scoreRate: null, monthlyInvestGoal: null, investedThisMonth: 0,
      monthsCovered: null, commitRatio: null,
    })
    // 12 (ahorro neutral) + 8 (aporte neutral) + 10 (fondo neutral) + 10 (deuda neutral) + 25 (disciplina, sin excedidas)
    expect(r.total).toBe(65)
    expect(r.total).toBeGreaterThan(0)
  })

  it('cumplir la meta de aporte completa suma los 15 puntos', () => {
    const met = computeHealthScore({ ...base, investedThisMonth: 1_000_000 })
    const notMet = computeHealthScore({ ...base, investedThisMonth: 0 })
    expect(met.sAporte).toBe(15)
    expect(notMet.sAporte).toBe(0)
    expect(met.total - notMet.total).toBe(15)
  })

  it('mes en curso: prorratea la meta según el día del mes (no exige el 100% a mitad de mes)', () => {
    // Día 15 de 30, invirtió la mitad de la meta → cumple el ritmo esperado
    const r = computeHealthScore({
      ...base, isCurrentMonth: true, dayOfMonth: 15, daysInMonth: 30, investedThisMonth: 500_000,
    })
    expect(r.aporteRatio).toBeCloseTo(1, 5)
    expect(r.sAporte).toBe(15)
  })

  it('mes en curso sin aportar aún, a mitad de mes, no cumple el ritmo', () => {
    const r = computeHealthScore({
      ...base, isCurrentMonth: true, dayOfMonth: 15, daysInMonth: 30, investedThisMonth: 0,
    })
    expect(r.sAporte).toBe(0)
  })

  it('sin meta definida, el aporte no penaliza (neutral)', () => {
    const r = computeHealthScore({ ...base, monthlyInvestGoal: null, investedThisMonth: 0 })
    expect(r.aporteRatio).toBeNull()
    expect(r.sAporte).toBe(8)
  })

  it('categorías excedidas bajan la señal de disciplina', () => {
    const r0 = computeHealthScore({ ...base, numExcedidas: 0 })
    const r1 = computeHealthScore({ ...base, numExcedidas: 1 })
    const r3 = computeHealthScore({ ...base, numExcedidas: 3 })
    expect(r0.sDisciplina).toBe(25)
    expect(r1.sDisciplina).toBeLessThan(r0.sDisciplina)
    expect(r3.sDisciplina).toBeLessThan(r1.sDisciplina)
  })

  it('proyección sobre el presupuesto EFECTIVO castiga disciplina, salvo que la infle una compra única', () => {
    const over = computeHealthScore({ ...base, projection: 1_500_000, effectiveBudget: 1_000_000, projInflatedByTop: false })
    const overButOneOff = computeHealthScore({ ...base, projection: 1_500_000, effectiveBudget: 1_000_000, projInflatedByTop: true })
    expect(over.sDisciplina).toBe(18) // 25 - 7
    expect(overButOneOff.sDisciplina).toBe(25) // no castiga: es una compra atípica
  })

  it('el presupuesto efectivo (disponible tras la meta) es más estricto que un budget global holgado', () => {
    // Presupuesto global amplio ($2M) pero el disponible real tras invertir es $1M:
    // gastar $1.3M no excede el budget global, pero sí el disponible real.
    const r = computeHealthScore({ ...base, projection: 1_300_000, effectiveBudget: 1_000_000 })
    expect(r.sDisciplina).toBeLessThan(25)
  })

  it('fondo de emergencia bajo + meta de aporte cumplida sugiere desviar el próximo aporte a ahorro', () => {
    const r = computeHealthScore({ ...base, monthsCovered: 1.5, investedThisMonth: 1_000_000 })
    expect(r.suggestDivertToSavings).toBe(true)
  })

  it('no sugiere desviar a ahorro si el aporte de este mes no se cumplió', () => {
    const r = computeHealthScore({ ...base, monthsCovered: 1.5, investedThisMonth: 0 })
    expect(r.suggestDivertToSavings).toBe(false)
  })

  it('no sugiere desviar a ahorro si el fondo ya está en zona segura (≥3 meses)', () => {
    const r = computeHealthScore({ ...base, monthsCovered: 4, investedThisMonth: 1_000_000 })
    expect(r.suggestDivertToSavings).toBe(false)
  })

  it('las 5 señales siempre suman el total (pesos: 20+15+20+20+25=100)', () => {
    const r = computeHealthScore({ ...base, scoreRate: -20, monthsCovered: 0.5, commitRatio: 50, numExcedidas: 4, investedThisMonth: 0 })
    expect(r.sAhorro + r.sAporte + r.sFondo + r.sCompromiso + r.sDisciplina).toBe(r.total)
  })

  it('etiquetas de salud en los umbrales correctos', () => {
    expect(computeHealthScore({ ...base }).label).toBe('Buena salud') // 100
    expect(computeHealthScore({
      ...base, scoreRate: 5, monthsCovered: 2, commitRatio: 30, numExcedidas: 1,
    }).label).not.toBe('Alerta')
    expect(computeHealthScore({
      ...base, scoreRate: -20, monthlyInvestGoal: null, investedThisMonth: 0,
      monthsCovered: 0, commitRatio: 60, numExcedidas: 4,
    }).label).toBe('Alerta')
  })
})
