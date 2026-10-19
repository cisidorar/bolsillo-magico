// ── Gastos compartidos (docs/PLAN_GASTOS_COMPARTIDOS.md) ────────────────────
// Lógica pura: reparto, saldo, etapa del viaje y cuadratura de tarjeta.
// El servidor (supabase/migrations/20261020_shared_groups_n_people.sql) hace los mismos
// cálculos al guardar; splitAmount tiene que dar EXACTAMENTE lo mismo que
// shared__compute_shares() para que lo que ve el formulario sea lo que se guarda.

export type SplitKind = 'group' | 'equal' | 'exact'
export type SplitMode = 'income' | 'equal'
export type TripCategory = 'alojamiento' | 'transporte' | 'comida' | 'actividades' | 'compras' | 'otros'

export const TRIP_CATEGORIES: { key: TripCategory; label: string }[] = [
  { key: 'alojamiento', label: 'Alojamiento' },
  { key: 'transporte',  label: 'Transporte' },
  { key: 'comida',      label: 'Comida' },
  { key: 'actividades', label: 'Actividades' },
  { key: 'compras',     label: 'Compras' },
  { key: 'otros',       label: 'Otros' },
]

export interface SettlementLike {
  from_user: string
  to_user:   string
  amount:    number
}

// ── Reparto entre N personas ────────────────────────────────────────────────

/**
 * Reparte `amount` (CLP enteros) según pesos enteros por persona, con el método
 * del mayor resto. Desempate IDÉNTICO al SQL: mayor resto primero, luego quien
 * NO pagó, luego id ascendente. Siempre suma exacto.
 */
export function splitByWeights(
  amount: number,
  weights: { id: string; w: number }[],
  payerId: string,
): Record<string, number> {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('invalid_amount')
  if (weights.length === 0) throw new Error('invalid_participants')
  const sumW = weights.reduce((s, x) => s + x.w, 0)
  if (sumW <= 0) throw new Error('invalid_participants')
  const base = weights.map(x => ({
    id: x.id,
    floor: Math.floor((amount * x.w) / sumW),
    rem: (amount * x.w) % sumW,
  }))
  let left = amount - base.reduce((s, x) => s + x.floor, 0)
  const order = [...base].sort((a, b) =>
    b.rem - a.rem ||
    Number(a.id === payerId) - Number(b.id === payerId) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const out: Record<string, number> = {}
  for (const x of base) out[x.id] = x.floor
  for (const x of order) { if (left <= 0) break; out[x.id] += 1; left-- }
  return out
}

/** Pesos para un reparto parejo entre los participantes. */
export function equalWeights(ids: string[]): { id: string; w: number }[] {
  return ids.map(id => ({ id, w: 1 }))
}

/** Pesos por ingreso (entero, 1e6 de resolución). Mismo cálculo que el SQL. */
export function incomeWeights(incomes: { id: string; income: number }[]): { id: string; w: number }[] | null {
  if (incomes.some(x => !(x.income > 0))) return null
  const total = incomes.reduce((s, x) => s + x.income, 0)
  return incomes.map(x => ({ id: x.id, w: Math.max(1, Math.round((x.income * 1_000_000) / total)) }))
}

/** Validación de montos exactos: deben sumar el total y no ser negativos. */
export function exactValid(amount: number, parts: Record<string, number>): boolean {
  const vals = Object.values(parts)
  return vals.length > 0 && vals.every(v => Number.isInteger(v) && v >= 0) && vals.reduce((s, v) => s + v, 0) === amount
}

// ── Saldo ───────────────────────────────────────────────────────────────────

export interface ExpenseShareLike {
  amount:  number
  paid_by: string
  /** user_id → parte en CLP */
  shares:  Record<string, number>
}

export interface GroupBalance {
  /** Neto por persona: > 0 le deben, < 0 debe. Suma 0. */
  net:   Record<string, number>
  paid:  Record<string, number>
  share: Record<string, number>
  total: number
}

export function groupBalance(
  expenses: ExpenseShareLike[],
  settlements: SettlementLike[],
  memberIds: string[],
): GroupBalance {
  const net: Record<string, number> = {}, paid: Record<string, number> = {}, share: Record<string, number> = {}
  for (const id of memberIds) { net[id] = 0; paid[id] = 0; share[id] = 0 }
  let total = 0
  for (const e of expenses) {
    total += e.amount
    paid[e.paid_by] = (paid[e.paid_by] ?? 0) + e.amount
    net[e.paid_by]  = (net[e.paid_by]  ?? 0) + e.amount
    for (const [uid, sh] of Object.entries(e.shares)) {
      share[uid] = (share[uid] ?? 0) + sh
      net[uid]   = (net[uid]   ?? 0) - sh
    }
  }
  // Quien transfirió baja su deuda (sube su neto); quien recibió baja su crédito.
  for (const s of settlements) {
    net[s.from_user] = (net[s.from_user] ?? 0) + s.amount
    net[s.to_user]   = (net[s.to_user]   ?? 0) - s.amount
  }
  return { net, paid, share, total }
}

/** Menos transferencias para dejar a todos a mano (deudor mayor → acreedor mayor). */
export function suggestedTransfers(net: Record<string, number>): { from: string; to: string; amount: number }[] {
  const debtors = Object.entries(net).filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v }))
    .sort((a, b) => b.v - a.v || (a.id < b.id ? -1 : 1))
  const creditors = Object.entries(net).filter(([, v]) => v > 0).map(([id, v]) => ({ id, v }))
    .sort((a, b) => b.v - a.v || (a.id < b.id ? -1 : 1))
  const out: { from: string; to: string; amount: number }[] = []
  let i = 0, j = 0
  while (i < debtors.length && j < creditors.length) {
    const amt = Math.min(debtors[i].v, creditors[j].v)
    if (amt > 0) out.push({ from: debtors[i].id, to: creditors[j].id, amount: amt })
    debtors[i].v -= amt; creditors[j].v -= amt
    if (debtors[i].v === 0) i++
    if (creditors[j].v === 0) j++
  }
  return out
}

