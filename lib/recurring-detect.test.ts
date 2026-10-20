import { describe, it, expect } from 'vitest'
import { detectRecurring, normalizeName, type DetectExpense } from './recurring-detect'

let n = 0
const E = (description: string, date: string, amount: number, o: Partial<DetectExpense> = {}): DetectExpense => ({
  id: `e${++n}`, description, amount, date, category_id: 'cat', payment_method_id: 'pm', recurring_expense_id: null, ...o,
})
const today = '2026-10-19'

describe('normalizeName', () => {
  it('ignora mayúsculas, tildes, números y signos', () => {
    expect(normalizeName('  Netflix. ')).toBe('netflix')
    expect(normalizeName('NETFLIX 2')).toBe('netflix')
    expect(normalizeName('Cámara  ADT')).toBe('camara adt')
  })
})

describe('detectRecurring', () => {
  const claude = [E('Claude', '2026-06-13', 21958), E('Claude', '2026-07-13', 22415), E('Claude', '2026-08-13', 22066)]

  it('propone Claude: 3 meses seguidos, mismo día, monto parecido, sin recurrente', () => {
    const [c] = detectRecurring(claude, [], today)
    expect(c).toMatchObject({ name: 'Claude', billingDay: 13, intervalMonths: 1, amount: 22066, occurrences: 3, lastDate: '2026-08-13' })
    expect(c.expenseIds).toHaveLength(3)
  })

  it('no propone lo que ya existe como recurrente (aunque cambie la escritura)', () => {
    expect(detectRecurring(claude, ['claude'], today)).toHaveLength(0)
    expect(detectRecurring(claude, ['Claude Pro'], today)).toHaveLength(0)
  })

  it('no propone si algún gasto ya está enlazado a un recurrente', () => {
    const linked = [...claude.slice(0, 2), { ...claude[2], recurring_expense_id: 'r1' }]
    expect(detectRecurring(linked, [], today)).toHaveLength(0)
  })

  it('exige 3 meses: dos cobros no alcanzan', () => {
    expect(detectRecurring(claude.slice(0, 2), [], today)).toHaveLength(0)
  })

  it('exige meses consecutivos: un salto rompe el patrón', () => {
    const gap = [E('Gym', '2026-05-10', 30000), E('Gym', '2026-07-10', 30000), E('Gym', '2026-08-10', 30000)]
    expect(detectRecurring(gap, [], today)).toHaveLength(0)
  })

  it('exige día parecido: compras sueltas el mismo comercio no cuentan', () => {
    const loose = [E('Uber', '2026-06-02', 5000), E('Uber', '2026-07-20', 5200), E('Uber', '2026-08-11', 4900)]
    expect(detectRecurring(loose, [], today)).toHaveLength(0)
  })

  it('exige monto estable', () => {
    const wild = [E('Super', '2026-06-10', 10000), E('Super', '2026-07-10', 40000), E('Super', '2026-08-10', 9000)]
    expect(detectRecurring(wild, [], today)).toHaveLength(0)
  })

  it('descarta lo que dejó de cobrarse hace meses', () => {
    const old = [E('Antiguo', '2026-01-05', 9000), E('Antiguo', '2026-02-05', 9000), E('Antiguo', '2026-03-05', 9000)]
    expect(detectRecurring(old, [], today)).toHaveLength(0)
  })

  it('detecta cadencia cada 2 meses', () => {
    const bi = [E('Comida Kida', '2026-05-09', 75000), E('Comida Kida', '2026-07-09', 75000), E('Comida Kida', '2026-09-09', 75000)]
    const [c] = detectRecurring(bi, [], today)
    expect(c.intervalMonths).toBe(2)
  })

  it('ignora gastos compartidos de viajes', () => {
    const shared = claude.map(e => ({ ...e, shared_expense_id: 's' }))
    expect(detectRecurring(shared, [], today)).toHaveLength(0)
  })

  it('un solo cobro por mes aunque haya dos en el mismo mes', () => {
    const dup = [...claude, E('Claude', '2026-08-14', 22066)]
    const [c] = detectRecurring(dup, [], today)
    expect(c.occurrences).toBe(3)
  })
})
