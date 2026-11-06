import { describe, it, expect } from 'vitest'
import {
  splitEvenly, myShareOf, validateSplit, summarizeReceivables, cardDueDateFor,
  reminderText, whatsappLink, type ReceivableWithExpense,
} from './receivables'

function rec(p: Partial<ReceivableWithExpense> & { person_name: string; amount: number }): ReceivableWithExpense {
  return {
    id: Math.random().toString(36).slice(2), expense_id: 'e1', received_at: null,
    received_payment_method_id: null, forgiven: false, created_at: '2026-10-31T12:00:00Z',
    expense: { description: 'Cafetería con amigas', date: '2026-10-31', payment_method_id: 'cmr' },
    ...p,
  }
}

describe('splitEvenly', () => {
  it('reparte y tú absorbes el resto', () => {
    expect(splitEvenly(11000, 2)).toEqual({ each: 3666, mine: 3668 })
    expect(splitEvenly(9000, 2)).toEqual({ each: 3000, mine: 3000 })
  })
  it('sin otras personas todo es tuyo', () => {
    expect(splitEvenly(5000, 0)).toEqual({ each: 0, mine: 5000 })
  })
})

describe('validateSplit / myShareOf', () => {
  it('tu parte = total − lo que te deben', () => {
    expect(myShareOf(11000, [3666, 3666])).toBe(3668)
  })
  it('permite pagar todo por otros (tu parte 0)', () => {
    expect(validateSplit(10000, [{ name: 'Javi', amount: 10000 }]).ok).toBe(true)
  })
  it('rechaza más de lo que cobró la tarjeta, nombres vacíos y montos inválidos', () => {
    expect(validateSplit(10000, [{ name: 'Javi', amount: 10001 }]).ok).toBe(false)
    expect(validateSplit(10000, [{ name: ' ', amount: 100 }]).ok).toBe(false)
    expect(validateSplit(10000, [{ name: 'Javi', amount: 0 }]).ok).toBe(false)
    expect(validateSplit(10000, []).ok).toBe(false)
  })
})

describe('summarizeReceivables', () => {
  it('agrupa por persona, ignora pagados y asumidos, ordena por antigüedad', () => {
    const rows = [
      rec({ person_name: 'Javi', amount: 3666 }),
      rec({ person_name: 'javi ', amount: 5000, expense: { description: 'Pizza', date: '2026-11-04', payment_method_id: null } }),
      rec({ person_name: 'Fran', amount: 3666, received_at: '2026-11-02' }),
      rec({ person_name: 'Cote', amount: 2000, forgiven: true }),
      rec({ person_name: 'Ale', amount: 1000, expense: { description: 'Uber', date: '2026-11-05', payment_method_id: null } }),
    ]
    const s = summarizeReceivables(rows, '2026-11-08')
    expect(s.pendingTotal).toBe(9666)
    expect(s.pendingCount).toBe(3)
    expect(s.people.map(p => p.name)).toEqual(['Javi', 'Ale'])
    expect(s.people[0].total).toBe(8666)
    expect(s.people[0].oldestDays).toBe(8)
    expect(s.staleCount).toBe(1)
  })
})

describe('cardDueDateFor', () => {
  const cmr = { card_type: 'credit', billing_day: 24, payment_due_day: 5 }
  it('gasto antes del corte → factura de ese mes, vence el mes siguiente', () => {
    expect(cardDueDateFor('2026-10-20', cmr)).toBe('2026-11-05')
  })
  it('gasto después del corte → factura del mes siguiente', () => {
    expect(cardDueDateFor('2026-10-31', cmr)).toBe('2026-12-05')
  })
  it('débito o sin configuración → null', () => {
    expect(cardDueDateFor('2026-10-31', { card_type: 'debit', billing_day: null, payment_due_day: null })).toBeNull()
    expect(cardDueDateFor('2026-10-31', null)).toBeNull()
  })
})

describe('reminderText', () => {
  it('un gasto: menciona qué, cuándo y cuánto', () => {
    const s = summarizeReceivables([rec({ person_name: 'Javiera Soto', amount: 3666 })], '2026-11-08')
    const t = reminderText(s.people[0])
    expect(t).toContain('Hola Javiera!')
    expect(t).toContain('Cafetería con amigas')
    expect(t).toContain('$3.666')
  })
  it('varios gastos: lista y total', () => {
    const s = summarizeReceivables([
      rec({ person_name: 'Javi', amount: 3666 }),
      rec({ person_name: 'Javi', amount: 5000, expense: { description: 'Pizza', date: '2026-11-04', payment_method_id: null } }),
    ], '2026-11-08')
    const t = reminderText(s.people[0])
    expect(t).toContain('• Pizza: $5.000')
    expect(t).toContain('Total: $8.666')
    expect(whatsappLink(t)).toMatch(/^https:\/\/wa\.me\/\?text=/)
  })
})
