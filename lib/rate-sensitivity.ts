import type { Observation } from '@/lib/yoy-change'

// ── M2 (roadmap macro/tasas, jul 2026): cuánto le pega a CADA acción tuya ────
// "Suben las tasas" es una noticia genérica. Lo accionable es a cuáles de tus
// posiciones les pega y a cuáles no — hoy la app le da la misma frase macro a
// NVDA que a una utility. Esto calcula una sensibilidad EMPÍRICA, no
// fundamental: cuánto se movió HISTÓRICAMENTE el retorno diario del ticker
// por cada cambio en el bono del Tesoro a 2 años (mismo proxy de expectativa
// de tasas que usa lib/rate-path.ts) — regresión lineal simple sobre datos
// que ya viven en la base (price_history + la serie DGS2 ya cacheada).
//
// Honestidad estadística, no decorativa (mismo criterio que el clamp de
// fiabilidad de lib/conviction.ts para el track record): con pocos días de
// historia común o sin relación lineal real, la respuesta correcta es "no
// hay suficiente evidencia", no un número inventado. Por eso este módulo
// devuelve null generosamente en vez de forzar un resultado.

export interface RateSensitivityResult {
  /** % que se movió el ticker, históricamente, por cada +10pb en el bono a 2
   *  años. Negativo = se movió en contra de las tasas (lo típico en
   *  crecimiento); positivo = a favor. */
  betaPer10bp: number
  /** R² de la regresión (0-1) — cuánto de la variación diaria del ticker
   *  explica el movimiento de tasas. Bajo (<0.10) = ruido, no señal. */
  r2: number
  /** Días con dato en ambas series usados en la regresión. */
  n: number
}

// Umbrales de la casa: bajo esto, "sin relación clara" es la respuesta
// honesta — no se muestra un beta con 20 días de historia o con r² de 0.03.
export const MIN_OBSERVATIONS = 120
export const MIN_R2 = 0.10

/** Cambios día a día de una serie ({date, value}) — diferencia simple para
 *  tasas (en pb, ya que `value` viene en puntos porcentuales) o % de retorno
 *  para precios. Se indexa por la fecha del día "cur" (el cambio que ocurrió
 *  ENTRE el día anterior y ese día). */
function dailyChanges(obs: Observation[], mode: 'pct' | 'bp'): Map<string, number> {
  const sorted = [...obs].sort((a, b) => a.date.localeCompare(b.date))
  const out = new Map<string, number>()
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1].value
    const cur  = sorted[i].value
    if (prev === 0) continue
    const change = mode === 'pct' ? ((cur - prev) / prev) * 100 : (cur - prev) * 100
    out.set(sorted[i].date, change)
  }
  return out
}

/**
 * Regresión lineal simple: retorno diario del ticker (`tickerCloses`) contra
 * el cambio diario del bono a 2 años (`dgs2Levels`, en puntos porcentuales —
 * mismo formato que entrega FRED/lib/macro-fetch.ts). Alinea por fecha
 * (intersección de ambas series); null si no hay suficiente historia común o
 * la relación no es estadísticamente clara.
 */
export function computeRateSensitivity(
  tickerCloses: Observation[],
  dgs2Levels:   Observation[],
): RateSensitivityResult | null {
  const tickerReturns = dailyChanges(tickerCloses, 'pct')
  const rateChangesBp = dailyChanges(dgs2Levels, 'bp')

  const xs: number[] = []
  const ys: number[] = []
  for (const [date, y] of tickerReturns) {
    const x = rateChangesBp.get(date)
    if (x === undefined) continue
    xs.push(x)
    ys.push(y)
  }

  const n = xs.length
  if (n < MIN_OBSERVATIONS) return null

  const meanX = xs.reduce((a, b) => a + b, 0) / n
  const meanY = ys.reduce((a, b) => a + b, 0) / n

  let cov = 0, varX = 0, varY = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX
    const dy = ys[i] - meanY
    cov  += dx * dy
    varX += dx * dx
    varY += dy * dy
  }
  if (varX === 0) return null   // tasa sin variación en la ventana: no hay nada que correlacionar

  const beta = cov / varX
  const r = varY === 0 ? 0 : cov / Math.sqrt(varX * varY)
  const r2 = r * r

  if (r2 < MIN_R2) return null

  return { betaPer10bp: beta * 10, r2, n }
}
