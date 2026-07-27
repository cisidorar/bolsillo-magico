import type { SupabaseClient } from '@supabase/supabase-js'
import type { EarningsInfo } from '@/lib/earnings'

// ── Fetch + cache de próxima fecha de resultados, compartido ────────────────
// Extraído de app/api/stock-earnings/route.ts (D3, roadmap de calidad de
// decisión) para que el Server Component del informe semanal (S2) pueda
// leer/pedir earnings de varios tickers sin pasar por un roundtrip HTTP a su
// propia API — llama a la MISMA función server-side, con el MISMO cache de
// 24h en price_cache (clave sintética `${symbol}_EARNINGS`), sin duplicar la
// lógica de Finnhub. server-only: nunca importar desde un componente cliente.

const EARNINGS_TTL_H = 24
const LOOKAHEAD_D = 120   // suficiente para siempre encontrar el próximo trimestre

/** Próxima fecha de resultados para `symbol` — cache-first, Finnhub si expiró. */
export async function fetchEarnings(supabase: SupabaseClient, symbol: string): Promise<EarningsInfo> {
  const cacheKey = `${symbol}_EARNINGS`

  const { data: cached } = await supabase
    .from('price_cache')
    .select('history7d, fetched_at')
    .eq('ticker', cacheKey)
    .maybeSingle()
  if (cached?.history7d && Date.now() - new Date(cached.fetched_at).getTime() < EARNINGS_TTL_H * 3_600_000) {
    return cached.history7d as unknown as EarningsInfo
  }

  const fhKey = process.env.FINNHUB_API_KEY
  if (!fhKey) return { symbol, nextDate: null, asOf: new Date().toISOString() }

  const from = new Date().toISOString().slice(0, 10)
  const to   = new Date(Date.now() + LOOKAHEAD_D * 86_400_000).toISOString().slice(0, 10)

  try {
    const fhRes = await fetch(
      `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&symbol=${symbol}&token=${fhKey}`,
      { cache: 'no-store' },
    )
    if (!fhRes.ok) {
      const empty: EarningsInfo = { symbol, nextDate: null, asOf: new Date().toISOString() }
      await supabase.from('price_cache').upsert({
        ticker: cacheKey, price: 0, history7d: empty as unknown as object, fetched_at: empty.asOf,
      })
      return empty
    }

    const raw = await fhRes.json() as { earningsCalendar?: { date?: string; symbol?: string }[] }
    const dates = (raw.earningsCalendar ?? [])
      .filter(e => e.date && e.symbol === symbol)
      .map(e => e.date as string)
      .sort()

    const result: EarningsInfo = { symbol, nextDate: dates[0] ?? null, asOf: new Date().toISOString() }
    await supabase.from('price_cache').upsert({
      ticker: cacheKey, price: 0, history7d: result as unknown as object, fetched_at: result.asOf,
    })
    return result
  } catch (err) {
    console.error('[fetchEarnings] unhandled:', err)
    return { symbol, nextDate: null, asOf: new Date().toISOString() }
  }
}
