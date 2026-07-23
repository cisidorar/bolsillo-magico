import type { TechnicalAnalysis } from './technical'
import type { LabelStat } from './signal-backtest'

// ── Score de convicción de compra (0-100) ─────────────────────────────────────
// Objetivo explícito (jul 2026, a pedido de Cas): dejar de hablar en avisos
// sueltos ("señales", "algo para tener al ojo") y decir directamente qué tan
// buena es la COMPRA hoy, comparable entre acciones. Un solo número que junta
// cuatro cosas que hoy viven separadas en la ficha de cada ticker:
//
//   1. Técnico   (40%) — el score del rating (tendencia + gatillos recientes).
//   2. Riesgo/recompensa (25%) — cuánto se arriesga hasta la alarma de salida
//      vs. cuánto queda hasta el próximo techo. Comprar con 3× más upside que
//      downside es objetivamente mejor que comprar con la relación al revés,
//      aunque el rating diga "Compra" en ambos casos.
//   3. Track record (20%) — qué tan seguido acertó ESTA señal en ESTE ticker
//      (backtest de lib/signal-backtest.ts). Con pocas repeticiones el propio
//      cálculo se acerca a neutral: 3 aciertos de 3 no puede pesar como 15 de 20.
//   4. Fuerza relativa (15%) — rendimiento de 6 meses vs. SPY. Un "Compra"
//      que le va peor que el mercado en general es una compra de menor calidad.
//
// Cualquier componente sin datos se excluye y su peso se reparte entre los
// demás (no se inventa un 50 de relleno que diluya el resto).

export type ConvictionTier = 'compra_fuerte' | 'compra' | 'neutral' | 'evitar' | 'venta'

export interface ConvictionResult {
  score:   number             // 0-100
  tier:    ConvictionTier
  verdict: string             // una frase directa, lista para mostrar
  reasons: string[]           // por qué, en lenguaje directo — no "advertencias"
}

const WEIGHTS = { technical: 0.40, riskReward: 0.25, trackRecord: 0.20, relative: 0.15 }

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

export function computeConviction(
  analysis:       TechnicalAnalysis,
  backtestStats?: LabelStat[] | null,
  spyReturn6m?:   number | null,
): ConvictionResult {
  const reasons: string[] = []
  const parts: { key: keyof typeof WEIGHTS; value: number }[] = []

  // 1. Técnico: score de rating ya combina tendencia + gatillos (~-10 a +10)
  const rawScore = clamp(analysis.rating.score, -10, 10)
  const technicalScore = ((rawScore + 10) / 20) * 100
  parts.push({ key: 'technical', value: technicalScore })
  if (analysis.rating.label === 'compra_fuerte' || analysis.rating.label === 'compra') {
    reasons.push(`Lectura técnica a favor: ${analysis.rating.action.toLowerCase()} (${analysis.rating.pros} a favor, ${analysis.rating.cons} en contra).`)
  } else if (analysis.rating.label === 'venta' || analysis.rating.label === 'venta_fuerte') {
    reasons.push(`Lectura técnica en contra: ${analysis.rating.action.toLowerCase()} — no es momento de comprar.`)
  } else {
    reasons.push('Lectura técnica neutral: no hay gatillo reciente que incline la balanza.')
  }

  // 2. Riesgo/recompensa: distancia a la alarma de salida vs. al próximo techo
  const riskPct   = analysis.alarm !== null && analysis.price > 0
    ? ((analysis.price - analysis.alarm) / analysis.price) * 100
    : null
  const resRef    = analysis.resistanceLevels[0] ?? null
  const rewardPct = resRef && resRef.distPct > 0 ? resRef.distPct : null
  let rrRatio: number | null = null
  if (riskPct !== null && riskPct > 0 && rewardPct !== null) {
    rrRatio = rewardPct / riskPct
    const rrScore = clamp(rrRatio * 30, 0, 100)
    parts.push({ key: 'riskReward', value: rrScore })
    if (rrRatio >= 2) reasons.push(`Riesgo/recompensa a favor: arriesgas ${riskPct.toFixed(1)}% para un potencial de +${rewardPct.toFixed(1)}% (${rrRatio.toFixed(1)}×).`)
    else if (rrRatio < 1) reasons.push(`Riesgo/recompensa en contra: arriesgas ${riskPct.toFixed(1)}% para solo +${rewardPct.toFixed(1)}% de potencial (${rrRatio.toFixed(1)}×) — el próximo techo está más cerca que tu salida.`)
  }

  // 3. Track record: solo aplica si la lectura de hoy es de compra — el hit
  // rate de señales de venta no informa qué tan buena es ESTA compra.
  const isBuyLabel = analysis.rating.label === 'compra' || analysis.rating.label === 'compra_fuerte'
  if (isBuyLabel && backtestStats) {
    const stat = backtestStats.find(s => s.label === analysis.rating.label)
    if (stat && stat.hitRate20 !== null) {
      const reliability = clamp(stat.count / 8, 0, 1)   // <8 repeticiones: se acerca a neutral, no a certeza
      const trackScore  = 50 + (stat.hitRate20 - 50) * reliability
      parts.push({ key: 'trackRecord', value: trackScore })
      if (stat.count < 3) {
        reasons.push(`Esta señal solo pasó ${stat.count} vez${stat.count !== 1 ? 'es' : ''} en el último año en esta acción — muy poca evidencia propia todavía.`)
      } else {
        reasons.push(`Esta señal acertó ${stat.hitRate20}% de las veces (${stat.count} repeticiones) en esta acción en el último año.`)
      }
    }
  }

  // 4. Fuerza relativa vs. SPY (6 meses)
  if (analysis.returns.m6 !== null && spyReturn6m !== null && spyReturn6m !== undefined) {
    const diff = analysis.returns.m6 - spyReturn6m
    const relScore = clamp(50 + diff * 1.5, 0, 100)
    parts.push({ key: 'relative', value: relScore })
    if (diff >= 5) reasons.push(`Le va ${diff.toFixed(0)}pp mejor que el mercado (SPY) en 6 meses — fuerza relativa a favor.`)
    else if (diff <= -10) reasons.push(`Le va ${Math.abs(diff).toFixed(0)}pp peor que el mercado (SPY) en 6 meses — una compra de menor calidad que indexarse.`)
  }

  const totalWeight = parts.reduce((s, p) => s + WEIGHTS[p.key], 0)
  const score = totalWeight > 0
    ? Math.round(parts.reduce((s, p) => s + p.value * WEIGHTS[p.key], 0) / totalWeight)
    : Math.round(technicalScore)

  let tier: ConvictionTier
  let verdict: string
  if (score >= 70)      { tier = 'compra_fuerte'; verdict = 'Compra clara: la evidencia está a favor.' }
  else if (score >= 55) { tier = 'compra';        verdict = 'Compra: el caso es razonable, sin ser contundente.' }
  else if (score >= 40) { tier = 'neutral';        verdict = 'No hay caso para comprar hoy — espera.' }
  else if (score >= 25) { tier = 'evitar';         verdict = 'Evita comprar: la evidencia está en contra.' }
  else                   { tier = 'venta';          verdict = 'No compres: la evidencia está claramente en contra.' }

  return { score, tier, verdict, reasons }
}

