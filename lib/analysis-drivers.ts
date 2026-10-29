// Análisis del mes: qué categorías explican el cambio vs. el mes anterior y a
// qué ritmo va el gasto. Funciones puras (sin I/O) para poder testearlas.

export interface CatTotal {
  id: string
  name: string
  color: string
  bg_color: string
  icon: string
  total: number
}

export interface CategoryDriver extends CatTotal {
  prevTotal: number
  delta: number            // CLP: total - prevTotal
  deltaPct: number | null  // null si no había gasto previo (categoría nueva)
  shareOfChange: number | null // % del cambio neto total que explica (null si el neto es ~0)
}

export interface DriversResult {
  netDelta: number
  up: CategoryDriver[]     // las que más subieron (delta > 0), mayor primero
  down: CategoryDriver[]   // las que más bajaron (delta < 0), mayor caída primero
}

/**
 * Compara el gasto por categoría del mes con el del mes anterior.
 * `minDelta` descarta cambios menores (ruido) para no listar categorías que
 * apenas se movieron.
 */
export function categoryDrivers(
  current: CatTotal[],
  prev: Record<string, number>,
  opts: { maxUp?: number; maxDown?: number; minDelta?: number } = {},
): DriversResult {
  const { maxUp = 3, maxDown = 2, minDelta = 1000 } = opts
  const rows = current.map(c => build(c, prev[c.id] ?? 0))

  // Una categoría que gastaste el mes anterior y este mes no aparece en
  // `current` (sin metadatos para mostrarla), pero su caída sí cuenta en el neto.
  const currentTotal = current.reduce((s, c) => s + c.total, 0)
  const prevTotalAll = Object.values(prev).reduce((s, v) => s + v, 0)
  const netDelta = currentTotal - prevTotalAll

  for (const r of rows) {
    r.shareOfChange = Math.abs(netDelta) >= 1 ? Math.round((r.delta / Math.abs(netDelta)) * 100) : null
  }

  const up = rows.filter(r => r.delta >= minDelta).sort((a, b) => b.delta - a.delta).slice(0, maxUp)
  const down = rows.filter(r => r.delta <= -minDelta).sort((a, b) => a.delta - b.delta).slice(0, maxDown)
  return { netDelta, up, down }
}

function build(c: CatTotal, prevTotal: number): CategoryDriver {
  const delta = c.total - prevTotal
  return {
    ...c,
    prevTotal,
    delta,
    deltaPct: prevTotal > 0 ? Math.round((delta / prevTotal) * 100) : null,
    shareOfChange: null,
  }
}

export interface PaceInput {
  budget: number | null
  spent: number
  projection: number | null      // cierre proyectado (ya incluye fijos pendientes)
  fixedStillDue: number          // fijos que aún no se registran este mes
  day: number                    // día del mes (1..daysInMonth)
  daysInMonth: number
}

export interface PaceResult {
  budgetUsedPct: number | null   // % del presupuesto ya gastado
  expectedPct: number            // % del mes transcurrido (dónde "deberías" ir)
  gap: number | null             // projection - budget (>0 = te pasarías)
  allowancePerDay: number | null // lo que puedes gastar por día para llegar al presupuesto
}

/**
 * Ritmo del mes actual vs. presupuesto. `allowancePerDay` descuenta los fijos
 * que aún faltan por registrarse: lo que queda es el margen variable real.
 */
export function monthPace(i: PaceInput): PaceResult {
  const expectedPct = Math.round((i.day / i.daysInMonth) * 100)
  const budgetUsedPct = i.budget && i.budget > 0 ? Math.round((i.spent / i.budget) * 100) : null
  const gap = i.budget !== null && i.projection !== null ? i.projection - i.budget : null
  const daysLeft = i.daysInMonth - i.day + 1 // incluye hoy
  const room = i.budget !== null ? i.budget - i.spent - i.fixedStillDue : null
  const allowancePerDay = room !== null && daysLeft > 0 ? Math.max(0, Math.floor(room / daysLeft)) : null
  return { budgetUsedPct, expectedPct, gap, allowancePerDay }
}

// ── Compras fuera de lo normal, comercios repetidos y línea base por categoría ──

export interface ExpenseLite {
  id: string
  amount: number
  date: string
  description?: string | null
  recurring_expense_id?: string | null
  category: { id: string; name: string; color: string; bg_color: string; icon: string } | null
}

