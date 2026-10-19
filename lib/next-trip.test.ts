import { describe, it, expect } from 'vitest'
import { pickNextTrip } from './next-trip'

const g = (id: string, s: string | null, e: string | null, c = '2026-01-01') => ({ id, start_date: s, end_date: e, created_at: c })

describe('pickNextTrip', () => {
  const today = '2026-10-18'
  it('el más cercano por salir', () => {
    expect(pickNextTrip([g('b', '2027-02-01', '2027-02-10'), g('a', '2026-12-01', '2026-12-10')], today)?.id).toBe('a')
  })
  it('uno en curso gana', () => {
    expect(pickNextTrip([g('a', '2026-12-01', '2026-12-10'), g('now', '2026-10-15', '2026-10-20')], today)?.id).toBe('now')
  })
  it('ignora los ya terminados', () => {
    expect(pickNextTrip([g('old', '2026-09-01', '2026-09-10')], today)).toBeNull()
  })
  it('sin fechas: el más nuevo, pero solo si no hay con fecha', () => {
    expect(pickNextTrip([g('u1', null, null, '2026-05-01'), g('u2', null, null, '2026-09-01')], today)?.id).toBe('u2')
    expect(pickNextTrip([g('u1', null, null), g('d', '2027-01-01', null)], today)?.id).toBe('d')
  })
})
