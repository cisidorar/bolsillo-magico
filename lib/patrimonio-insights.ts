// Lecturas de Patrimonio que cruzan varias fuentes (inversión, ahorro,
// depósitos, arriendo). Funciones puras: los datos se arman en la página.

export interface LiquidityInput {
  savings: number                                   // CLP en cuentas de ahorro (disponible hoy)
  deposits: { value: number; maturity_date: string }[] // DAP con capital + interés devengado
  invested: number                                  // acciones + caja USD en CLP (se venden en 2–3 días)
  today: string                                     // YYYY-MM-DD
}

export interface LiquidityBucket { key: 'now' | 'invested' | 'd30' | 'd90' | 'later'; label: string; total: number }

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86_400_000)
}

/**
 * Cuánta plata tienes disponible y cuándo: hoy (ahorro + depósitos ya vencidos),
 * en 2–3 días (venta de acciones/dólares), hasta 30 días, hasta 90 y después.
 */
export function liquidityLadder(i: LiquidityInput): LiquidityBucket[] {
  let now = i.savings, d30 = 0, d90 = 0, later = 0
  for (const d of i.deposits) {
    const days = daysBetween(i.today, d.maturity_date)
    if (days <= 0) now += d.value
    else if (days <= 30) d30 += d.value
    else if (days <= 90) d90 += d.value
    else later += d.value
  }
  return [
    { key: 'now' as const,      label: 'Hoy',                              total: Math.round(now) },
    { key: 'invested' as const, label: 'En 2–3 días (acciones y dólares)', total: Math.round(i.invested) },
    { key: 'd30' as const,      label: 'En 30 días o menos',               total: Math.round(d30) },
    { key: 'd90' as const,      label: 'En 31–90 días',                    total: Math.round(d90) },
    { key: 'later' as const,    label: 'Después de 90 días',               total: Math.round(later) },
  ].filter(b => b.total > 0)
}

export interface GainResult {
  contributed: number
  value: number
  gain: number
  pct: number | null
  since: string | null   // fecha del primer aporte
}

/**
 * Ganancia acumulada del mundo USD en pesos: lo que valen hoy acciones + caja
 * contra lo que pagaste en CLP por los dólares. Incluye el efecto del tipo de
 * cambio. No descuenta retiros a pesos (no se registran).
 */
export function gainSinceStart(deposits: { total_paid_clp: number | null; purchase_date: string }[], value: number): GainResult | null {
  const rows = deposits.filter(d => (d.total_paid_clp ?? 0) > 0)
  if (rows.length === 0) return null
  const contributed = rows.reduce((s, d) => s + (d.total_paid_clp ?? 0), 0)
  const since = rows.map(d => d.purchase_date).sort()[0]
  const gain = Math.round(value - contributed)
  return { contributed, value: Math.round(value), gain, pct: contributed > 0 ? Math.round((gain / contributed) * 1000) / 10 : null, since }
}

export interface ActiveLease { property: string; rent: number; end_date: string | null }

/** Contratos vigentes hoy (sin fecha de término o aún no vencidos). */
export function activeLeases(
  leases: { rent_amount: number; start_date: string; end_date: string | null; property: { alias: string } | null }[],
  today: string,
): ActiveLease[] {
  return leases
    .filter(l => l.start_date <= today && (l.end_date === null || l.end_date >= today))
    .map(l => ({ property: l.property?.alias ?? 'Propiedad', rent: l.rent_amount, end_date: l.end_date }))
}
