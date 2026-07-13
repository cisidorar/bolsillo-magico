import type { TechnicalAnalysis } from '@/lib/technical'

// ── Cache de análisis técnico compartida entre componentes cliente ───────────
// StockPositionManager (posiciones) y WatchlistPanel (favoritos) pedían
// /api/technical por separado: un ticker presente en ambos se consultaba 2
// veces por visita. Esta cache de módulo comparte resultados y deduplica
// requests EN VUELO (si ambos piden NVDA a la vez, un solo fetch).
// TTL corto: la frescura real la gobierna el server (velas al último cierre);
// esto solo evita repetir la misma llamada dentro de una visita.

const TTL_MS = 10 * 60_000

const cache    = new Map<string, { analysis: TechnicalAnalysis; at: number }>()
const inFlight = new Map<string, Promise<TechnicalAnalysis>>()

/** Error con el detalle que reporta la ruta (respuestas de los proveedores). */
export class AnalysisError extends Error {
  detail: string | null
  constructor(detail: string | null) {
    super(detail ?? 'No se pudo obtener el análisis')
    this.detail = detail
  }
}

export async function getAnalysis(ticker: string, force = false): Promise<TechnicalAnalysis> {
  const key = ticker.toUpperCase()

  if (!force) {
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < TTL_MS) return hit.analysis
    const pending = inFlight.get(key)
    if (pending) return pending
  }

  const p = (async () => {
    const r = await fetch(`/api/technical?symbol=${key}${force ? '&force=1' : ''}`, { cache: 'no-store' })
    if (!r.ok) {
      const body = await r.json().catch(() => null) as { detail?: string } | null
      throw new AnalysisError(body?.detail ?? null)
    }
    const d = await r.json() as { analysis: TechnicalAnalysis }
    cache.set(key, { analysis: d.analysis, at: Date.now() })
    return d.analysis
  })()

  inFlight.set(key, p)
  try {
    return await p
  } finally {
    inFlight.delete(key)
  }
}
