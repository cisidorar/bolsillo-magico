// Lecturas de tendencia sobre meses COMPLETOS (el mes en curso queda fuera:
// compararlo parcial contra meses enteros distorsiona). Funciones puras.

import type { ExpenseLite } from './analysis-drivers'

type Cat = NonNullable<ExpenseLite['category']>

const monthKey = (e: { date: string }) => e.date.substring(0, 7)

export interface FixedShare { key: string; fixed: number; total: number; pct: number }

/** Gasto fijo (recurrentes) vs. total, por mes. */
export function fixedShare(expenses: ExpenseLite[], keys: string[]): FixedShare[] {
  return keys.map(key => {
    let fixed = 0, total = 0
    for (const e of expenses) {
      if (monthKey(e) !== key) continue
      total += e.amount
      if (e.recurring_expense_id) fixed += e.amount
    }
    return { key, fixed, total, pct: total > 0 ? Math.round((fixed / total) * 100) : 0 }
  })
}

export interface Rising { category: Cat; totals: [number, number, number]; growthPct: number }

/**
 * Categorías que subieron 3 meses seguidos (últimas 3 claves, de más antigua a
 * más reciente): un cambio estructural, no un pico. Exige +30% y monto relevante.
 */
export function risingCategories(
  expenses: ExpenseLite[],
  keys: string[],
  opts: { minLast?: number; minGrowth?: number; max?: number } = {},
): Rising[] {
  const { minLast = 20000, minGrowth = 1.3, max = 3 } = opts
  if (keys.length < 3) return []
  const last3 = keys.slice(-3)
  const per: Record<string, { category: Cat; t: [number, number, number] }> = {}
  for (const e of expenses) {
    if (!e.category) continue
    const i = last3.indexOf(monthKey(e))
    if (i < 0) continue
    const row = (per[e.category.id] ??= { category: e.category, t: [0, 0, 0] })
    row.t[i] += e.amount
  }
  return Object.values(per)
    .filter(r => r.t[0] > 0 && r.t[0] < r.t[1] && r.t[1] < r.t[2] && r.t[2] >= minLast && r.t[2] >= r.t[0] * minGrowth)
    .map(r => ({ category: r.category, totals: r.t, growthPct: Math.round(((r.t[2] - r.t[0]) / r.t[0]) * 100) }))
    .sort((a, b) => (b.totals[2] - b.totals[0]) - (a.totals[2] - a.totals[0]))
    .slice(0, max)
}

export interface BudgetMismatch { category: Cat; limit: number; typical: number; kind: 'low' | 'high' }

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}

/**
 * Presupuestos que no sirven como señal: el gasto típico (mediana de los últimos
 * meses completos) es ≥2× el límite (se excede siempre) o ≤40% (sobra siempre).
 */
export function budgetMismatches(
  expenses: ExpenseLite[],
  keys: string[],
  limits: Record<string, number>,
  opts: { minDiff?: number; max?: number } = {},
): BudgetMismatch[] {
  const { minDiff = 15000, max = 3 } = opts
  const useKeys = keys.slice(-3)
  if (useKeys.length < 3) return []
  const per: Record<string, { category: Cat; t: number[] }> = {}
  for (const e of expenses) {
    if (!e.category || !(e.category.id in limits)) continue
    const i = useKeys.indexOf(monthKey(e))
    if (i < 0) continue
    const row = (per[e.category.id] ??= { category: e.category, t: [0, 0, 0] })
    row.t[i] += e.amount
  }
  const out: BudgetMismatch[] = []
  for (const r of Object.values(per)) {
    const limit = limits[r.category.id]
    if (!limit || limit <= 0 || r.t.filter(v => v > 0).length < 2) continue
    const typical = median(r.t)
    if (Math.abs(typical - limit) < minDiff) continue
    if (typical >= limit * 2) out.push({ category: r.category, limit, typical, kind: 'low' })
    else if (typical <= limit * 0.4) out.push({ category: r.category, limit, typical, kind: 'high' })
  }
  return out.sort((a, b) => Math.abs(b.typical - b.limit) - Math.abs(a.typical - a.limit)).slice(0, max)
}
