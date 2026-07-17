// ── Benchmark vs SPY: ¿le ganaste al mercado? ─────────────────────────────────
// La pregunta más importante de cualquier portafolio de stock-picking: si el
// mismo dinero, con las mismas fechas de entrada y salida, hubiera ido a un
// índice pasivo (SPY), ¿tendrías más o menos de lo que tienes hoy?
//
// Método (cash-flow matched, basado en cierres — no en precio en vivo, mismo
// criterio que el resto del motor técnico, pensado para decisión semanal):
//   1. Se simula una "posición sombra" en SPY: cada compra de acciones compra
//      SPY por el mismo monto en la misma fecha; cada venta de acciones vende
//      SPY por el mismo monto en la misma fecha (mismo timing de flujo de
//      caja — así la comparación no premia/castiga por cuándo entraste o
//      saliste, solo por QUÉ compraste).
//   2. El valor real hoy = posiciones abiertas valorizadas al último cierre
//      conocido de cada ticker (no precio en vivo: consistente con que el
//      resto del análisis técnico trabaja con cierres).
//   3. La diferencia entre ambos valores es lo que ganaste (o perdiste) por
//      elegir acciones individuales en vez de indexarte.
//
// Precisión de fechas: los cierres de price_history no cubren fines de
// semana/feriados. Si la fecha exacta no está, se usa el cierre disponible
// más cercano HACIA ATRÁS (el último dato real conocido a esa fecha).

export interface DateClose { date: string; close: number }

export interface CashFlowEvent {
  date: string   // YYYY-MM-DD
  usd:  number   // + = compra de acciones (compra SPY en la sombra) · − = venta (vende SPY en la sombra)
}

export interface PositionLite { ticker: string; shares: number }

export interface SpyBenchmarkResult {
  realValueUsd:   number   // posiciones abiertas al último cierre conocido
  shadowValueUsd: number   // lo que esos mismos flujos de caja valdrían en SPY
  diffUsd:        number   // realValueUsd − shadowValueUsd
  diffPct:        number | null   // diff como % del valor sombra (null si sombra es 0)
  asOfDate:       string   // fecha del cierre usado como "hoy" (último dato disponible)
  spyShares:      number   // acciones sombra de SPY remanentes (diagnóstico)
}

/** Cierre de SPY en `date` o el más cercano HACIA ATRÁS. null si no hay ningún dato ≤ date. */
function closeOnOrBefore(history: DateClose[], date: string): number | null {
  let best: number | null = null
  for (const row of history) {
    if (row.date > date) break
    best = row.close
  }
  return best
}

export function computeSpyBenchmark(
  cashFlows:      CashFlowEvent[],     // compras (+) y ventas (−) de acciones, orden cualquiera
  spyHistory:     DateClose[],         // ascendente por fecha
  positions:      PositionLite[],      // posiciones abiertas hoy
  latestCloseByTicker: Map<string, number>,   // último cierre conocido por ticker (incluye posiciones)
): SpyBenchmarkResult | null {
  if (spyHistory.length === 0 || cashFlows.length === 0) return null

  const sorted = [...cashFlows].sort((a, b) => a.date.localeCompare(b.date))
  let spyShares = 0
  for (const ev of sorted) {
    const px = closeOnOrBefore(spyHistory, ev.date) ?? spyHistory[0].close
    if (px <= 0) continue
    spyShares += ev.usd / px
  }
  spyShares = Math.max(0, spyShares)   // guard: no debería ir negativo, pero no reportar posición corta imaginaria

  const asOfDate    = spyHistory[spyHistory.length - 1].date
  const latestSpyPx = spyHistory[spyHistory.length - 1].close
  const shadowValueUsd = spyShares * latestSpyPx

  const realValueUsd = positions.reduce((s, p) => {
    const px = latestCloseByTicker.get(p.ticker)
    return px ? s + p.shares * px : s
  }, 0)

  const diffUsd = realValueUsd - shadowValueUsd
  const diffPct = shadowValueUsd > 0 ? (diffUsd / shadowValueUsd) * 100 : null

  return { realValueUsd, shadowValueUsd, diffUsd, diffPct, asOfDate, spyShares }
}
