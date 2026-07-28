import { computeYoyChange, type Observation } from '@/lib/yoy-change'

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
 */
export const FOMC_DECISION_DATES_2026: string[] = [
  '2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17',
  '2026-07-29', '2026-09-16', '2026-10-28', '2026-12-09',
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
 */
export function fedRateSentence(observations: Observation[]): string | null {
  if (observations.length === 0) return null
  const sorted = [...observations].sort((a, b) => a.date.localeCompare(b.date))
  const last  = sorted[sorted.length - 1].value
  const first = sorted[0].value
  const changedRecently = Math.abs(last - first) > 0.05
  return changedRecently
    ? `La Fed movió la tasa a ${last.toFixed(2)}% en el último mes — cambio reciente, vale la pena estar atenta a cómo reacciona el mercado.`
    : `La Fed mantiene la tasa en ${last.toFixed(2)}% — estable en el último mes, sin presión nueva sobre las acciones.`
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
