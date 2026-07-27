// ── Retrocesos de Fibonacci — niveles CALCULADOS, no una opinión ─────────────
// El swing (máximo/mínimo reciente) es un hecho de los datos; los ratios
// 0.382/0.5/0.618 son una convención ampliamente usada para marcar zonas
// donde una corrección suele frenar. Esto NO predice que el precio vaya a
// llegar ahí — es un nivel de referencia, igual en espíritu a los soportes/
// resistencias que ya calcula lib/technical.ts (LevelInfo), solo que
// derivado del último swing en vez de toques históricos repetidos.

export interface FibLevel {
  ratio: number   // 0, 0.236, 0.382, 0.5, 0.618, 0.786, 1
  price: number
}

export type FibDirection = 'retracement_down' | 'retracement_up'

export interface FibRetracement {
  direction:  FibDirection   // 'retracement_down' = veníamos subiendo y podría corregir hacia abajo
                             // 'retracement_up'   = veníamos bajando y podría rebotar hacia arriba
  swingHigh:  number
  swingLow:   number
  swingHighDate: string
  swingLowDate:  string
  levels:     FibLevel[]    // ordenados de mayor a menor precio
}

const RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]

/**
 * Calcula el retroceso de Fibonacci sobre el swing (máximo/mínimo) de los
 * últimos `lookback` cierres. La dirección se determina por qué extremo
 * ocurrió MÁS RECIENTE: si el mínimo es más reciente que el máximo, el
 * último movimiento fue a la baja y los niveles marcan una posible zona de
 * rebote (retracement_up); si el máximo es más reciente, fue al alza y los
 * niveles marcan una posible zona de corrección (retracement_down).
 * null si no hay suficientes datos o el rango es degenerado (high === low).
 */
export function computeFibonacci(
  highs: number[],
  lows: number[],
  dates: string[],
  lookback = 60,
): FibRetracement | null {
  const n = highs.length
  if (n === 0 || lows.length !== n || dates.length !== n) return null

  const start = Math.max(0, n - lookback)
  let highIdx = start
  let lowIdx  = start
  for (let i = start; i < n; i++) {
    if (highs[i] > highs[highIdx]) highIdx = i
    if (lows[i]  < lows[lowIdx])   lowIdx  = i
  }

  const swingHigh = highs[highIdx]
  const swingLow  = lows[lowIdx]
  if (!(swingHigh > swingLow)) return null

  const direction: FibDirection = lowIdx > highIdx ? 'retracement_up' : 'retracement_down'
  const range = swingHigh - swingLow

  // retracement_down: 0% = swingHigh (tope), 100% = swingLow (posible destino de la corrección)
  // retracement_up:   0% = swingLow (piso),  100% = swingHigh (posible destino del rebote)
  const levels: FibLevel[] = RATIOS.map(ratio => ({
    ratio,
    price: direction === 'retracement_down'
      ? swingHigh - range * ratio
      : swingLow  + range * ratio,
  })).sort((a, b) => b.price - a.price)

  return {
    direction,
    swingHigh,
    swingLow,
    swingHighDate: dates[highIdx],
    swingLowDate:  dates[lowIdx],
    levels,
  }
}
