// ── Por cobrar (nov 2026) ───────────────────────────────────────────────────
// Pagaste con tu tarjeta algo de varias personas y te van a transferir su
// parte. Ver supabase/migrations/20261106_expense_receivables.sql para el
// modelo (amount = tu parte, card_extra = lo que pagaste por otros, una fila
// en expense_receivables por persona). Acá: lógica pura y testeable.

import { billingPeriod, statementDueDate, daysBetween } from './utils'

export interface Receivable {
  id: string
  expense_id: string
  person_name: string
  amount: number
  received_at: string | null
  received_payment_method_id: string | null
  forgiven: boolean
  created_at: string
}

/** Días sin pagar a partir de los cuales el cobro pasa a "recuérdale" (gold, UX5). */
export const STALE_DAYS = 7

export function isPending(r: Pick<Receivable, 'received_at' | 'forgiven'>): boolean {
  return r.received_at == null && !r.forgiven
}

/**
 * Reparto en partes iguales entre tú y `others` personas. Cada persona paga
 * floor(total / n) y tú absorbes el resto (pagaste tú, los pesos sueltos
 * quedan de tu lado). Devuelve la parte de cada uno de los otros y la tuya.
 */
export function splitEvenly(total: number, others: number): { each: number; mine: number } {
  if (others <= 0 || total <= 0) return { each: 0, mine: Math.max(0, total) }
  const n = others + 1
  const each = Math.floor(total / n)
  return { each, mine: total - each * others }
}

/** Tu parte = lo que cobró la tarjeta − lo que te deben (nunca negativa). */
export function myShareOf(total: number, owed: number[]): number {
  return total - owed.reduce((s, a) => s + (a > 0 ? a : 0), 0)
}

export interface SplitValidation { ok: boolean; error?: string }

export function validateSplit(total: number, people: { name: string; amount: number }[]): SplitValidation {
  if (people.length === 0) return { ok: false, error: 'Agrega al menos una persona' }
  for (const p of people) {
    if (!p.name.trim()) return { ok: false, error: 'Falta el nombre de una persona' }
    if (!Number.isInteger(p.amount) || p.amount <= 0) return { ok: false, error: `Monto inválido para ${p.name.trim() || 'alguien'}` }
  }
  if (myShareOf(total, people.map(p => p.amount)) < 0) {
    return { ok: false, error: 'Lo que te deben supera lo que cobró la tarjeta' }
  }
  return { ok: true }
}

export interface ReceivableWithExpense extends Receivable {
  expense: {
    description: string | null
    date: string
    payment_method_id: string | null
  } | null
}

export interface PersonSummary {
  name: string
  total: number
  items: ReceivableWithExpense[]
  oldestDays: number
}

export interface ReceivablesSummary {
  pendingTotal: number
  pendingCount: number
  people: PersonSummary[]
  staleCount: number   // cobros con ≥ STALE_DAYS días sin pagar
}

/**
 * Agrupa lo pendiente por persona (mismo nombre, sin distinguir mayúsculas),
 * de la deuda más antigua a la más nueva. La antigüedad se cuenta desde la
 * fecha del gasto, que es cuando adelantaste la plata.
 */
export function summarizeReceivables(rows: ReceivableWithExpense[], today: string): ReceivablesSummary {
  const pending = rows.filter(isPending)
  const byPerson = new Map<string, PersonSummary>()
  for (const r of pending) {
    const key = r.person_name.trim().toLocaleLowerCase('es-CL')
    const since = r.expense?.date ?? r.created_at.slice(0, 10)
    const days = Math.max(0, daysBetween(since, today))
    const cur = byPerson.get(key)
    if (cur) {
      cur.total += r.amount
      cur.items.push(r)
      cur.oldestDays = Math.max(cur.oldestDays, days)
    } else {
      byPerson.set(key, { name: r.person_name.trim(), total: r.amount, items: [r], oldestDays: days })
    }
  }
  const people = [...byPerson.values()].sort((a, b) => b.oldestDays - a.oldestDays || b.total - a.total)
  return {
    pendingTotal: pending.reduce((s, r) => s + r.amount, 0),
    pendingCount: pending.length,
    people,
    staleCount: pending.filter(r => {
      const since = r.expense?.date ?? r.created_at.slice(0, 10)
      return daysBetween(since, today) >= STALE_DAYS
    }).length,
  }
}

/**
 * Cuándo vence la factura de tarjeta que incluye este gasto — hasta esa fecha
 * te conviene haber cobrado, porque el banco te cobra el total igual.
 * null si no es tarjeta de crédito con corte y día de pago configurados.
 */
export function cardDueDateFor(
  expenseDate: string,
  card: { card_type: string; billing_day: number | null; payment_due_day: number | null } | null | undefined,
): string | null {
  if (!card || card.card_type !== 'credit' || !card.billing_day || !card.payment_due_day) return null
  const { month, year } = billingPeriod(expenseDate, card.billing_day)
  return statementDueDate(month, year, card.payment_due_day)
}

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')

/** Texto del recordatorio para mandar por WhatsApp (sin datos bancarios). */
export function reminderText(person: PersonSummary): string {
  const first = person.name.split(' ')[0]
  if (person.items.length === 1) {
    const it = person.items[0]
    const what = it.expense?.description?.trim()
    const when = it.expense?.date
      ? new Date(it.expense.date + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })
      : null
    return `Hola ${first}! Te recuerdo tu parte${what ? ` de ${what}` : ''}${when ? ` (${when})` : ''}: ${fmt(person.total)}. ¡Gracias!`
  }
  const lines = person.items.map(it => `• ${it.expense?.description?.trim() || 'Gasto'}: ${fmt(it.amount)}`)
  return `Hola ${first}! Te recuerdo lo que quedó pendiente:\n${lines.join('\n')}\nTotal: ${fmt(person.total)}. ¡Gracias!`
}

export function whatsappLink(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}
