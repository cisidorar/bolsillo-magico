// ── Detección de gastos que se repiten y no tienen recurrente ───────────────
//
// Caso real (oct 2026): Claude (~$22.000 el 13 de cada mes) y ADT (el 15)
// llevaban meses cobrándose y registrándose a mano, pero nadie los había
// creado como recurrentes: no salían en Gastos recurrentes, en el flujo de
// caja ni en la carga mensual. En vez de esperar a que se note la falta, la
// app mira el historial y propone el recurrente.
//
// Función pura: recibe gastos y recurrentes ya cargados, devuelve candidatos.

export interface DetectExpense {
  id:                   string
  description:          string | null
  amount:               number
  date:                 string          // YYYY-MM-DD
  category_id:          string | null
  payment_method_id:    string | null
  recurring_expense_id: string | null
  shared_expense_id?:   string | null
}

export interface RecurringCandidate {
  /** Nombre normalizado: sirve de llave estable (descartar, dedup). */
  key:             string
  /** Descripción tal como se escribió la última vez. */
  name:            string
  /** Mediana de los últimos 3 cobros, redondeada. */
  amount:          number
  billingDay:      number
  intervalMonths:  number
  categoryId:      string | null
  paymentMethodId: string | null
  occurrences:     number
  lastDate:        string
  /** Gastos del grupo que se enlazan al recurrente al crearlo. */
  expenseIds:      string[]
}

/** "Netflix  ", "NETFLIX 2" y "Netflix." → "netflix". Sin tildes, dígitos ni signos. */
export function normalizeName(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const monthIndex = (d: string) => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7)) - 1
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Cadencias que se proponen: mensual, cada 2, 3 o 6 meses. */
const INTERVALS = [1, 2, 3, 6]
/** Ventana de historial que se mira. */
const WINDOW_MONTHS = 8
/** Máxima diferencia de día entre los últimos 3 cobros. */
const MAX_DAY_SPREAD = 4
/** Máxima razón entre el mayor y el menor de los últimos 3 montos. */
const MAX_AMOUNT_RATIO = 1.5

export function detectRecurring(
  expenses: DetectExpense[],
  existingNames: string[],
  today: string,
): RecurringCandidate[] {
  const todayIdx = monthIndex(today)
  const existing = existingNames.map(normalizeName).filter(n => n.length >= 3)
  const covered = (key: string) => existing.some(e => e === key || e.includes(key) || key.includes(e))

  const groups = new Map<string, DetectExpense[]>()
  for (const e of expenses) {
    if (!e.description || e.shared_expense_id) continue
    if (e.date > today || todayIdx - monthIndex(e.date) > WINDOW_MONTHS) continue
    const key = normalizeName(e.description)
    if (key.length < 3) continue
    groups.set(key, [...(groups.get(key) ?? []), e])
  }

  const out: RecurringCandidate[] = []
  for (const [key, list] of groups) {
    // Si algún gasto del grupo ya está enlazado a un recurrente, o el nombre ya existe, no hay nada que proponer.
    if (list.some(e => e.recurring_expense_id) || covered(key)) continue

    // Un cobro por mes (el último de cada mes).
    const byMonth = new Map<number, DetectExpense>()
    for (const e of [...list].sort((a, b) => a.date.localeCompare(b.date))) byMonth.set(monthIndex(e.date), e)
    const months = [...byMonth.keys()].sort((a, b) => a - b)
    if (months.length < 3) continue

    const last3 = months.slice(-3)
    const gaps = [last3[1] - last3[0], last3[2] - last3[1]]
    const interval = gaps[0]
    if (gaps[1] !== interval || !INTERVALS.includes(interval)) continue
    // Si dejó de cobrarse hace mucho, no es algo vigente.
    if (todayIdx - last3[2] > interval + 2) continue

    const recent = last3.map(i => byMonth.get(i)!)
    const days = recent.map(e => Number(e.date.slice(8, 10)))
    if (Math.max(...days) - Math.min(...days) > MAX_DAY_SPREAD) continue
    const amounts = recent.map(e => e.amount)
    if (Math.min(...amounts) <= 0 || Math.max(...amounts) / Math.min(...amounts) > MAX_AMOUNT_RATIO) continue

    const latest = recent[2]
    out.push({
      key,
      name: (latest.description ?? '').trim(),
      amount: Math.round(median(amounts)),
      billingDay: Math.min(28, Math.round(median(days))),
      intervalMonths: interval,
      categoryId: latest.category_id,
      paymentMethodId: latest.payment_method_id,
      occurrences: months.length,
      lastDate: latest.date,
      expenseIds: [...byMonth.values()].map(e => e.id),
    })
  }
  return out.sort((a, b) => b.occurrences - a.occurrences || b.amount - a.amount)
}
