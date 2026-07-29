import { describe, it, expect } from 'vitest'
import {
  progressPct, amountRemaining, monthsUntil, requiredMonthlyContribution,
  isOnTrack, projectedCompletionMonth, type SavingsGoal,
} from './savings-goals'

const goal = (over: Partial<SavingsGoal> = {}): SavingsGoal => ({
  targetAmount: 900000, currentAmount: 300000, targetDate: '2026-12-25', ...over,
})

describe('progressPct', () => {
  it('calcula el % avanzado', () => {
    expect(progressPct(goal())).toBe(33)
  })
  it('acota a 100 aunque current supere target', () => {
    expect(progressPct(goal({ currentAmount: 1_200_000 }))).toBe(100)
  })
  it('0 si target_amount es 0 o negativo (defensivo)', () => {
    expect(progressPct(goal({ targetAmount: 0 }))).toBe(0)
  })
})

describe('amountRemaining', () => {
  it('resta lo avanzado', () => {
    expect(amountRemaining(goal())).toBe(600000)
  })
  it('0 si ya se alcanzó (nunca negativo)', () => {
    expect(amountRemaining(goal({ currentAmount: 950000 }))).toBe(0)
  })
})

describe('monthsUntil', () => {
  it('null sin fecha objetivo', () => {
    expect(monthsUntil(null, '2026-07-28')).toBeNull()
  })
  it('0 si la fecha ya pasó', () => {
    expect(monthsUntil('2026-06-01', '2026-07-28')).toBe(0)
  })
  it('0 si la fecha es hoy', () => {
    expect(monthsUntil('2026-07-28', '2026-07-28')).toBe(0)
  })
  it('cuenta el mes en curso como una cuota más', () => {
    // 28 jul → 25 dic: 4 meses completos + el mes en curso = 5
    expect(monthsUntil('2026-12-25', '2026-07-28')).toBe(5)
  })
  it('un mes muy cercano sigue contando como 1 cuota', () => {
    expect(monthsUntil('2026-08-01', '2026-07-28')).toBe(1)
  })
})

describe('requiredMonthlyContribution', () => {
  it('null si ya se alcanzó la meta', () => {
    expect(requiredMonthlyContribution(goal({ currentAmount: 900000 }), '2026-07-28')).toBeNull()
  })
  it('null sin fecha objetivo (nada que prorratear)', () => {
    expect(requiredMonthlyContribution(goal({ targetDate: null }), '2026-07-28')).toBeNull()
  })
  it('prorratea lo que falta entre los meses restantes, redondeando hacia arriba', () => {
    // faltan 600.000 en 5 cuotas → 120.000 exacto
    expect(requiredMonthlyContribution(goal(), '2026-07-28')).toBe(120000)
  })
  it('si la fecha ya pasó y no se alcanzó, pide todo el remanente de una vez', () => {
    expect(requiredMonthlyContribution(goal({ targetDate: '2026-01-01' }), '2026-07-28')).toBe(600000)
  })
})

describe('isOnTrack', () => {
  it('true si el ritmo actual alcanza o supera lo requerido', () => {
    expect(isOnTrack(goal(), 150000, '2026-07-28')).toBe(true)
    expect(isOnTrack(goal(), 120000, '2026-07-28')).toBe(true)
  })
  it('false si el ritmo actual no alcanza', () => {
    expect(isOnTrack(goal(), 50000, '2026-07-28')).toBe(false)
  })
  it('null sin fecha objetivo o si ya se alcanzó', () => {
    expect(isOnTrack(goal({ targetDate: null }), 50000, '2026-07-28')).toBeNull()
    expect(isOnTrack(goal({ currentAmount: 900000 }), 50000, '2026-07-28')).toBeNull()
  })
})

describe('projectedCompletionMonth', () => {
  it('proyecta el mes de cierre al ritmo actual', () => {
    // faltan 600.000, ritmo 100.000/mes → 6 meses desde jul 2026 → enero 2027
    expect(projectedCompletionMonth(goal(), 100000, '2026-07-28')).toBe('2027-01')
  })
  it('null si el ritmo es 0 o negativo — nunca se alcanza', () => {
    expect(projectedCompletionMonth(goal(), 0, '2026-07-28')).toBeNull()
    expect(projectedCompletionMonth(goal(), -1000, '2026-07-28')).toBeNull()
  })
  it('null si ya se alcanzó', () => {
    expect(projectedCompletionMonth(goal({ currentAmount: 900000 }), 100000, '2026-07-28')).toBeNull()
  })
})
