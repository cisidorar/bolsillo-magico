// Lecturas de Recurrentes que cruzan varias fuentes. Funciones puras: la página
// arma los datos (fechas de cobro, historial de montos) y esto los resume.

export interface UpcomingCharge { id: string; name: string; date: string; amount: number; days: number }

/**
 * Cargos que caen en los próximos `withinDays` días (hoy incluido), del más
 * cercano al más lejano. `today` en YYYY-MM-DD.
 */
export function upcomingCharges(
  items: { id: string; name: string; amount: number; dateStr: string }[],
  today: string,
  withinDays = 7,
): UpcomingCharge[] {
  const t = new Date(today + 'T12:00:00').getTime()
  return items
    .map(i => ({ id: i.id, name: i.name, date: i.dateStr, amount: i.amount, days: Math.round((new Date(i.dateStr + 'T12:00:00').getTime() - t) / 86_400_000) }))
    .filter(i => i.days >= 0 && i.days <= withinDays)
    .sort((a, b) => a.days - b.days || b.amount - a.amount)
}

export interface PriceMove { id: string; name: string; delta: number; current: number; annualImpact: number }

/**
 * Impacto anual de los cambios de precio: delta × veces que se cobra al año
 * (12 mensual, 12/N cada N meses, 1 anual). Ordena por impacto absoluto.
 */
export function priceImpact(
  moves: { id: string; name: string; delta: number; current: number; interval_months: number; annual: boolean }[],
): { moves: PriceMove[]; netAnnual: number } {
  const out = moves
    .filter(m => m.delta !== 0)
    .map(m => ({
      id: m.id, name: m.name, delta: m.delta, current: m.current,
      annualImpact: Math.round(m.delta * (m.annual ? 1 : 12 / Math.max(m.interval_months || 1, 1))),
    }))
    .sort((a, b) => Math.abs(b.annualImpact) - Math.abs(a.annualImpact))
  return { moves: out, netAnnual: out.reduce((s, m) => s + m.annualImpact, 0) }
}

export interface CategoryWeight { key: string; name: string; color: string; monthly: number; count: number; pct: number }

/** Peso de cada categoría en la carga mensual (anuales /12, "cada N meses" /N). */
export function categoryWeights(
  items: { amount: number; interval_months: number; annual: boolean; category: { id: string; name: string; color: string } | null }[],
): CategoryWeight[] {
  const acc: Record<string, { name: string; color: string; monthly: number; count: number }> = {}
  for (const r of items) {
    const key = r.category?.id ?? 'sin'
    const eq = r.annual ? r.amount / 12 : r.amount / Math.max(r.interval_months || 1, 1)
    acc[key] ??= { name: r.category?.name ?? 'Sin categoría', color: r.category?.color ?? '#94A3B8', monthly: 0, count: 0 }
    acc[key].monthly += eq
    acc[key].count += 1
  }
  const total = Object.values(acc).reduce((s, c) => s + c.monthly, 0)
  return Object.entries(acc)
    .map(([key, c]) => ({ key, name: c.name, color: c.color, monthly: Math.round(c.monthly), count: c.count, pct: total > 0 ? Math.round((c.monthly / total) * 100) : 0 }))
    .sort((a, b) => b.monthly - a.monthly)
}
