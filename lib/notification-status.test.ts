import { describe, it, expect } from 'vitest'
import { summarizeNotificationStatus } from './notification-status'

describe('summarizeNotificationStatus', () => {
  it('devuelve null en todos los canales sin logs', () => {
    const r = summarizeNotificationStatus({
      logs: [], monthStr: '2026-07', budgetPct: null, budgetThreshold: 80,
    })
    expect(r.billing.lastSentAt).toBeNull()
    expect(r.budget.lastSentAt).toBeNull()
    expect(r.monthly.lastSentAt).toBeNull()
    expect(r.recurring.lastSentAt).toBeNull()
  })

  it('toma el envío más reciente por canal, incluso entre varios tipos', () => {
    const r = summarizeNotificationStatus({
      logs: [
        { type: 'budget_80',  sent_at: '2026-07-10T12:00:00Z' },
        { type: 'budget_100', sent_at: '2026-07-20T12:00:00Z' },
        { type: 'recurring_due',     sent_at: '2026-07-05T12:00:00Z' },
        { type: 'recurring_overdue', sent_at: '2026-07-06T12:00:00Z' },
      ],
      monthStr: '2026-07', budgetPct: 91, budgetThreshold: 80,
    })
    expect(r.budget.lastSentAt).toBe('2026-07-20T12:00:00Z')
    expect(r.recurring.lastSentAt).toBe('2026-07-06T12:00:00Z')
  })

  it('no marca "lagging" si el envío del umbral ya salió este mes', () => {
    const r = summarizeNotificationStatus({
      logs: [{ type: 'budget_80', sent_at: '2026-07-14T12:00:00Z' }],
      monthStr: '2026-07', budgetPct: 91, budgetThreshold: 80,
    })
    expect(r.budget.lagging).toBe(false)
  })

  it('marca "lagging" cuando el % ya cruzó el umbral pero no hubo envío este mes (el bug real de julio)', () => {
    const r = summarizeNotificationStatus({
      logs: [{ type: 'budget_80', sent_at: '2026-06-12T12:00:00Z' }],  // mes anterior
      monthStr: '2026-07', budgetPct: 91, budgetThreshold: 80,
    })
    expect(r.budget.lagging).toBe(true)
  })

  it('no marca "lagging" si el % todavía no llega al umbral', () => {
    const r = summarizeNotificationStatus({
      logs: [], monthStr: '2026-07', budgetPct: 50, budgetThreshold: 80,
    })
    expect(r.budget.lagging).toBe(false)
  })

  it('no marca "lagging" sin presupuesto definido (budgetPct null)', () => {
    const r = summarizeNotificationStatus({
      logs: [], monthStr: '2026-07', budgetPct: null, budgetThreshold: 80,
    })
    expect(r.budget.lagging).toBe(false)
  })

  it('billing y monthly nunca marcan lagging (no se evalúa su condición acá)', () => {
    const r = summarizeNotificationStatus({
      logs: [], monthStr: '2026-07', budgetPct: 100, budgetThreshold: 80,
    })
    expect(r.billing.lagging).toBe(false)
    expect(r.monthly.lagging).toBe(false)
    expect(r.recurring.lagging).toBe(false)
  })
})
