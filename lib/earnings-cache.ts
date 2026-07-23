import type { EarningsInfo } from '@/lib/earnings'

// ── Cache de módulo para /api/stock-earnings (D3, roadmap de calidad de
// decisión) — mismo patrón que lib/analysis-cache.ts: el servidor ya cachea
// 24 h por ticker (price_cache), esto solo evita pedir la misma fecha varias
// veces dentro de la misma visita (detalle abierto y cerrado, panel de
// ranking, etc.).

const TTL_MS = 10 * 60_000

const cache    = new Map<string, { info: EarningsInfo; at: number }>()
const inFlight = new Map<string, Promise<EarningsInfo>>()

export async function getEarnings(ticker: string): Promise<EarningsInfo | null> {
  const key = ticker.toUpperCase()

  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.info
  const pending = inFlight.get(key)
  if (pending) return pending

  const p = (async () => {
    const r = await fetch(`/api/stock-earnings?symbol=${key}`, { cache: 'no-store' })
    if (!r.ok) throw new Error('earnings fetch failed')
    const d = await r.json() as EarningsInfo
    cache.set(key, { info: d, at: Date.now() })
    return d
  })()

  inFlight.set(key, p)
  try {
    return await p
  } catch {
    return null
  } finally {
    inFlight.delete(key)
  }
}

/** Lectura síncrona de lo ya cacheado (best-effort) — para usar en cómputos
 *  que no pueden ser async (ej. el monto sugerido del panel de ranking). */
export function getCachedEarnings(ticker: string): EarningsInfo | null {
  return cache.get(ticker.toUpperCase())?.info ?? null
}
