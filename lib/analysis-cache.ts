import type { TechnicalAnalysis } from '@/lib/technical'
import type { LabelStat } from '@/lib/signal-backtest'

// ── Cache de análisis técnico compartida entre componentes cliente ───────────
// StockPositionManager (posiciones) y WatchlistPanel (favoritos) pedían
// /api/technical por separado: un ticker presente en ambos se consultaba 2
// veces por visita. Esta cache de módulo comparte resultados y deduplica
// requests EN VUELO (si ambos piden NVDA a la vez, un solo fetch).
// TTL corto: la frescura real la gobierna el server (velas al último cierre);
// esto solo evita repetir la misma llamada dentro de una visita.
//
// D1 (roadmap de calidad de decisión, jul 2026): /api/technical ahora trae
// también el track record del ticker (signal_stats, calculado por el cron
// cada noche) — se cachea junto al análisis para que computeConviction()
// pueda usarlo sin un fetch aparte. getCachedBacktestStats() es una lectura
// SÍNCRONA del mismo cache: se llama después de que getAnalysis() ya resolvió
// para ese ticker, así que siempre encuentra la entrada ya poblada.

const TTL_MS = 10 * 60_000

interface CacheEntry { analysis: TechnicalAnalysis; backtestStats: LabelStat[] | null; at: number }

const cache    = new Map<string, CacheEntry>()
const inFlight = new Map<string, Promise<CacheEntry>>()

/** Error con el detalle que reporta la ruta (respuestas de los proveedores). */
export class AnalysisError extends Error {
  detail: string | null
  constructor(detail: string | null) {
    super(detail ?? 'No se pudo obtener el análisis')
    this.detail = detail
  }
}

async function fetchEntry(key: string, force: boolean): Promise<CacheEntry> {
  const r = await fetch(`/api/technical?symbol=${key}${force ? '&force=1' : ''}`, { cache: 'no-store' })
  if (!r.ok) {
    const body = await r.json().catch(() => null) as { detail?: string } | null
    throw new AnalysisError(body?.detail ?? null)
  }
  const d = await r.json() as { analysis: TechnicalAnalysis; backtestStats?: LabelStat[] | null }
  const entry: CacheEntry = { analysis: d.analysis, backtestStats: d.backtestStats ?? null, at: Date.now() }
  cache.set(key, entry)
  return entry
}

export async function getAnalysis(ticker: string, force = false): Promise<TechnicalAnalysis> {
  const key = ticker.toUpperCase()

  if (!force) {
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < TTL_MS) return hit.analysis
    const pending = inFlight.get(key)
    if (pending) return (await pending).analysis
  }

  const p = fetchEntry(key, force)
  inFlight.set(key, p)
  try {
    return (await p).analysis
  } finally {
    inFlight.delete(key)
  }
}

/** Lectura síncrona del track record ya cacheado para `ticker` — llamar
 *  después de que getAnalysis(ticker) haya resuelto (misma respuesta, mismo
 *  cache). null si todavía no se pidió o el ticker no tiene señales pasadas
 *  suficientes para opinar. */
export function getCachedBacktestStats(ticker: string): LabelStat[] | null {
  return cache.get(ticker.toUpperCase())?.backtestStats ?? null
}