/**
 * ¿Hay caso Y gatillo para comprar HOY, con monto? El score de convicción
 * mide si la acción es una buena candidata (riesgo/recompensa, fuerza vs.
 * mercado, técnico) — pero el PLAN DE ENTRADA (`analysis.buy`) decide el
 * TIMING, y a veces el score es alto (gran riesgo/recompensa, le va mejor
 * que al mercado) mientras el gráfico todavía no da una entrada razonable
 * (sin gatillo reciente: toca esperar un retroceso o una ruptura concreta).
 *
 * Sin este segundo filtro, "la mejor compra hoy es X" (panel de ranking)
 * podía chocar de frente con el propio detalle de X diciendo "no compres
 * hoy" (el mismo dato, dos lecturas distintas) — detectado por Cas, jul 2026.
 * Se usa para decidir el veredicto de "¿Qué comprar hoy?", el flag de fila
 * en Radar, y `daily_decisions` (cron + correo) — un solo criterio en los
 * tres lugares que antes solo miraban el tier de convicción.
 *
 * D4 (roadmap de calidad de decisión, jul 2026): con `regime === 'bajista'`
 * el listón sube — exige `compra_fuerte`, no basta `compra`. Los gatillos
 * técnicos (rupturas, rebotes en soporte) fallan más seguido cuando el
 * mercado en general va para abajo; `regime` es opcional y por defecto se
 * comporta exactamente igual que antes (compatibilidad hacia atrás).
 */
export function isActionableBuyNow(
  analysis:   { buy: { now: boolean }[] },
  conviction: Pick<ConvictionResult, 'tier'>,
  regime?:    MarketRegime | null,
): boolean {
  const hasTrigger = analysis.buy.some(t => t.now)
  if (!hasTrigger) return false
  if (regime === 'bajista') return conviction.tier === 'compra_fuerte'
  return conviction.tier === 'compra' || conviction.tier === 'compra_fuerte'
}

// ── Régimen de mercado (D4, roadmap de calidad de decisión) ──────────────────
// SPY ya se analiza todas las noches y ya alimenta la fuerza relativa (15%
// del score) — el RÉGIMEN (¿el mercado en general sube o baja?) no modulaba
// nada más: mismo listón para un gatillo de entrada en cualquier clima. Con
// SPY bajo su SMA200 y esa media bajando, comprar rupturas/rebotes falla
// mucho más seguido — el listón para "accionable hoy" sube (ver
// isActionableBuyNow). Costo cero de datos: mismo `trend` que ya calcula
// analyze() para cualquier ticker, aplicado a SPY.

export type MarketRegime = 'alcista' | 'bajista' | 'mixto'

export function computeMarketRegime(
  spyTrend: { aboveSma200: boolean | null; sma200Rising: boolean | null } | null | undefined,
): MarketRegime | null {
  if (!spyTrend || spyTrend.aboveSma200 === null) return null
  if (spyTrend.aboveSma200 && spyTrend.sma200Rising !== false) return 'alcista'
  if (!spyTrend.aboveSma200 && spyTrend.sma200Rising === false) return 'bajista'
  return 'mixto'
}
