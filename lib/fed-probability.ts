import type { SupabaseClient } from '@supabase/supabase-js'

// ── Probabilidad de movimiento de la Fed (sep 2026, Cas: "cuando hay próxima
// tasa fed y cuanta es la probabilidad que suba o baje") ────────────────────
// ROADMAP-macro-tasas.md había descartado "a propósito" una probabilidad tipo
// CME FedWatch por falta de una fuente gratuita y confiable — eso sigue
// siendo cierto para CME (sin API pública). Pero Kalshi (bolsa de mercados de
// predicción regulada por la CFTC) expone SIN AUTENTICACIÓN un mercado por
// cada posible techo de tasa tras cada reunión ("¿el techo del rango
// terminará sobre X%?"), y el precio de cada contrato ES la probabilidad de
// mercado por construcción — un contrato a 51¢ es 51% de probabilidad, no
// una inferencia. Es la misma info que resume la prensa ("la decisión de
// septiembre está en un empate técnico") pero de la fuente primaria, sin
// scrapear una página con formato que puede cambiar.
//
// El rango vigente [L, L+0.25] se ancla con DFF (tasa efectiva ya cacheada
// por lib/macro-fetch.ts), no se infiere de las probabilidades mismas: un
// heurístico que busca "el primer precio bajo cierto umbral" en la escalera
// de contratos fallaría si el mercado le diera, por ejemplo, 90%+ a una
// subida (el techo vigente también tendría precio alto ahí, y el
// heurístico se saltaría de largo). DFF es un hecho (la tasa de HOY), no una
// inferencia sobre probabilidades que pueden estar sesgadas hacia un lado.

const KALSHI_MONTH: Record<string, string> = {
  '01': 'JAN', '02': 'FEB', '03': 'MAR', '04': 'APR', '05': 'MAY', '06': 'JUN',
  '07': 'JUL', '08': 'AUG', '09': 'SEP', '10': 'OCT', '11': 'NOV', '12': 'DEC',
}

/** 'YYYY-MM-DD' de una reunión FOMC → ticker de evento de Kalshi (ej. 'KXFED-26SEP'). */
export function kalshiEventTicker(meetingDate: string): string | null {
  const [y, m] = meetingDate.split('-')
  const mon = KALSHI_MONTH[m]
  if (!y || !mon) return null
  return `KXFED-${y.slice(2)}${mon}`
}

export interface KalshiFedMarket {
  floor_strike: number
  last_price_dollars: string   // ej. "0.5100"
}

export interface FedMeetingProbability {
  rangeLowPct:  number   // techo vigente inferior, ej. 3.50
  rangeHighPct: number   // techo vigente superior, ej. 3.75
  pHikePct:     number   // 0-100, suman 100 entre las 3 (redondeo ajustado)
  pHoldPct:     number
  pCutPct:      number
}

/** Puramente aritmético — separado de fetchFedMeetingProbability para poder
 *  testear con datos sintéticos sin red ni Supabase (mismo patrón que
 *  computeRatePath en lib/rate-path.ts). null si Kalshi no tiene listados
 *  los dos contratos que definen el rango vigente (evento muy nuevo, o el
 *  rango vigente cayó justo en un límite de escalera no publicado). */
export function computeFedMeetingProbability(
  markets: KalshiFedMarket[],
  currentRateDff: number,
): FedMeetingProbability | null {
  if (markets.length === 0) return null

  const rangeLow  = Math.round(Math.floor(currentRateDff / 0.25) * 0.25 * 100) / 100
  const rangeHigh = Math.round((rangeLow + 0.25) * 100) / 100

  const findMarket = (strike: number) =>
    markets.find(m => Math.abs(m.floor_strike - strike) < 0.01)

  const lowMarket  = findMarket(rangeLow)
  const highMarket = findMarket(rangeHigh)
  if (!lowMarket || !highMarket) return null

  const pHikeRaw       = Number(highMarket.last_price_dollars) * 100
  const pAboveLowRaw   = Number(lowMarket.last_price_dollars) * 100
  const pCutRaw        = Math.max(0, 100 - pAboveLowRaw)
  if (Number.isNaN(pHikeRaw) || Number.isNaN(pCutRaw)) return null

  // Redondear hike/cut primero y derivar "mantiene" del resto — así los tres
  // siempre suman exactamente 100 en pantalla (redondear los tres por
  // separado puede dar 101 o 99 por error de redondeo independiente).
  const pHikePct = Math.max(0, Math.min(100, Math.round(pHikeRaw)))
  const pCutPct  = Math.max(0, Math.min(100 - pHikePct, Math.round(pCutRaw)))
  const pHoldPct = 100 - pHikePct - pCutPct

  return { rangeLowPct: rangeLow, rangeHighPct: rangeHigh, pHikePct, pHoldPct, pCutPct }
}

const FED_PROB_TTL_H = 6

/** Probabilidad de mercado (Kalshi, público, sin API key) de que la Fed suba,
 *  mantenga o baje en `meetingDate` — cache-first (6h, se mueve más rápido
 *  que las series de FRED que se cachean 24h) en price_cache. null si Kalshi
 *  no tiene el evento listado, si falta DFF para anclar el rango vigente, o
 *  si algo no calza (degradación limpia, mismo criterio que lib/macro-fetch.ts:
 *  nunca rompe la página, la card simplemente no muestra esta línea). */
export async function fetchFedMeetingProbability(
  supabase: SupabaseClient,
  meetingDate: string,
  currentRateDff: number,
): Promise<FedMeetingProbability | null> {
  const cacheKey = `FED_PROB_${meetingDate}`
  const { data: cached } = await supabase
    .from('price_cache')
    .select('history7d, fetched_at')
    .eq('ticker', cacheKey)
    .maybeSingle()
  if (cached?.history7d && Date.now() - new Date(cached.fetched_at).getTime() < FED_PROB_TTL_H * 3_600_000) {
    return cached.history7d as unknown as FedMeetingProbability
  }

  const eventTicker = kalshiEventTicker(meetingDate)
  if (!eventTicker) return null

  try {
    const res = await fetch(`https://api.elections.kalshi.com/trade-api/v2/markets?event_ticker=${eventTicker}`, { cache: 'no-store' })
    if (!res.ok) return null
    const raw = await res.json() as { markets?: KalshiFedMarket[] }
    const result = computeFedMeetingProbability(raw.markets ?? [], currentRateDff)
    if (!result) return null

    await supabase.from('price_cache').upsert({
      ticker: cacheKey, price: 0, history7d: result as unknown as object, fetched_at: new Date().toISOString(),
    })
    return result
  } catch (err) {
    console.error('[fed-probability] unhandled:', err)
    return null
  }
}
