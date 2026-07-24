import { describe, it, expect } from 'vitest'
import { projectWealth, buildWealthProjectionTable } from './wealth-projection'

describe('projectWealth', () => {
  it('sin meses, devuelve el principal tal cual', () => {
    expect(projectWealth({ principal: 1_000_000, monthlyContribution: 100_000, annualReturnPct: 7, months: 0 })).toBe(1_000_000)
  })

  it('retorno 0%: es solo la suma de aportes (sin interés compuesto)', () => {
    const fv = projectWealth({ principal: 1_000_000, monthlyContribution: 100_000, annualReturnPct: 0, months: 12 })
    expect(fv).toBe(1_000_000 + 100_000 * 12)
  })

  it('sin aporte mensual, crece solo el principal al retorno compuesto', () => {
    const fv = projectWealth({ principal: 1_000_000, monthlyContribution: 0, annualReturnPct: 7, months: 12 })
    // (1+7%)^1 aplicado sobre 1M ≈ 1.07M
    expect(fv).toBeGreaterThan(1_060_000)
    expect(fv).toBeLessThan(1_080_000)
  })

  it('a más años, el valor futuro crece (interés compuesto hace su trabajo)', () => {
    const fv1  = projectWealth({ principal: 0, monthlyContribution: 1_000_000, annualReturnPct: 7, months: 12 })
    const fv5  = projectWealth({ principal: 0, monthlyContribution: 1_000_000, annualReturnPct: 7, months: 60 })
    const fv10 = projectWealth({ principal: 0, monthlyContribution: 1_000_000, annualReturnPct: 7, months: 120 })
    expect(fv5).toBeGreaterThan(fv1 * 4) // más que lineal por el interés compuesto
    expect(fv10).toBeGreaterThan(fv5 * 1.8)
  })

  it('a mayor retorno anual, el valor futuro es mayor (mismo principal y aporte)', () => {
    const low  = projectWealth({ principal: 1_000_000, monthlyContribution: 1_000_000, annualReturnPct: 5, months: 120 })
    const mid  = projectWealth({ principal: 1_000_000, monthlyContribution: 1_000_000, annualReturnPct: 7, months: 120 })
    const high = projectWealth({ principal: 1_000_000, monthlyContribution: 1_000_000, annualReturnPct: 10, months: 120 })
    expect(mid).toBeGreaterThan(low)
    expect(high).toBeGreaterThan(mid)
  })

  it('principal negativo (deuda neta) se proyecta igual, puede partir bajo cero', () => {
    const fv = projectWealth({ principal: -500_000, monthlyContribution: 1_000_000, annualReturnPct: 7, months: 12 })
    expect(fv).toBeGreaterThan(0) // los aportes de un año ya compensan la deuda inicial
  })

  it('caso real Cas: $1M/mes durante 10 años a 7% supera los $170M', () => {
    // Aportado sin rendimiento: $120M. Con 7% real compuesto, el interés
    // agrega ~$50M extra sobre lo aportado — el efecto que la card debe mostrar.
    const fv = projectWealth({ principal: 0, monthlyContribution: 1_000_000, annualReturnPct: 7, months: 120 })
    expect(fv).toBeGreaterThan(170_000_000)
    expect(fv).toBeGreaterThan(1_000_000 * 120) // más que el aporte plano: el interés compuesto suma
  })
})

describe('buildWealthProjectionTable', () => {
  it('arma 3 escenarios × 3 horizontes por defecto', () => {
    const table = buildWealthProjectionTable(5_000_000, 1_000_000)
    expect(table.scenarios).toHaveLength(3)
    expect(table.scenarios[0].values).toHaveLength(3)
    expect(table.scenarios.map(s => s.annualReturnPct)).toEqual([5, 7, 10])
    expect(table.scenarios[0].values.map(v => v.years)).toEqual([1, 5, 10])
  })

  it('a mismo horizonte, el escenario de mayor retorno proyecta más patrimonio', () => {
    const table = buildWealthProjectionTable(5_000_000, 1_000_000)
    const at10y = table.scenarios.map(s => s.values.find(v => v.years === 10)!.futureValue)
    expect(at10y[0]).toBeLessThan(at10y[1])
    expect(at10y[1]).toBeLessThan(at10y[2])
  })

  it('total aportado al horizonte más largo no incluye rendimiento', () => {
    const table = buildWealthProjectionTable(2_000_000, 1_000_000, [7], [1, 10])
    expect(table.totalContributedAtLongestHorizon).toBe(2_000_000 + 1_000_000 * 10 * 12)
  })

  it('acepta escenarios y horizontes personalizados', () => {
    const table = buildWealthProjectionTable(0, 500_000, [8], [3])
    expect(table.scenarios).toHaveLength(1)
    expect(table.scenarios[0].values).toHaveLength(1)
    expect(table.scenarios[0].values[0].years).toBe(3)
  })
})
