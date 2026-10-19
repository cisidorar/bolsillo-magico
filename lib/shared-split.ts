// ── Gastos compartidos (docs/PLAN_GASTOS_COMPARTIDOS.md) ────────────────────
// Lógica pura: reparto, saldo, etapa del viaje y cuadratura de tarjeta.
// El servidor (supabase/migrations/20261018_shared_groups.sql) hace los mismos
// cálculos al guardar; splitAmount tiene que dar EXACTAMENTE lo mismo que
// shared__shares() para que lo que ve el formulario sea lo que se guarda.

export type SplitKind = 'group' | 'equal' | 'only_a' | 'only_b' | 'exact'
export type SplitMode = 'income' | 'equal' | 'fixed'
export type TripCategory = 'alojamiento' | 'transporte' | 'comida' | 'actividades' | 'compras' | 'otros'

export const TRIP_CATEGORIES: { key: TripCategory; label: string }[] = [
  { key: 'alojamiento', label: 'Alojamiento' },
  { key: 'transporte',  label: 'Transporte' },
  { key: 'comida',      label: 'Comida' },
  { key: 'actividades', label: 'Actividades' },
  { key: 'compras',     label: 'Compras' },
  { key: 'otros',       label: 'Otros' },
]

export interface SharedExpenseLike {
  amount:  number
  paid_by: string
  share_a: number
  share_b: number
}

export interface SettlementLike {
  from_user: string
  to_user:   string
  amount:    number
}

// ── Reparto ─────────────────────────────────────────────────────────────────

/**
 * Parte de cada uno en CLP enteros que suman exacto. El peso que sobra del
 * redondeo queda con quien pagó (D2 del plan): al otro se le calcula su parte
 * redondeada y el pagador absorbe el resto.
 *
 * ratioA = parte del miembro A (0..1). `payerIsA` dice quién pagó.
 */
export function splitAmount(
  amount: number,
  kind: SplitKind,
  ratioA: number | null,
  payerIsA: boolean,
  exactA?: number,
): { shareA: number; shareB: number } {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('invalid_amount')
  if (kind === 'only_a') return { shareA: amount, shareB: 0 }
  if (kind === 'only_b') return { shareA: 0, shareB: amount }
  if (kind === 'exact') {
    if (exactA == null || !Number.isInteger(exactA) || exactA < 0 || exactA > amount) throw new Error('invalid_exact_share')
    return { shareA: exactA, shareB: amount - exactA }
  }
  const r = kind === 'equal' ? 0.5 : ratioA
  if (r == null) throw new Error('ratio_not_agreed')
  if (payerIsA) {
    const shareB = Math.round(amount * (1 - r))
    return { shareA: amount - shareB, shareB }
  }
  const shareA = Math.round(amount * r)
  return { shareA, shareB: amount - shareA }
}

/** Porcentaje entero para mostrar ("62%"); el reparto real usa el ratio exacto. */
export function ratioToPct(ratioA: number): { a: number; b: number } {
  const a = Math.round(ratioA * 100)
  return { a, b: 100 - a }
}

// ── Saldo ───────────────────────────────────────────────────────────────────

export interface GroupBalance {
  /** Lo que puso (pagó) cada uno, en CLP. */
  paidA: number;  paidB: number
  /** Lo que le correspondía a cada uno. */
  shareA: number; shareB: number
  /** Saldos ya transferidos (Saldar). Positivo = recibió más de lo que envió. */
  settledNetA: number
  /** > 0: B le debe esa cantidad a A. < 0: A le debe a B. 0: cuadrados. */
  netA: number
  total: number
}

