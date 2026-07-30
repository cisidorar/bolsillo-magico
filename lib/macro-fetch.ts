import type { SupabaseClient } from '@supabase/supabase-js'
import type { Observation } from '@/lib/yoy-change'

// ── Contexto macro (S1 del plan docs/PLAN_INFORME_SEMANAL.md) ────────────────
// FRED (Federal Reserve Economic Data) — API gratuita, sin límite práctico
// para este uso (una consulta por serie, cacheada 24h). Mismo patrón que
// lib/earnings-fetch.ts: cache-first en price_cache con clave sintética,
// server-only, se degrada a "sin dato" si falta la key — nunca rompe la
// página. La IA no participa: FRED entrega números, esto solo los persiste
// y los deja en la forma que necesitan lib/yield-curve.ts y lib/yoy-change.ts.

export const MACRO_SERIES = [
  { id: 'DFF',        label: 'Tasa de fondos federales', unit: '%',          days: 30  },
  { id: 'DGS10',      label: 'Bono del Tesoro 10 años',  unit: '%',          days: 30  },
  // M2 (roadmap macro/tasas, jul 2026): 30 días alcanzaba para el nivel actual
  // (yield curve, rate-path) pero no para lib/rate-sensitivity.ts, que
  // necesita ≥120 observaciones diarias en común con cada ticker — 200 días
  // calendario da margen de sobra tras descontar fines de semana/feriados.
  { id: 'DGS2',       label: 'Bono del Tesoro 2 años',   unit: '%',          days: 200 },
  { id: 'DCOILWTICO', label: 'Petróleo WTI',             unit: 'USD/barril', days: 30  },
  { id: 'CPIAUCSL',   label: 'Inflación EEUU (IPC)',     unit: 'índice',     days: 450 },   // mensual: necesita >12 meses para YoY
] as const

export type MacroSeriesId = typeof MACRO_SERIES[number]['id']

export interface MacroSeriesData {
  series:       MacroSeriesId
  label:        string
  unit:         string
  observations: Observation[]   // ascendente por fecha, sin huecos "." de FRED
  asOf:         string
}

const MACRO_TTL_H = 24

/** Observaciones de `seriesId` — cache-first (24h) en price_cache, FRED si expiró.
 *  null si no hay FRED_API_KEY configurada o la serie no devolvió datos. */
export async function fetchMacroSeries(
  supabase: SupabaseClient,
  seriesId: MacroSeriesId,
): Promise<MacroSeriesData | null> {
  const meta = MACRO_SERIES.find(s => s.id === seriesId)
  if (!meta) return null

  const cacheKey = `MACRO_${seriesId}`
  const { data: cached } = await supabase
    .from('price_cache')
    .select('history7d, fetched_at')
    .eq('ticker', cacheKey)
    .maybeSingle()
  if (cached?.history7d && Date.now() - new Date(cached.fetched_at).getTime() < MACRO_TTL_H * 3_600_000) {
    return cached.history7d as unknown as MacroSeriesData
  }

  const fredKey = process.env.FRED_API_KEY
  if (!fredKey) return null   // sin key configurada: la sección macro simplemente no se muestra

  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${fredKey}&file_type=json&sort_order=desc&limit=${meta.days}`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null

    const raw = await res.json() as { observations?: { date: string; value: string }[] }
    const observations: Observation[] = (raw.observations ?? [])
      .filter(o => o.value !== '.')   // FRED marca los faltantes con "."
      .map(o => ({ date: o.date, value: Number(o.value) }))
      .filter(o => !Number.isNaN(o.value))
      .sort((a, b) => a.date.localeCompare(b.date))

    if (observations.length === 0) return null

    const result: MacroSeriesData = {
      series: seriesId, label: meta.label, unit: meta.unit, observations,
      asOf: new Date().toISOString(),
    }
    await supabase.from('price_cache').upsert({
      ticker: cacheKey, price: 0, history7d: result as unknown as object, fetched_at: result.asOf,
    })
    return result
  } catch (err) {
    console.error(`[macro-fetch] ${seriesId} unhandled:`, err)
    return null
  }
}

/** Trae las 5 series macro en paralelo — algunas pueden volver null (sin key
 *  o sin datos) sin que eso tumbe las demás. */
export async function fetchAllMacroSeries(supabase: SupabaseClient): Promise<Record<MacroSeriesId, MacroSeriesData | null>> {
  const entries = await Promise.all(MACRO_SERIES.map(async s => [s.id, await fetchMacroSeries(supabase, s.id)] as const))
  return Object.fromEntries(entries) as Record<MacroSeriesId, MacroSeriesData | null>
}
