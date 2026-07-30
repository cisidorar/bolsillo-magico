// ── M3 (roadmap macro/tasas, jul 2026): "los posibles movimientos" ───────────
// Tres escenarios anclados al calendario real de la Fed (+25pb / 0pb / -25pb)
// aplicados a TU cartera real, usando la sensibilidad empírica de cada ticker
// (lib/rate-sensitivity.ts, M2). Es una aproximación LINEAL de primer orden:
// sirve para ordenar magnitudes ("esto me afecta 5× más que aquello"), no
// para predecir un precio exacto — el disclaimer va en el código Y en la UI.
//
// Reglas de la casa aplicadas acá:
// - Tickers sin beta confiable (M2 devolvió null) entran con impacto 0 y se
//   listan aparte — no se les inventa una sensibilidad promedio.
// - Severidad tope gold (nunca coral): un escenario hipotético no es una
//   acción para hoy, no debe competir con alertas reales de la cartera.

export interface TickerScenarioInput {
  ticker: string
  /** Valor de la posición en USD (shares × precio). */
  valueUsd: number
  /** % que se movió el ticker históricamente por cada +10pb (lib/rate-sensitivity.ts) — null = sin evidencia suficiente. */
  betaPer10bp: number | null
  /** ETFs apalancados (lib/leveraged-etfs.ts): el impacto económico real es factor× el nominal. */
  leverageFactor?: number | null
}

export interface ScenarioImpact {
  moveBp: number
  label: 'sube' | 'mantiene' | 'baja'
  totalImpactUsd: number
  /** % sobre el valor total de la cartera considerada — null si no hay cartera (valor total 0). */
  totalImpactPct: number | null
}

export interface RateScenariosResult {
  scenarios: ScenarioImpact[]        // siempre 3: sube, mantiene, baja
  /** Tickers con posición pero sin beta confiable — no entran al cálculo. */
  excludedTickers: string[]
  /** Valor total de la cartera considerada (solo tickers con beta), para dar contexto al %. */
  consideredValueUsd: number
}

const MOVES: { moveBp: number; label: ScenarioImpact['label'] }[] = [
  { moveBp: 25,  label: 'sube' },
  { moveBp: 0,   label: 'mantiene' },
  { moveBp: -25, label: 'baja' },
]

export function computeRateScenarios(positions: TickerScenarioInput[]): RateScenariosResult {
  const excludedTickers = positions.filter(p => p.betaPer10bp === null).map(p => p.ticker)
  const known = positions.filter(
    (p): p is TickerScenarioInput & { betaPer10bp: number } => p.betaPer10bp !== null,
  )
  const consideredValueUsd = known.reduce((s, p) => s + p.valueUsd, 0)

  const scenarios: ScenarioImpact[] = MOVES.map(({ moveBp, label }) => {
    let impact = 0
    for (const p of known) {
      const factor    = p.leverageFactor ?? 1
      const impactPct = p.betaPer10bp * (moveBp / 10) * factor
      impact += p.valueUsd * (impactPct / 100)
    }
    return {
      moveBp,
      label,
      totalImpactUsd: impact,
      totalImpactPct: consideredValueUsd > 0 ? (impact / consideredValueUsd) * 100 : null,
    }
  })

  return { scenarios, excludedTickers, consideredValueUsd }
}
