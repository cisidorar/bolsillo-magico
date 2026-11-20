import { describe, it, expect } from 'vitest'
import { summarizeLink, type LinkView } from './shared-link'

const view: LinkView = {
  group: { name: 'Sur', start_date: null, end_date: null, closed_at: null, split_mode: 'income' },
  expires_at: '2027-02-01T00:00:00Z',
  weights: { a: 635000, b: 365000 },
  members: [{ id: 'a', name: 'Cas', is_guest: false }, { id: 'b', name: 'Cami', is_guest: true }],
  expenses: [
    { id: '1', description: 'Pasajes', date: '2026-11-01', amount: 1000, paid_by: 'a', trip_category: 'transporte', shares: { a: 635, b: 365 } },
  ],
  settlements: [],
}

describe('summarizeLink', () => {
  it('calcula porcentajes y quién le debe a quién', () => {
    const s = summarizeLink(view)
    expect(s.pct).toEqual([{ id: 'a', name: 'Cas', pct: 63.5 }, { id: 'b', name: 'Cami', pct: 36.5 }])
    expect(s.transfers).toEqual([{ from: 'Cami', to: 'Cas', amount: 365 }])
    expect(s.total).toBe(1000)
  })
  it('sin porcentajes en partes iguales', () => {
    expect(summarizeLink({ ...view, group: { ...view.group, split_mode: 'equal' } }).pct).toBeNull()
  })
  it('un pago la deja a mano', () => {
    const s = summarizeLink({ ...view, settlements: [{ from_user: 'b', to_user: 'a', amount: 365, date: '2026-11-05' }] })
    expect(s.transfers).toEqual([])
  })
})
