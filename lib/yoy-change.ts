// ── Variación interanual (YoY) genérica ──────────────────────────────────────
// Series como el IPC (CPIAUCSL) son un ÍNDICE, no un porcentaje — "inflación"
// es siempre la variación de ese índice contra el mismo mes del año anterior.
// Genérico (no atado a FRED ni a CPI) para poder testear con datos fijos y
// reusar en cualquier serie mensual que necesite esta misma comparación.

export interface Observation {
  date:  string   // YYYY-MM-DD
  value: number
}

export interface YoyChangeResult {
  currentValue:  number
  currentDate:   string
  yearAgoValue:  number
  yearAgoDate:   string
  pctChange:     number
}

/** Fecha exactamente un año antes de `dateStr` (maneja 29-feb con seguridad). */
function oneYearBefore(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setFullYear(d.getFullYear() - 1)
  return d.toISOString().slice(0, 10)
}

/** Observación más cercana a `date`, buscando HACIA ATRÁS — mismo criterio
 *  que closeOnOrBefore en lib/benchmark.ts (el último dato real conocido). */
function nearestOnOrBefore(sorted: Observation[], date: string): Observation | null {
  let best: Observation | null = null
  for (const o of sorted) {
    if (o.date > date) break
    best = o
  }
  return best
}

/**
 * Variación % de `observations` (serie mensual o diaria, cualquier orden)
 * entre la fecha más reciente ≤ `asOfDate` y su equivalente de hace un año.
 * null si falta historia suficiente (menos de ~1 año de datos) o el valor
 * base es cero (evita división por cero / Infinity).
 */
export function computeYoyChange(observations: Observation[], asOfDate: string): YoyChangeResult | null {
  if (observations.length === 0) return null
  const sorted = [...observations].sort((a, b) => a.date.localeCompare(b.date))

  const current = nearestOnOrBefore(sorted, asOfDate)
  if (!current) return null

  const yearAgoTarget = oneYearBefore(current.date)
  const yearAgo = nearestOnOrBefore(sorted, yearAgoTarget)
  if (!yearAgo || yearAgo.value === 0) return null

  return {
    currentValue: current.value,
    currentDate:  current.date,
    yearAgoValue: yearAgo.value,
    yearAgoDate:  yearAgo.date,
    pctChange:    ((current.value - yearAgo.value) / yearAgo.value) * 100,
  }
}
