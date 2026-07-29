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

  it('verdict "no" cuando el flujo de 30 días queda negativo — coral', () => {
    const r = evaluateAffordability(base({ amount: 50000, cashFlowMin: 30000 }))
    expect(r.verdict).toBe('no')
    expect(r.reasons.some(x => x.text.includes('negativo'))).toBe(true)
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

  it('cuotas: agrega razón de compromiso mensual con el mes de término', () => {
    const r = evaluateAffordability(base({
      amount: 300000, installments: 6, releaseLabel: 'marzo',
      budgetRemaining: 200000, cashFlowMin: 150000,
    }))
    expect(r.immediateImpact).toBe(50000)  // 300000/6
    const commitReason = r.reasons.find(x => x.text.includes('compromiso'))
    expect(commitReason?.text).toContain('marzo')
    expect(commitReason?.text).toContain('50.000')
  })

  it('cuotas que empujan el compromiso a ≥40% del ingreso quedan gold', () => {
    const r = evaluateAffordability(base({
      amount: 240000, installments: 6, releaseLabel: 'marzo',
      income: 500000, monthlyCommitted: 150000,  // 150000+40000=190000 → 38%... ajustar
    }))
    // 240000/6 = 40000; (150000+40000)/500000 = 38% → no llega a 40, probamos el borde real:
    const r2 = evaluateAffordability(base({
      amount: 240000, installments: 6, releaseLabel: 'marzo',
      income: 475000, monthlyCommitted: 150000,  // (150000+40000)/475000 = 40%
    }))
    expect(r2.reasons.find(x => x.text.includes('compromiso'))?.severity).toBe('gold')
    expect(r.reasons.find(x => x.text.includes('compromiso'))?.severity).toBe('mint')
  })

  it('cuotas sin ingreso registrado: razón mint, no penaliza por falta de dato', () => {
    const r = evaluateAffordability(base({ amount: 120000, installments: 4, income: null, releaseLabel: 'octubre' }))
    expect(r.reasons.find(x => x.text.includes('compromiso'))?.severity).toBe('mint')
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
