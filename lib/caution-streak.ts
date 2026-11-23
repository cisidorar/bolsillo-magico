// ── Precaución que se repite sin decir nada nuevo (nov 2026) ─────────────────
// Caso real: INTC pasó 31 días hábiles seguidos con el mismo mensaje en el
// correo ("Débil · consolidando") mientras cayó de ~92 a 51. Un aviso idéntico
// todos los días deja de leerse; lo que sí informa es CUÁNTO lleva avisando y
// qué pasó con el precio desde que empezó. Es solo contexto: no cambia la
// señal ni el rating (no hay evidencia propia de que escalar a "venta" mejore
// nada — ver docs/PLAN_MOTOR_PREDICCION.md).

export interface CautionDay {
  date:  string   // YYYY-MM-DD de un día previo con precaución
  price: number   // precio ese día
}

export interface CautionStreak {
  days:       number   // días seguidos en precaución, contando hoy
  startDate:  string
  startPrice: number
  changePct:  number   // % del precio de hoy vs. el del primer día de la racha
}

/** Máximo de días calendario entre dos días de la racha (cubre fin de semana largo). */
const MAX_GAP_DAYS = 4

function dayDiff(a: string, b: string): number {
  return Math.round((new Date(a + 'T12:00:00').getTime() - new Date(b + 'T12:00:00').getTime()) / 86_400_000)
}

/** Racha de precaución que termina hoy. `prior` = días anteriores (cualquier orden). */
export function cautionStreak(prior: CautionDay[], today: string, currentPrice: number): CautionStreak | null {
  if (!(currentPrice > 0)) return null
  const before = prior.filter(p => p.date < today && p.price > 0).sort((a, b) => b.date.localeCompare(a.date))
  let cursor = today
  let start: CautionDay | null = null
  let count = 1
  for (const p of before) {
    if (dayDiff(cursor, p.date) > MAX_GAP_DAYS) break
    if (p.date === cursor) continue   // duplicado del mismo día
    cursor = p.date
    start = p
    count++
  }
  if (!start) return null
  return {
    days: count,
    startDate: start.date,
    startPrice: start.price,
    changePct: Math.round(((currentPrice / start.price) - 1) * 1000) / 10,
  }
}

/** Frase para sumar al mensaje cuando la racha ya es larga; null si no aplica. */
export function cautionNote(streak: CautionStreak | null, minDays = 10): string | null {
  if (!streak || streak.days < minDays) return null
  const sign = streak.changePct > 0 ? '+' : ''
  return `Lleva ${streak.days} días seguidos en precaución; el precio está ${sign}${streak.changePct.toLocaleString('es-CL')}% desde que empezó.`
}