export function groupBalance(
  expenses: SharedExpenseLike[],
  settlements: SettlementLike[],
  memberA: string,
  memberB: string,
): GroupBalance {
  let paidA = 0, paidB = 0, shareA = 0, shareB = 0
  for (const e of expenses) {
    if (e.paid_by === memberA) paidA += e.amount
    else if (e.paid_by === memberB) paidB += e.amount
    shareA += e.share_a
    shareB += e.share_b
  }
  // Lo que A puso de más sobre su parte es lo que B le debe.
  let owedToA = paidA - shareA
  let settledNetA = 0
  for (const s of settlements) {
    // Si B le transfiere a A, la deuda de B baja; si A le transfiere a B, sube.
    if (s.from_user === memberB && s.to_user === memberA) { owedToA -= s.amount; settledNetA += s.amount }
    else if (s.from_user === memberA && s.to_user === memberB) { owedToA += s.amount; settledNetA -= s.amount }
  }
  return { paidA, paidB, shareA, shareB, settledNetA, netA: owedToA, total: paidA + paidB }
}

/** Saldo visto desde `me`: positivo = te deben, negativo = debes. */
export function balanceFor(b: GroupBalance, meIsA: boolean): number {
  return meIsA ? b.netA : -b.netA
}

// ── Etapa del viaje ─────────────────────────────────────────────────────────

export type TripStage = 'invited' | 'planning' | 'traveling' | 'settling' | 'closed'

/**
 * Etapa derivada de fechas y saldo (el plan: nada se mueve a mano).
 * - invited:    todavía falta que la otra persona acepte.
 * - planning:   antes de la salida (planificar y reservar).
 * - traveling:  entre la salida y la vuelta.
 * - settling:   pasó la vuelta y hay saldo pendiente.
 * - closed:     cerrado a mano, o pasó la vuelta y todo está cuadrado.
 */
export function tripStage(
  g: { member_b: string | null; start_date: string | null; end_date: string | null; closed_at: string | null },
  today: string,
  balanceNet: number,
): TripStage {
  if (g.closed_at) return 'closed'
  if (!g.member_b) return 'invited'
  if (g.start_date && today < g.start_date) return 'planning'
  const end = g.end_date ?? g.start_date
  if (end && today > end) return balanceNet !== 0 ? 'settling' : 'closed'
  if (g.start_date) return 'traveling'
  return 'planning'
}

// ── Cuadratura de tarjeta (D4) ──────────────────────────────────────────────

/**
 * Monto que el banco cobra por un gasto: tu parte (amount) más lo que pagaste
 * por la otra persona (card_extra, solo en el pagador). Es lo que tienen que
 * sumar los estados de cuenta; todo lo demás de la app suma solo `amount`.
 */
export function cardAmount(e: { amount: number; card_extra?: number | null }): number {
  return e.amount + (e.card_extra ?? 0)
}

export function sumCardAmounts(rows: { amount: number; card_extra?: number | null }[]): number {
  return rows.reduce((s, e) => s + cardAmount(e), 0)
}

// ── Reparto "según ingresos" (misma regla que shared__income_ratio) ─────────

/**
 * Promedio de los últimos `n` ingresos mensuales positivos, el más reciente
 * primero. Null si no hay ninguno. Solo se usa para tests/vista previa del
 * servidor: la app nunca ve el ingreso del otro.
 */
export function representativeIncome(monthlyDesc: number[], n = 3): number | null {
  const xs = monthlyDesc.filter(v => v > 0).slice(0, n)
  if (xs.length === 0) return null
  return xs.reduce((s, v) => s + v, 0) / xs.length
}

export function incomeRatio(incomeA: number | null, incomeB: number | null): number | null {
  if (incomeA == null || incomeB == null || incomeA + incomeB <= 0) return null
  return Math.round((incomeA / (incomeA + incomeB)) * 10000) / 10000
}

// ── Presupuesto por categoría (vista de planificación, fase 2) ──────────────

export function spentByCategory(
  expenses: { trip_category: TripCategory; amount: number }[],
): Record<TripCategory, number> {
  const out: Record<TripCategory, number> = {
    alojamiento: 0, transporte: 0, comida: 0, actividades: 0, compras: 0, otros: 0,
  }
  for (const e of expenses) out[e.trip_category] += e.amount
  return out
}
