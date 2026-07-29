import { describe, it, expect } from 'vitest'
import { buildCommittedTimeline, committedPct, type CommittedTimelineItem } from './committed-timeline'

const item = (over: Partial<CommittedTimelineItem>): CommittedTimelineItem => ({
  name: 'x', amount: 10000, billing_month: null, totalInstallments: null, paidInstallments: 0, isActive: true,
  ...over,
})

describe('buildCommittedTimeline', () => {
  it('genera 12 meses consecutivos desde el mes de inicio, con wrap de año', () => {
    const months = buildCommittedTimeline([], 11, 2026)
    expect(months).toHaveLength(12)
    expect(months[0]).toMatchObject({ month: 11, year: 2026 })
    expect(months[1]).toMatchObject({ month: 12, year: 2026 })
    expect(months[2]).toMatchObject({ month: 1, year: 2027 })
    expect(months[10]).toMatchObject({ month: 9, year: 2027 })
  })

  it('un fijo indefinido se suma en los 12 meses', () => {
    const months = buildCommittedTimeline([item({ amount: 50000 })], 1, 2026)
    expect(months.every(m => m.total === 50000)).toBe(true)
  })

  it('un anual se suma solo en su mes', () => {
    const months = buildCommittedTimeline(
      [item({ amount: 600000, billing_month: 3 })], 1, 2026,
    )
    const march = months.find(m => m.month === 3)!
    expect(march.total).toBe(600000)
    expect(months.filter(m => m.total > 0)).toHaveLength(1)
  })

  it('cuotas: se suma en los meses restantes y se libera en el último', () => {
    const months = buildCommittedTimeline(
      [item({ name: 'Notebook', amount: 85000, totalInstallments: 6, paidInstallments: 3 })],
      1, 2026,
    )
    // quedan 3 cuotas: meses 0,1,2 (ene,feb,mar) tienen el monto
    expect(months[0].total).toBe(85000)
    expect(months[1].total).toBe(85000)
    expect(months[2].total).toBe(85000)
    expect(months[3].total).toBe(0)
    // se libera en el mes de la última cuota (índice 2 = marzo)
    expect(months[2].freesUp).toBe(true)
    expect(months[2].releasing).toEqual([{ name: 'Notebook', amount: 85000 }])
    expect(months[0].freesUp).toBe(false)
  })

  it('cuotas ya completadas (remaining=0) no aportan a ningún mes', () => {
    const months = buildCommittedTimeline(
      [item({ totalInstallments: 6, paidInstallments: 6 })], 1, 2026,
    )
    expect(months.every(m => m.total === 0 && !m.freesUp)).toBe(true)
  })

  it('ítems inactivos se ignoran', () => {
    const months = buildCommittedTimeline(
      [item({ amount: 99999, isActive: false })], 1, 2026,
    )
    expect(months.every(m => m.total === 0)).toBe(true)
  })

  it('combina varios tipos en el mismo mes', () => {
    const months = buildCommittedTimeline([
      item({ name: 'Arriendo', amount: 400000 }),
      item({ name: 'Notebook', amount: 85000, totalInstallments: 2, paidInstallments: 0 }),
      item({ name: 'Seguro', amount: 120000, billing_month: 1 }),
    ], 1, 2026)
    expect(months[0].total).toBe(400000 + 85000 + 120000)
    expect(months[1].total).toBe(400000 + 85000)
    expect(months[2].total).toBe(400000)
  })
})

describe('committedPct', () => {
  it('calcula el % redondeado', () => {
    expect(committedPct(312000, 820000)).toBe(38)
  })
  it('null sin ingreso', () => {
    expect(committedPct(100000, null)).toBeNull()
    expect(committedPct(100000, 0)).toBeNull()
  })
})
