// ── M1 (roadmap macro/tasas, jul 2026): leer la expectativa, no solo la tasa ──
// `DFF` (tasa de fondos federales, efectiva) es un dato RETROSPECTIVO: se
// mueve después de que la Fed decide, nunca antes. El 29 de julio de 2026 la
// Fed mantuvo la tasa (quinta vez seguida) pero con tres disidencias a favor
// de subir y el mercado ya cotizando precio para ~2 alzas en septiembre y
// diciembre — la app, mirando solo DFF, habría dicho "sin presión nueva
// sobre las acciones" el mismo día en que la expectativa cambió mucho.
//
// El bono del Tesoro a 2 años (`DGS2`) es, por construcción, el promedio que
// el mercado espera de la tasa de política en los próximos dos años. Por eso
// `DGS2 − DFF` es un proxy limpio, gratuito (ya viene de FRED vía
// lib/macro-fetch.ts) y determinista de hacia dónde va la tasa: sin scrapear
// probabilidades de futuros (tipo CME FedWatch), sin API nueva.
//
// Puramente aritmético — ningún componente aquí es opinión ni redacción de
// IA, solo una resta y una comparación contra un umbral.

export type RateDirection = 'alzas' | 'estable' | 'bajas'

export interface RatePathResult {
  /** DGS2 - DFF, en puntos base (100 = 1 punto porcentual). Positivo = el
   *  mercado espera tasas más altas que la actual; negativo = más bajas. */
  spreadBp: number
  direction: RateDirection
  /** Número de movimientos de 25pb implícitos en el spread, con signo
   *  (positivo = alzas esperadas, negativo = bajas). Redondeado — es una
   *  cuenta gruesa para hablar en el mismo lenguaje que la noticia
   *  ("~2 alzas"), no una predicción de cuántas veces se va a mover. */
  impliedMoves: number
}

// Spread menor a esto se trata como ruido de mercado, no como señal de
// dirección — evita leer "el mercado espera un recorte" sobre 8pb de nada.
const STABLE_THRESHOLD_BP = 15
const MOVE_SIZE_BP = 25

export function computeRatePath(dgs2: number, dff: number): RatePathResult {
  const spreadBp = Math.round((dgs2 - dff) * 100)
  const direction: RateDirection =
    spreadBp > STABLE_THRESHOLD_BP ? 'alzas' :
    spreadBp < -STABLE_THRESHOLD_BP ? 'bajas' : 'estable'
  const impliedMoves = Math.round(spreadBp / MOVE_SIZE_BP)
  return { spreadBp, direction, impliedMoves }
}
