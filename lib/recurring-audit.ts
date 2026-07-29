// ── E6 (roadmap economía personal, jul 2026): auditoría de recurrentes ──────
// Determinista, sin IA — a diferencia del insight `subscription_price_increase`
// de /api/analyze-month (que depende de que el modelo lo destaque ese mes,
// compitiendo con otros candidatos), esto es un simple group-by sobre
// `expenses.recurring_expense_id` que ya existe. Costo anualizado y total
// pagado histórico para dar contexto a cada suscripción/fijo; detección de
// cambio de monto comparando los dos valores distintos más recientes.

export interface RecurringAuditItem {
  amount: number
  /** null = mensual o en cuotas (se cobra cada mes); 1-12 = anual, se cobra una vez ese mes. */
  billing_month: number | null
}

/** Costo anualizado: mensuales y cuotas activas se pagan cada mes (×12); anuales ya son el monto anual. */
export function annualizedCost(item: RecurringAuditItem): number {
  return item.billing_month !== null ? item.amount : item.amount * 12
}

export interface AuditExpense {
  amount: number
  date: string  // YYYY-MM-DD
}

/** Suma de todos los gastos ligados a este recurrente (historial completo, no solo el mes). */
export function totalPaid(expenses: AuditExpense[]): number {
  return expenses.reduce((s, e) => s + e.amount, 0)
}

export interface PriceChangeResult {
  changed: boolean
  delta: number
  changedAt: string | null
  previousAmount: number | null
  currentAmount: number | null
}

const NO_CHANGE: PriceChangeResult = {
  changed: false, delta: 0, changedAt: null, previousAmount: null, currentAmount: null,
}

/**
 * Compara el monto del cargo más reciente contra el último monto DISTINTO
 * anterior (saltando repeticiones) — así "Spotify $6.900 ×5, luego $7.900"
 * detecta el alza sin que una racha de montos iguales dispare falsos positivos.
 * Requiere al menos 2 gastos y al menos 2 montos distintos en el historial.
 */
export function detectPriceChange(expenses: AuditExpense[]): PriceChangeResult {
  if (expenses.length < 2) return NO_CHANGE

  const sorted = [...expenses].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const last = sorted[sorted.length - 1]

  let prev: AuditExpense | null = null
  for (let i = sorted.length - 2; i >= 0; i--) {
    if (sorted[i].amount !== last.amount) { prev = sorted[i]; break }
  }
  if (!prev) return NO_CHANGE

  return {
    changed: true,
    delta: last.amount - prev.amount,
    changedAt: last.date,
    previousAmount: prev.amount,
    currentAmount: last.amount,
  }
}
