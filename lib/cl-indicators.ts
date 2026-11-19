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

  // Si mindicador.cl está lento o caído, una página que lo necesita (Anual,
  // Patrimonio) no debe colgarse: el fetch corta a los 5s y se sirve el último
  // valor cacheado aunque esté vencido.
  const stale = (cached?.history7d ?? null) as unknown as T | null
  try {
    const result = await fetcher()
    if (result === null) return stale
    await supabase.from('price_cache').upsert({
      ticker: cacheKey, price: 0, history7d: result as unknown as object, fetched_at: new Date().toISOString(),
    })
    return result
  } catch (err) {
    console.error(`[cl-indicators] ${cacheKey} unhandled:`, err)
    return stale
  }
}

// ── IPC oficial: Banco Central (BDE) ─────────────────────────────────────────
// mindicador.cl se quedó en dic 2025 (nov 2026: sin ningún mes de 2026), y el
// reajuste del arriendo necesita el IPC más reciente. La BDE del Banco Central
// publica la misma serie del INE (IPC base 2023=100) con API gratuita y token
// (BCCH_API_TOKEN, ver si3.bcentral.cl → Mi Cuenta → Apikey Token). Se usa el
// ÍNDICE y no la variación: la variación viene redondeada a 1 decimal, y el
// cociente de índices da el acumulado exacto de la ventana.
const BCCH_IPC_INDEX = 'F074.IPC.IND.Z.EP23.C.M'

interface BcchObs { indexDateString: string; value: string; statusCode?: string }

/**
 * Observaciones del índice IPC (dd-mm-yyyy + valor) → variación mensual en %
 * por mes (YYYY-MM-01). Sin redondear. Necesita el mes anterior para calcular
 * el primero, así que ese primero se descarta. Pura y testeada.
 */
export function ipcFromBcchIndex(obs: BcchObs[]): IpcObservation[] {
  const points = obs
    .filter(o => o.value !== null && o.value !== '' && !Number.isNaN(Number(o.value)))
    .map(o => {
      const [, mm, yyyy] = o.indexDateString.split('-')
      return { date: `${yyyy}-${mm}-01`, index: Number(o.value) }
    })
    .sort((a, b) => a.date.localeCompare(b.date))
  const out: IpcObservation[] = []
  for (let i = 1; i < points.length; i++) {
    out.push({ date: points[i].date, pctChange: (points[i].index / points[i - 1].index - 1) * 100 })
  }
  return out
}

async function fetchBcchIpc(token: string): Promise<IpcObservation[] | null> {
  const first = new Date(Date.now() - 20 * 30 * 86_400_000).toISOString().slice(0, 10)
  const url = `https://si3.bcentral.cl/SieteRestWS/SieteRestWS.ashx?token=${encodeURIComponent(token)}` +
    `&function=GetSeries&timeseries=${BCCH_IPC_INDEX}&firstdate=${first}`
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
  if (!res.ok) return null
  const raw = await res.json() as { Codigo?: number; Series?: { Obs?: BcchObs[] | null } }
  if (raw.Codigo !== 0 || !raw.Series?.Obs?.length) return null
  const obs = ipcFromBcchIndex(raw.Series.Obs)
  return obs.length > 0 ? obs : null
}

/**
 * Serie de IPC (% variación mensual). Fuente principal: Banco Central (si hay
 * BCCH_API_TOKEN); respaldo: mindicador.cl. Si ambas responden, lo del Banco
 * Central pisa a mindicador mes a mes (y agrega los meses que a mindicador le
 * faltan). Cache-first (24h).
 */
export async function fetchClIpcSeries(supabase: SupabaseClient): Promise<IpcObservation[] | null> {
  const mind = await fetchCached(supabase, 'CL_IPC', async () => {
    const res = await fetch('https://mindicador.cl/api/ipc', { cache: 'no-store', signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const raw = await res.json() as MindicadorSerie<unknown>
    const obs = (raw.serie ?? [])
      .map(o => ({ date: o.fecha.slice(0, 10), pctChange: o.valor }))  // mindicador ya entrega el día 01 de cada mes
      .sort((a, b) => a.date.localeCompare(b.date))
    return obs.length > 0 ? obs : null
  })

  const token = process.env.BCCH_API_TOKEN
  if (!token) return mind
  const bcch = await fetchCached(supabase, 'CL_IPC_BCCH', () => fetchBcchIpc(token))
  if (!bcch) return mind
  return mergeIpcSeries(mind ?? [], bcch)
}

/** Une dos series por mes; `primary` gana cuando ambas tienen el mismo mes. */
export function mergeIpcSeries(fallback: IpcObservation[], primary: IpcObservation[]): IpcObservation[] {
  const byMonth = new Map(fallback.map(o => [o.date, o]))
  for (const o of primary) byMonth.set(o.date, o)
  return [...byMonth.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/** Valor actual de la UF. Cache-first (24h) — la UF cambia una vez al día. */
export async function fetchClUf(supabase: SupabaseClient): Promise<UfObservation | null> {
  return fetchCached(supabase, 'CL_UF', async () => {
    const res = await fetch('https://mindicador.cl/api/uf', { cache: 'no-store', signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const raw = await res.json() as MindicadorSerie<unknown>
    const latest = (raw.serie ?? [])[0]
    if (!latest) return null
    return { date: latest.fecha.slice(0, 10), value: latest.valor }
  })
}

export interface UsdClpObservation {
  date:  string  // YYYY-MM-DD
  value: number  // CLP por 1 USD (dólar observado)
}

/**
 * ago 2026 (Cas: "que se viera la evolución por más meses" en Patrimonio) —
 * serie histórica del dólar observado, un año completo por llamada.
 * mindicador.cl/api/dolar/{year} trae ~250 observaciones (días hábiles) de
 * ese año. Cache-first (24h) en price_cache con clave sintética
 * `CL_DOLAR_{year}`, mismo patrón que IPC/UF. Usada por
 * computeNetWorthWeeklyHistory (lib/net-worth.ts) para reconstruir el valor
 * en CLP de acciones/billetera USD en fechas pasadas — NO reemplaza el
 * USDCLP "de hoy" que cachea sync-prices, que sigue siendo la fuente para el
 * patrimonio actual.
 */
export async function fetchClDolarYear(supabase: SupabaseClient, year: number): Promise<UsdClpObservation[] | null> {
  return fetchCached(supabase, `CL_DOLAR_${year}`, async () => {
    const res = await fetch(`https://mindicador.cl/api/dolar/${year}`, { cache: 'no-store', signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const raw = await res.json() as MindicadorSerie<unknown>
    const obs = (raw.serie ?? [])
      .map(o => ({ date: o.fecha.slice(0, 10), value: o.valor }))
      .sort((a, b) => a.date.localeCompare(b.date))
    return obs.length > 0 ? obs : null
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
