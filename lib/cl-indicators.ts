import type { SupabaseClient } from '@supabase/supabase-js'

// ── E5 (roadmap economía personal, jul 2026): IPC y UF de Chile ─────────────
// mindicador.cl — API pública chilena, sin key, sin límite práctico para este
// uso. Mismo patrón cache-first en price_cache que lib/macro-fetch.ts
// (FRED/EEUU): TTL 24h, server-only, se degrada a "sin dato" si la fetch
// falla — nunca rompe la página. A propósito de alcance chico (ver
// ROADMAP-economia-personal.md § E5): esto NO es un dashboard macro nuevo,
// son los datos crudos para dos usos puntuales — toggle "en pesos de hoy" en
// /analisis (vista anual + proyección) y la UF donde viven los depósitos a
// plazo reajustables.

const CL_TTL_H = 24

export interface IpcObservation {
  date:      string  // YYYY-MM-01
  pctChange: number  // % de variación mensual (IPC de mindicador.cl viene así, no como índice)
}

export interface UfObservation {
  date:  string  // YYYY-MM-DD
  value: number  // CLP
}

interface MindicadorSerie<T> { serie: { fecha: string; valor: number }[] }

async function fetchCached<T>(supabase: SupabaseClient, cacheKey: string, fetcher: () => Promise<T | null>): Promise<T | null> {
  const { data: cached } = await supabase
    .from('price_cache')
    .select('history7d, fetched_at')
    .eq('ticker', cacheKey)
    .maybeSingle()
  if (cached?.history7d && Date.now() - new Date(cached.fetched_at).getTime() < CL_TTL_H * 3_600_000) {
    return cached.history7d as unknown as T
  }

  try {
    const result = await fetcher()
    if (result === null) return null
    await supabase.from('price_cache').upsert({
      ticker: cacheKey, price: 0, history7d: result as unknown as object, fetched_at: new Date().toISOString(),
    })
    return result
  } catch (err) {
    console.error(`[cl-indicators] ${cacheKey} unhandled:`, err)
    return null
  }
}

/** Serie de IPC (% variación mensual), últimos ~12-13 meses según mindicador.cl. Cache-first (24h). */
export async function fetchClIpcSeries(supabase: SupabaseClient): Promise<IpcObservation[] | null> {
  return fetchCached(supabase, 'CL_IPC', async () => {
    const res = await fetch('https://mindicador.cl/api/ipc', { cache: 'no-store' })
    if (!res.ok) return null
    const raw = await res.json() as MindicadorSerie<unknown>
    const obs = (raw.serie ?? [])
      .map(o => ({ date: o.fecha.slice(0, 10), pctChange: o.valor }))  // mindicador ya entrega el día 01 de cada mes
      .sort((a, b) => a.date.localeCompare(b.date))
    return obs.length > 0 ? obs : null
  })
}

/** Valor actual de la UF. Cache-first (24h) — la UF cambia una vez al día. */
export async function fetchClUf(supabase: SupabaseClient): Promise<UfObservation | null> {
  return fetchCached(supabase, 'CL_UF', async () => {
    const res = await fetch('https://mindicador.cl/api/uf', { cache: 'no-store' })
    if (!res.ok) return null
    const raw = await res.json() as MindicadorSerie<unknown>
    const latest = (raw.serie ?? [])[0]
    if (!latest) return null
    return { date: latest.fecha.slice(0, 10), value: latest.valor }
  })
}

// ── Cálculos puros (deterministas, testeados) ────────────────────────────────

/**
 * Factor acumulado de inflación entre `fromDate` (exclusive) y `toDate`
 * (inclusive) — multiplica (1 + pct/100) de cada mes de la serie estrictamente
 * después de `fromDate` y hasta `toDate`. 1 si no hay meses en el rango o
 * `fromDate` >= `toDate`.
 */
export function cumulativeInflationFactor(series: IpcObservation[], fromDate: string, toDate: string): number {
  if (fromDate >= toDate) return 1
  let factor = 1
  for (const obs of series) {
    if (obs.date > fromDate && obs.date <= toDate) {
      factor *= 1 + obs.pctChange / 100
    }
  }
  return factor
}

/**
 * Expresa un monto nominal de `fromDate` en pesos de `toDate` (más reciente)
 * — sube el monto por la inflación acumulada en el período, porque un peso de
 * `fromDate` compraba más que un peso de `toDate`.
 */
export function toTodayPesos(nominalAmount: number, fromDate: string, toDate: string, series: IpcObservation[]): number {
  return Math.round(nominalAmount * cumulativeInflationFactor(series, fromDate, toDate))
}

/**
 * Inflación anualizada trailing (compone los últimos `months` meses de la
 * serie hasta `asOfDate`) — sirve como tasa asumida razonable, basada en
 * datos reales recientes, para deflactar proyecciones a FUTURO (que
 * mindicador.cl no puede dar, al ser histórico). null si no hay suficientes
 * meses en la serie.
 */
export function trailingAnnualInflation(series: IpcObservation[], asOfDate: string, months = 12): number | null {
  const upTo = series.filter(o => o.date <= asOfDate).slice(-months)
  if (upTo.length < months) return null
  const factor = upTo.reduce((f, o) => f * (1 + o.pctChange / 100), 1)
  return Math.round((factor - 1) * 1000) / 10  // % con 1 decimal
}

/**
 * Retorno real vía ecuación de Fisher: (1+nominal)/(1+inflación) − 1. En
 * Chile es casi obligatorio mostrarlo — un depósito al 12% con IPC 4% rinde
 * ~7,7% real, no 8% (la resta simple sobrestima el retorno real).
 */
export function realReturnPct(nominalPct: number, inflationPct: number): number {
  return Math.round((((1 + nominalPct / 100) / (1 + inflationPct / 100)) - 1) * 1000) / 10
}
