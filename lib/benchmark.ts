// ── Benchmark vs SPY: ¿le ganaste al mercado? ─────────────────────────────────
// La pregunta más importante de cualquier portafolio de stock-picking: si el
// mismo dinero, con las mismas fechas de entrada, hubiera ido a un índice
// pasivo (SPY), ¿tendrías más o menos de lo que tienes hoy?
//
// ago 2026 (Cas: "me gustaria que cuando compre los dolares altiro hubiera
// comprado [SPY], vs lo que he ganado asta ahora... para que sea justo" + "en
// el valor del portafolio quiero que sumes lo que esta en la billetera"):
// ANTES el flujo de caja de la sombra se armaba con cada COMPRA/VENTA de
// acción individual (compra = compra SPY, venta = vende SPY) — eso rompía la
// sombra cada vez que una venta le ganaba por mucho al mercado, porque el
// modelo tenía que "vender" de la sombra más de lo que esos mismos dólares
// habían generado en SPY hasta esa fecha (ver `degenerate`/`distorted` abajo,
// ambos legado de ese diseño). Una compra o venta de acción no es dinero
// nuevo ni dinero que sale del sistema — es solo mover valor entre "efectivo
// en la billetera" y "posición abierta". El único evento que sí representa
// dinero nuevo entrando es un APORTE a la billetera USD.
//
// Método actual (cash-flow matched, basado en cierres):
//   1. Sombra en SPY: cada aporte a la billetera compra SPY por ese mismo
//      monto en esa misma fecha. No hay eventos de venta — vender una acción
//      no retira plata del sistema, solo la mueve de "posición" a "efectivo
//      en la billetera", y ese efectivo ya cuenta en el valor real (punto 2).
//   2. Valor real hoy = posiciones abiertas valorizadas al último cierre
//      conocido de cada ticker + efectivo disponible en la billetera (no
//      invertido todavía). Así una venta con ganancia nunca "rompe" la
//      comparación: simplemente mueve valor de un lado a otro del valor real,
//      sin tocar la sombra.
//   3. La diferencia entre ambos valores es lo que ganaste (o perdiste) por
//      elegir acciones individuales en vez de indexarte, con el mismo dinero
//      y las mismas fechas de aporte.
//
// Precisión de fechas: los cierres de price_history no cubren fines de
// semana/feriados. Si la fecha exacta no está, se usa el cierre disponible
// más cercano HACIA ATRÁS (el último dato real conocido a esa fecha).

export interface DateClose { date: string; close: number }

export interface CashFlowEvent {
  date: string   // YYYY-MM-DD
  usd:  number   // aporte a la billetera (compra SPY en la sombra ese día) — siempre + en uso normal
}

export interface PositionLite { ticker: string; shares: number }

export interface SpyBenchmarkResult {
  realValueUsd:   number   // posiciones abiertas al último cierre conocido + efectivo en la billetera
  shadowValueUsd: number   // lo que esos mismos aportes valdrían en SPY
  diffUsd:        number   // realValueUsd − shadowValueUsd
  diffPct:        number | null   // diff como % del valor sombra (null si sombra es 0)
  asOfDate:       string   // fecha del cierre usado como "hoy" (último dato disponible)
  spyShares:      number   // acciones sombra de SPY remanentes (diagnóstico)
  /**
   * Legado del modelo anterior (cash flow por compra/venta de acción): una
   * venta podía retirar de la sombra más dólares de los que esos mismos
   * flujos habrían generado en SPY, forzando un "corto" imaginario. Con el
   * modelo actual (solo aportes como flujo, ventas no tocan la sombra) esto
   * ya no debería poder pasar — se deja el campo por compatibilidad de tipo
   * con los consumidores existentes (PerformanceSection, WeekSnapshotCard,
   * Radar, el correo semanal), siempre en `false` en la práctica.
   */
  degenerate:     boolean
  /**
   * Legado del mismo rediseño: con cash flows que ya no pueden ir a
   * negativo, la base de la sombra no debería volverse casi nula por una
   * venta puntual. Se deja el campo/umbral (300%) por si algún escenario
   * extremo de aportes muy chicos + revalorización enorme lo dispara, pero
   * ya no es el caso típico que motivó su creación.
   */
  distorted:      boolean
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
  cashFlows:      CashFlowEvent[],     // aportes a la billetera USD (+) — compra SPY ese día
  spyHistory:     DateClose[],         // ascendente por fecha
  positions:      PositionLite[],      // posiciones abiertas hoy
  latestCloseByTicker: Map<string, number>,   // último cierre conocido por ticker (incluye posiciones)
  walletCashUsd:  number = 0,          // efectivo disponible en la billetera hoy (no invertido)
): SpyBenchmarkResult | null {
  if (spyHistory.length === 0 || cashFlows.length === 0) return null

  const sorted = [...cashFlows].sort((a, b) => a.date.localeCompare(b.date))
  let rawSpyShares = 0
  for (const ev of sorted) {
    const px = closeOnOrBefore(spyHistory, ev.date) ?? spyHistory[0].close
    if (px <= 0) continue
    rawSpyShares += ev.usd / px
  }
  // Piso en 0 — legado del modelo anterior (ver comentario en SpyBenchmarkResult).
  // Con solo aportes (+) como flujo, rawSpyShares no debería poder ir a
  // negativo, pero se deja el resguardo.
  const degenerate = rawSpyShares < -1e-6
  const spyShares  = Math.max(0, rawSpyShares)

  const asOfDate    = spyHistory[spyHistory.length - 1].date
  const latestSpyPx = spyHistory[spyHistory.length - 1].close
  const shadowValueUsd = spyShares * latestSpyPx

  const positionsValueUsd = positions.reduce((s, p) => {
    const px = latestCloseByTicker.get(p.ticker)
    return px ? s + p.shares * px : s
  }, 0)
  // ago 2026 (Cas): el valor real incluye el efectivo que todavía está en la
  // billetera sin invertir — es plata que ya entró al sistema (contada en la
  // sombra vía el aporte que la trajo), así que tiene que contar acá también.
  const realValueUsd = positionsValueUsd + Math.max(0, walletCashUsd)

  const diffUsd = realValueUsd - shadowValueUsd
  const diffPct = shadowValueUsd > 0 ? (diffUsd / shadowValueUsd) * 100 : null
  const distorted = diffPct !== null && Math.abs(diffPct) > 300

  return { realValueUsd, shadowValueUsd, diffUsd, diffPct, asOfDate, spyShares, degenerate, distorted }
}
