// ── Detección de splits no ajustados (nov 2026) ──────────────────────────────
// Caso real: Sandisk (SNDK) hizo un split 8×1 el 20 nov 2026. El cron solo
// agrega días nuevos a price_history, así que el cierre de 755 del día 19 quedó
// sin ajustar junto al de 79 del día 20: la app mostró −95%, el costo promedio
// (US$1.444) y la alarma guardada (US$1.325) quedaron sin sentido.
//
// Dos pasos, porque el precio solo NO alcanza para saber el factor: el día del
// split el mercado también se mueve (SNDK: 755/79 = 9,5 → parece 10×1, pero era
// 8×1 con −16% de mercado ese día).
//   1. `looksLikeSplit` — sospecha barata con lo recién traído: el precio se
//      divide por mucho Y el volumen se multiplica por algo parecido. Un crash
//      real (SOXL −32%, INTC −29%) no pasa este filtro.
//   2. `splitFactorFromAdjusted` — el factor EXACTO sale de volver a pedir el
//      historial al proveedor (ya ajustado) y comparar el mismo día contra lo
//      que teníamos guardado. Si da ~1, era un crash y no se toca nada.

export interface PricePoint {
  date:   string
  close:  number
  volume: number
}

/** ¿El salto entre el último punto guardado y el primero nuevo parece un split? */
export function looksLikeSplit(prev: PricePoint, next: PricePoint, avgVolume?: number): boolean {
  if (!(prev.close > 0) || !(next.close > 0)) return false
  const priceRatio = prev.close / next.close
  const baseVol = avgVolume && avgVolume > 0 ? avgVolume : prev.volume
  const volRatio = baseVol > 0 ? next.volume / baseVol : 0
  // Forward: precio ÷N, volumen ×N (con holgura: al menos la mitad del salto de precio)
  if (priceRatio >= 1.6) return volRatio >= priceRatio * 0.5
  // Reverse: precio ×N, volumen ÷N
  if (priceRatio <= 0.6) return volRatio > 0 && volRatio <= 0.8
  return false
}

/**
 * Factor de split a partir del cierre que teníamos guardado y el mismo cierre
 * ya ajustado por el proveedor. Acciones nuevas por cada vieja: 8 = split 8×1,
 * 0.1 = reverse 1×10. `null` si no hay diferencia real (no era split).
 */
export function splitFactorFromAdjusted(storedClose: number, adjustedClose: number): number | null {
  if (!(storedClose > 0) || !(adjustedClose > 0)) return null
  const ratio = storedClose / adjustedClose
  if (Math.abs(ratio - 1) < 0.03) return null
  const nearestInt = Math.round(ratio)
  if (ratio >= 1.5 && Math.abs(ratio / nearestInt - 1) <= 0.015) return nearestInt
  if (ratio <= 0.67) {
    const inv = 1 / ratio
    const n = Math.round(inv)
    if (Math.abs(inv / n - 1) <= 0.015) return 1 / n
  }
  return Math.round(ratio * 1000) / 1000   // split no entero (3×2 → 1,5)
}
