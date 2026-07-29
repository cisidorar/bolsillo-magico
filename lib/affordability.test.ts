import { describe, it, expect } from 'vitest'
import { evaluateAffordability, type AffordabilityInput } from './affordability'

const base = (over: Partial<AffordabilityInput> = {}): AffordabilityInput => ({
  amount: 50000,
  installments: 1,
  budgetRemaining: 200000,
  cashFlowMin: 150000,
  cashFlowMinLabel: '14 de agosto',
  income: 800000,
  monthlyCommitted: 100000,
  monthlyInvestGoal: null,
  releaseLabel: null,
  ...over,
})

describe('evaluateAffordability', () => {
  it('verdict "yes" con margen amplio en todo, sin razones', () => {
    const r = evaluateAffordability(base())
    expect(r.verdict).toBe('yes')
    expect(r.reasons).toHaveLength(0)
    expect(r.immediateImpact).toBe(50000)
  })

  it('verdict "no" cuando se pasa del presupuesto — coral', () => {
    const r = evaluateAffordability(base({ amount: 250000, budgetRemaining: 200000 }))
    expect(r.verdict).toBe('no')
    expect(r.reasons.some(x => x.severity === 'coral' && x.text.includes('presupuesto'))).toBe(true)
  })

  it('verdict "tight" cuando usa ≥70% del presupuesto restante — gold', () => {
    const r = evaluateAffordability(base({ amount: 150000, budgetRemaining: 200000 }))  // 75%
    expect(r.verdict).toBe('tight')
    expect(r.budgetPctUsed).toBe(75)
    expect(r.reasons.some(x => x.severity === 'gold')).toBe(true)
  })

  it('verdict "tight" cuando el flujo de 30 días queda negativo — gold, no bloquea (riesgo de timing, no de solvencia)', () => {
    const r = evaluateAffordability(base({ amount: 50000, cashFlowMin: 30000 }))
    expect(r.verdict).toBe('tight')
    expect(r.reasons.find(x => x.text.includes('negativo'))?.severity).toBe('gold')
  })

  it('verdict "tight" cuando el flujo de 30 días queda justo pero no negativo — gold', () => {
    const r = evaluateAffordability(base({ amount: 50000, cashFlowMin: 60000 }))  // queda en 10.000
    expect(r.verdict).toBe('tight')
    expect(r.reasons.some(x => x.text.includes('justo'))).toBe(true)
  })

  it('sin presupuesto ni flujo definidos, no arroja esas razones (datos ausentes, no penaliza)', () => {
    const r = evaluateAffordability(base({ budgetRemaining: null, cashFlowMin: null }))
    expect(r.reasons).toHaveLength(0)
    expect(r.verdict).toBe('yes')
  })

  it('cuotas: agrega razón de disponible con el mes de término', () => {
    const r = evaluateAffordability(base({
      amount: 300000, installments: 6, releaseLabel: 'marzo',
      budgetRemaining: 200000, cashFlowMin: 150000,
    }))
    expect(r.immediateImpact).toBe(50000)  // 300000/6
    const reason = r.reasons.find(x => x.text.includes('disponible'))
    expect(reason?.text).toContain('marzo')
    expect(reason?.text).toContain('50.000')
  })

  it('disponible tras meta de ahorro: si la cuota no cabe, coral con el monto que se pasa', () => {
    // income 2.300.000 - meta ahorro 1.000.000 - comprometido 200.000 = disponible 1.100.000
    // cuota de 559.990/3 ≈ 186.663 → cabe holgado; forzamos un caso que SÍ se pase.
    const r = evaluateAffordability(base({
      amount: 3600000, installments: 3, releaseLabel: 'octubre',
      income: 2300000, monthlyCommitted: 200000, monthlyInvestGoal: 1000000,
    }))
    // immediateImpact = 1.200.000; disponible = 2.300.000-1.000.000-200.000 = 1.100.000 → se pasa por 100.000
    const reason = r.reasons.find(x => x.text.includes('disponible'))
    expect(reason?.severity).toBe('coral')
    expect(reason?.text).toContain('100.000')
    expect(r.verdict).toBe('no')
  })

  it('disponible tras meta de ahorro: caso real del usuario (2.3M sueldo, 1M ahorro, 200k fijos, cuota 186.663) cabe — mint', () => {
    const r = evaluateAffordability(base({
      amount: 559990, installments: 3, releaseLabel: 'octubre',
      income: 2300000, monthlyCommitted: 200000, monthlyInvestGoal: 1000000,
      budgetRemaining: null, cashFlowMin: null,
    }))
    const reason = r.reasons.find(x => x.text.includes('disponible'))
    expect(reason?.severity).toBe('mint')
    expect(reason?.text).toContain('ahorrar $1.000.000')
    expect(r.verdict).toBe('yes')
  })

  it('cuotas sin ingreso registrado: no arroja razón de disponible, no penaliza por falta de dato', () => {
    const r = evaluateAffordability(base({ amount: 120000, installments: 4, income: null, releaseLabel: 'octubre' }))
    expect(r.reasons.find(x => x.text.includes('disponible'))).toBeUndefined()
  })

  it('sin meta de ahorro definida (null), el chequeo de disponible corre igual sin el sufijo de meta', () => {
    const r = evaluateAffordability(base({
      amount: 300000, installments: 6, releaseLabel: 'marzo',
      income: 800000, monthlyCommitted: 100000, monthlyInvestGoal: null,
    }))
    const reason = r.reasons.find(x => x.text.includes('disponible'))
    expect(reason?.severity).toBe('mint')
    expect(reason?.text).not.toContain('ahorrar')
  })

  it('la peor severidad entre varias razones manda el veredicto (coral gana sobre gold)', () => {
    const r = evaluateAffordability(base({
      amount: 999999,           // se pasa del presupuesto → coral
      budgetRemaining: 200000,
      cashFlowMin: 300000,      // holgado → no dispara nada acá
    }))
    expect(r.verdict).toBe('no')
  })
})