// ── Etapa del viaje ─────────────────────────────────────────────────────────

export type TripStage = 'planning' | 'traveling' | 'settling' | 'closed'

/**
 * Etapa derivada de fechas y saldo (nada se mueve a mano).
 * - planning:  sin fechas, o antes de la salida.
 * - traveling: entre la salida y la vuelta.
 * - settling:  pasó la vuelta y hay saldo pendiente.
 * - closed:    cerrado a mano, o pasó la vuelta y todo está cuadrado.
 */
export function tripStage(
  g: { start_date: string | null; end_date: string | null; closed_at: string | null },
  today: string,
  anyPending: boolean,
): TripStage {
  if (g.closed_at) return 'closed'
  if (g.start_date && today < g.start_date) return 'planning'
  const end = g.end_date ?? g.start_date
  if (end && today > end) return anyPending ? 'settling' : 'closed'
  if (g.start_date) return 'traveling'
  return 'planning'
}

// ── Categoría del viaje según la descripción ───────────────────────────────

const TRIP_CAT_RULES: [TripCategory, RegExp][] = [
  ['alojamiento', /\b(airbnb|booking|hotel|hostal|hostel|caba[ñn]a|alojamiento|departamento|depto|camping|lodge|posada|arriendo)\b/i],
  ['transporte',  /\b(vuelo|pasaje|pasajes|avi[oó]n|latam|sky|jetsmart|bus|turbus|pullman|tren|ferry|barcaza|bencina|combustible|peaje|tag|uber|cabify|didi|taxi|auto|rent ?a ?car|arriendo de auto|estacionamiento|transfer)\b/i],
  ['comida',      /\b(comida|cena|almuerzo|desayuno|once|restor[aá]n|restaurant|super|supermercado|jumbo|lider|unimarc|caf[eé]|bar|pizza|sushi|asado|mercado)\b/i],
  ['actividades', /\b(tour|excursi[oó]n|entrada|entradas|museo|parque|kayak|trekking|clase|actividad|termas|ski|navegaci[oó]n|paseo)\b/i],
  ['compras',     /\b(recuerdos?|souvenirs?|ropa|regalos?|compras?|artesan[ií]as?|tiendas?)\b/i],
]

/** Categoría probable del viaje a partir de la descripción, o null si no hay pista. */
export function guessTripCategory(description: string): TripCategory | null {
  const d = description.trim()
  if (!d) return null
  for (const [cat, re] of TRIP_CAT_RULES) if (re.test(d)) return cat
  return null
}

// ── Fase del viaje (lo que la vista prioriza) ──────────────────────────────

/**
 * Como tripStage, pero distingue "terminó y está cuadrado" (done) de "cerrado
 * a mano" (closed): un viaje terminado sin deudas todavía se puede editar
 * hasta que alguien lo cierra.
 */
export type TripPhase = 'planning' | 'traveling' | 'settling' | 'done' | 'closed'

export const TRIP_PHASE_LABEL: Record<TripPhase, string> = {
  planning: 'Planificando', traveling: 'En viaje', settling: 'Por saldar', done: 'Terminado', closed: 'Cerrado',
}

export function tripPhase(
  g: { start_date: string | null; end_date: string | null; closed_at: string | null },
  today: string,
  anyPending: boolean,
): TripPhase {
  if (g.closed_at) return 'closed'
  const end = g.end_date ?? g.start_date
  if (end && today > end) return anyPending ? 'settling' : 'done'
  if (g.start_date && today >= g.start_date) return 'traveling'
  return 'planning'
}

function dayDiff(a: string, b: string): number {
  return Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000)
}

/** Días hasta la salida (null sin fecha o si ya salió). */
export function daysToStart(start: string | null, today: string): number | null {
  if (!start || start <= today) return null
  return dayDiff(today, start)
}

/** "Día 3 de 7" durante el viaje (total null si no hay fecha de vuelta). */
export function tripDay(start: string | null, end: string | null, today: string): { day: number; total: number | null } | null {
  if (!start || today < start) return null
  if (end && today > end) return null
  return { day: dayDiff(start, today) + 1, total: end ? dayDiff(start, end) + 1 : null }
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