const monthKeyOf = (e: { date: string }) => e.date.substring(0, 7)

export interface Anomaly {
  id: string
  description: string
  amount: number
  date: string
  category: NonNullable<ExpenseLite['category']>
  typical: number     // mediana de esa categoría (compras variables)
  multiple: number    // amount / typical, 1 decimal
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}

/**
 * Compras variables del mes que superan claramente lo habitual de su categoría.
 * Compara contra la mediana de las compras variables de la misma categoría en
 * los demás meses de la ventana (la mediana no se infla por la propia compra).
 * Exige historial suficiente: con pocas muestras no hay "normal" que comparar.
 */
export function findAnomalies(
  expenses: ExpenseLite[],
  selectedKey: string,
  opts: { minSamples?: number; minMultiple?: number; minAmount?: number; max?: number } = {},
): Anomaly[] {
  const { minSamples = 6, minMultiple = 2.5, minAmount = 15000, max = 3 } = opts
  const history: Record<string, number[]> = {}
  for (const e of expenses) {
    if (!e.category || e.recurring_expense_id || monthKeyOf(e) === selectedKey) continue
    ;(history[e.category.id] ??= []).push(e.amount)
  }
  const out: Anomaly[] = []
  for (const e of expenses) {
    if (!e.category || e.recurring_expense_id || monthKeyOf(e) !== selectedKey) continue
    const h = history[e.category.id]
    if (!h || h.length < minSamples) continue
    const typical = median(h)
    if (typical <= 0 || e.amount < minAmount || e.amount < typical * minMultiple) continue
    out.push({
      id: e.id,
      description: (e.description ?? '').trim() || e.category.name,
      amount: e.amount,
      date: e.date,
      category: e.category,
      typical,
      multiple: Math.round((e.amount / typical) * 10) / 10,
    })
  }
  return out.sort((a, b) => b.amount - a.amount).slice(0, max)
}

export interface Merchant {
  key: string
  label: string
  count: number
  total: number
  avg: number
  prevCount: number   // veces en el mes anterior (para ver si es hábito)
}

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()

/** Comercios/descripciones que se repiten en el mes (compras variables). */
export function topMerchants(
  expenses: ExpenseLite[],
  selectedKey: string,
  prevKey: string,
  opts: { minCount?: number; max?: number } = {},
): Merchant[] {
  const { minCount = 2, max = 5 } = opts
  const cur: Record<string, { label: string; count: number; total: number }> = {}
  const prevCount: Record<string, number> = {}
  for (const e of expenses) {
    if (e.recurring_expense_id || !e.description) continue
    const key = norm(e.description)
    if (!key) continue
    const mk = monthKeyOf(e)
    if (mk === selectedKey) {
      const m = (cur[key] ??= { label: e.description.trim(), count: 0, total: 0 })
      m.count++
      m.total += e.amount
    } else if (mk === prevKey) {
      prevCount[key] = (prevCount[key] ?? 0) + 1
    }
  }
  return Object.entries(cur)
    .filter(([, m]) => m.count >= minCount)
    .map(([key, m]) => ({ key, label: m.label, count: m.count, total: m.total, avg: Math.round(m.total / m.count), prevCount: prevCount[key] ?? 0 }))
    .sort((a, b) => b.total - a.total)
    .slice(0, max)
}

/**
 * Promedio mensual por categoría en los meses anteriores al seleccionado
 * (solo meses con gasto en esa categoría; exige `minMonths` para ser confiable).
 */
export function categoryBaseline(
  expenses: ExpenseLite[],
  selectedKey: string,
  minMonths = 3,
): Record<string, { avg: number; months: number }> {
  const perCatMonth: Record<string, Record<string, number>> = {}
  for (const e of expenses) {
    if (!e.category) continue
    const mk = monthKeyOf(e)
    if (mk >= selectedKey) continue
    const c = (perCatMonth[e.category.id] ??= {})
    c[mk] = (c[mk] ?? 0) + e.amount
  }
  const out: Record<string, { avg: number; months: number }> = {}
  for (const [id, months] of Object.entries(perCatMonth)) {
    const vals = Object.values(months)
    if (vals.length < minMonths) continue
    out[id] = { avg: Math.round(vals.reduce((s, v) => s + v, 0) / vals.length), months: vals.length }
  }
  return out
}
