import { computeYoyChange, type Observation } from '@/lib/yoy-change'
import type { RatePathResult } from '@/lib/rate-path'

// ── P3 (roadmap largo plazo, jul 2026) ───────────────────────────────────────
// Reemplaza la vista Semanal completa: en vez de una pestaña aparte con 4
// números macro crudos ("Tasa Fed 4.25% · Curva +0.3pp · WTI $71 · CPI +2.8%"),
// esto arma las 1-2 frases que van dentro de la card "Tu semana" en Acciones —
// mismo principio de la casa que las señales técnicas: plantillas
// deterministas sobre datos públicos, la IA no opina ni redacta el número.

/**
 * Fechas oficiales de decisión de la Fed (2º día de cada reunión FOMC, cuando
 * se publica el comunicado) — fuente: federalreserve.gov/monetarypolicy/
 * fomccalendars.htm. Solo importan para avisar "no es buen día para comprar"
 * (mismo criterio que D3 ya aplica con earnings): actualizar esta lista cada
 * año cuando la Fed publique el calendario siguiente.
 *
 * M5 (roadmap macro/tasas, jul 2026): esta lista se había quedado SOLO con
 * 2026 — desde el 9 de diciembre `nextFomcMeeting()` devuelve `null` para
 * siempre y "Lo que viene" pierde esa mitad de contenido en silencio, sin
 * error. Se agregan las 2027 (tentativas hasta que la Fed las confirme
 * reunión a reunión) y se cubre con un test que exige ≥6 meses de cobertura
 * hacia adelante desde "hoy", para que la próxima vez que se venza lo diga
 * la suite y no el silencio de la UI.
 */
export const FOMC_DECISION_DATES_2026: string[] = [
  '2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17',
  '2026-07-29', '2026-09-16', '2026-10-28', '2026-12-09',
  '2027-01-27', '2027-03-17', '2027-04-28', '2027-06-09',
  '2027-07-28', '2027-09-15', '2027-10-27', '2027-12-08',
]

/** Próxima reunión de la Fed a `withinDays` días o menos desde `today` —
 *  null si no hay ninguna así de cerca. */
export function nextFomcMeeting(
  today: string,
  withinDays = 7,
  dates: string[] = FOMC_DECISION_DATES_2026,
): string | null {
  const t = new Date(today + 'T12:00:00').getTime()
  let closest: string | null = null
  for (const d of dates) {
    const dt = new Date(d + 'T12:00:00').getTime()
    const diffDays = Math.round((dt - t) / 86_400_000)
    if (diffDays >= 0 && diffDays <= withinDays && (closest === null || d < closest)) closest = d
  }
  return closest
}

/**
 * Frase determinista sobre la tasa de la Fed, acotada a lo que el dato
 * realmente cubre (DFF se cachea con 30 días de historia — no alcanza para
 * decir "hace N meses" con certeza, solo si cambió o no dentro de esa ventana).
 *
 * M1 (roadmap macro/tasas, jul 2026): `observations` (DFF) es la tasa YA
 * realizada — nunca se mueve antes de una decisión, solo después. Sin
 * `ratePath` (proxy de expectativa vía `lib/rate-path.ts`, spread DGS2-DFF)
 * esta frase podía decir literalmente "sin presión nueva sobre las acciones"
 * el mismo día en que el mercado ya tenía precio para varias alzas futuras
 * (caso real: FOMC del 29 jul 2026 — mantuvo, pero el 2 años ya cotizaba muy
 * por arriba). Con `ratePath` disponible, la frase combina nivel (pasado) +
 * dirección esperada (futuro); sin él, se degrada al mensaje anterior.
 */
export function fedRateSentence(observations: Observation[], ratePath?: RatePathResult | null): string | null {
  if (observations.length === 0) return null
  const sorted = [...observations].sort((a, b) => a.date.localeCompare(b.date))
  const last  = sorted[sorted.length - 1].value
  const first = sorted[0].value
  const changedRecently = Math.abs(last - first) > 0.05
  const levelPart = changedRecently
    ? `La Fed movió la tasa a ${last.toFixed(2)}% en el último mes`
    : `La Fed mantiene la tasa en ${last.toFixed(2)}%`

  if (!ratePath || ratePath.direction === 'estable') {
    return changedRecently
      ? `${levelPart} — cambio reciente, vale la pena estar atenta a cómo reacciona el mercado.`
      : `${levelPart} — estable en el último mes, sin presión nueva sobre las acciones.`
  }

  const moves = Math.abs(ratePath.impliedMoves)
  const moveWord = moves <= 1 ? '~1 movimiento' : `~${moves} movimientos`
  const spreadAbs = Math.abs(ratePath.spreadBp)

  return ratePath.direction === 'alzas'
    ? `${levelPart}, pero el bono a 2 años ya cotiza ${spreadAbs} pb más arriba — el mercado tiene precio para ${moveWord} de alza. No cambia tu plan de largo plazo, pero explica por qué los múltiplos altos están más castigados.`
    : `${levelPart}, y el bono a 2 años ya cotiza ${spreadAbs} pb más abajo — el mercado tiene precio para ${moveWord} de baja. Suele ser viento a favor para acciones de crecimiento y para nuevos depósitos a tasa fija.`
}

/** Frase determinista sobre inflación (CPI interanual) — compara el dato más
 *  reciente contra el de ~3 meses antes para decidir la dirección. */
export function inflationSentence(observations: Observation[]): string | null {
  if (observations.length === 0) return null
  const sorted = [...observations].sort((a, b) => a.date.localeCompare(b.date))
  const latestDate = sorted[sorted.length - 1].date
  const now = computeYoyChange(sorted, latestDate)
  if (!now) return null

  const d = new Date(latestDate + 'T12:00:00')
  d.setMonth(d.getMonth() - 3)
  const past = computeYoyChange(sorted, d.toISOString().slice(0, 10))

  const pct = now.pctChange
  if (past && past.currentDate !== now.currentDate && Math.abs(pct - past.pctChange) >= 0.2) {
    const dir = pct < past.pctChange ? 'bajando' : 'subiendo'
    return `La inflación en EEUU viene ${dir}: +${pct.toFixed(1)}% interanual (era +${past.pctChange.toFixed(1)}% hace 3 meses).`
  }
  return `La inflación en EEUU se mantiene estable en torno a +${pct.toFixed(1)}% interanual.`
}
