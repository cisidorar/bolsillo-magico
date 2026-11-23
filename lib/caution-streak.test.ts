import { describe, it, expect } from 'vitest'
import { cautionStreak, cautionNote } from './caution-streak'

// Días hábiles consecutivos (lun-vie) desde una fecha, para armar rachas realistas
function weekdays(from: string, n: number): string[] {
  const out: string[] = []
  const d = new Date(from + 'T12:00:00Z')
  while (out.length < n) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

describe('cautionStreak', () => {
  it('sin días previos no hay racha', () => {
    expect(cautionStreak([], '2026-11-20', 51)).toBeNull()
  })

  it('cuenta días hábiles seguidos aunque haya fines de semana', () => {
    const days = weekdays('2026-11-02', 15)               // 2-nov … 20-nov
    const prior = days.slice(0, -1).map((date, i) => ({ date, price: 92 - i * 2 }))
    const s = cautionStreak(prior, days[days.length - 1], 51)!
    expect(s.days).toBe(15)
    expect(s.startDate).toBe('2026-11-02')
    expect(s.startPrice).toBe(92)
    expect(s.changePct).toBe(-44.6)
  })

  it('un hueco de más de 4 días corta la racha', () => {
    const prior = [
      { date: '2026-10-01', price: 100 }, { date: '2026-10-02', price: 99 },   // racha vieja
      { date: '2026-11-18', price: 80 }, { date: '2026-11-19', price: 79 },
    ]
    const s = cautionStreak(prior, '2026-11-20', 78)!
    expect(s.days).toBe(3)
    expect(s.startDate).toBe('2026-11-18')
  })

  it('un feriado largo (hueco de 4 días) no corta la racha', () => {
    const s = cautionStreak([{ date: '2026-11-23', price: 100 }, { date: '2026-11-19', price: 105 }], '2026-11-24', 98)!
    expect(s.days).toBe(3)
  })

  it('ignora días futuros o iguales a hoy y precios inválidos', () => {
    expect(cautionStreak([{ date: '2026-11-20', price: 50 }, { date: '2026-11-21', price: 50 }], '2026-11-20', 51)).toBeNull()
    expect(cautionStreak([{ date: '2026-11-19', price: 0 }], '2026-11-20', 51)).toBeNull()
    expect(cautionStreak([{ date: '2026-11-19', price: 10 }], '2026-11-20', 0)).toBeNull()
  })
})

describe('cautionNote', () => {
  it('solo escala desde 10 días', () => {
    expect(cautionNote({ days: 9, startDate: 'a', startPrice: 100, changePct: -5 })).toBeNull()
    expect(cautionNote(null)).toBeNull()
  })
  it('dice cuántos días y qué pasó con el precio (a la baja o al alza)', () => {
    expect(cautionNote({ days: 31, startDate: 'a', startPrice: 92, changePct: -44.3 })).toBe(
      'Lleva 31 días seguidos en precaución; el precio está -44,3% desde que empezó.')
    expect(cautionNote({ days: 12, startDate: 'a', startPrice: 100, changePct: 6.5 })).toContain('+6,5%')
  })
})
