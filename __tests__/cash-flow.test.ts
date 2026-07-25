/**
 * Tests de lib/cash-flow.ts — timeline de flujo de caja (F8).
 */
import { describe, it, expect } from 'vitest'
import { buildCashFlowTimeline, withinWindow, type CashFlowEvent } from '@/lib/cash-flow'

describe('buildCashFlowTimeline', () => {
  const today = '2026-07-24'

  it('ordena eventos por fecha ascendente', () => {
    const events: CashFlowEvent[] = [
      { date: '2026-08-05', type: 'card', label: 'CMR', amount: -454733 },
      { date: '2026-07-30', type: 'income', label: 'Sueldo', amount: 2300000 },
      { date: '2026-08-01', type: 'recurring', label: 'Netflix', amount: -8990 },
    ]
    const timeline = buildCashFlowTimeline(events, today)
    expect(timeline.map(e => e.date)).toEqual(['2026-07-30', '2026-08-01', '2026-08-05'])
  })

  it('en el mismo día, las entradas van antes que las salidas', () => {
    const events: CashFlowEvent[] = [
      { date: '2026-07-30', type: 'recurring', label: 'Gasto', amount: -10000 },
      { date: '2026-07-30', type: 'income', label: 'Sueldo', amount: 2300000 },
    ]
    const timeline = buildCashFlowTimeline(events, today)
    expect(timeline[0].label).toBe('Sueldo')
    expect(timeline[1].label).toBe('Gasto')
  })

  it('calcula el saldo acumulado correctamente', () => {
    const events: CashFlowEvent[] = [
      { date: '2026-07-30', type: 'income', label: 'Sueldo', amount: 2300000 },
      { date: '2026-08-01', type: 'recurring', label: 'Netflix', amount: -8990 },
      { date: '2026-08-05', type: 'card', label: 'CMR', amount: -454733 },
    ]
    const timeline = buildCashFlowTimeline(events, today)
    expect(timeline[0].runningBalance).toBe(2300000)
    expect(timeline[1].runningBalance).toBe(2291010)
    expect(timeline[2].runningBalance).toBe(1836277)
  })

  it('calcula daysUntil respecto a hoy', () => {
    const events: CashFlowEvent[] = [
      { date: '2026-07-30', type: 'income', label: 'Sueldo', amount: 2300000 },
      { date: '2026-08-05', type: 'card', label: 'CMR', amount: -454733 },
    ]
    const timeline = buildCashFlowTimeline(events, today)
    expect(timeline[0].daysUntil).toBe(6)
    expect(timeline[1].daysUntil).toBe(12)
  })
})

describe('withinWindow', () => {
  const today = '2026-07-24'

  it('excluye eventos pasados y más allá de la ventana', () => {
    const events: CashFlowEvent[] = [
      { date: '2026-07-20', type: 'recurring', label: 'Pasado', amount: -1000 },
      { date: '2026-07-30', type: 'income', label: 'Dentro', amount: 2300000 },
      { date: '2026-09-01', type: 'card', label: 'Fuera de ventana', amount: -1000 },
    ]
    const timeline = buildCashFlowTimeline(events, today)
    const windowed = withinWindow(timeline, 30)
    expect(windowed.map(e => e.label)).toEqual(['Dentro'])
  })

  it('incluye el día de hoy (daysUntil = 0)', () => {
    const events: CashFlowEvent[] = [
      { date: today, type: 'income', label: 'Hoy', amount: 100 },
    ]
    const timeline = buildCashFlowTimeline(events, today)
    const windowed = withinWindow(timeline, 30)
    expect(windowed).toHaveLength(1)
  })
})
