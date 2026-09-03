// ── Qué cuenta como fondo de emergencia ─────────────────────────────────────
// sep 2026 (Cas: "no coincide el fondo de emergencia, no veo que crezca y hay
// dap"): la tarjeta EXCLUÍA por completo los depósitos a plazo vigentes. Se
// mostraban en gris al 60% de opacidad pero no sumaban a los meses cubiertos,
// con el razonamiento de que "mezclar plata bloqueada con líquida infla el
// indicador".
//
// Era demasiado estricto: sus dos DAP vencen en 4 y 34 días, y un depósito a
// un mes SÍ es fondo de emergencia — la definición estándar es efectivo y
// cuasi-efectivo (cuentas de ahorro y depósitos de corto plazo). Excluirlos
// mostraba 1,7 meses cubiertos sobre $1,8M cuando en realidad tenía $2,6M
// disponibles dentro del mes.
//
// El corte va en el horizonte, no en "está vencido o no": lo que puedas tener
// en la mano dentro de LIQUID_HORIZON_DAYS cuenta; un DAP a 2 años no.

/** Un depósito más lejano que esto ya no es plata para una emergencia. */
export const LIQUID_HORIZON_DAYS = 90

export interface DepositLike {
  maturity_date: string   // YYYY-MM-DD
}

function daysUntil(dateStr: string, todayStr: string): number {
  const a = new Date(todayStr + 'T12:00:00').getTime()
  const b = new Date(dateStr  + 'T12:00:00').getTime()
  return Math.round((b - a) / 86_400_000)
}

/**
 * ¿Este depósito cuenta como fondo de emergencia hoy?
 *
 * Ya vencido → sí (es rescatable). Vigente → sí solo si vence dentro del
 * horizonte. Se mide en días de calendario: si vence hoy, cuenta.
 */
export function countsAsEmergencyFund(
  d: DepositLike,
  todayStr: string,
  horizonDays = LIQUID_HORIZON_DAYS,
): boolean {
  const days = daysUntil(d.maturity_date, todayStr)
  if (days <= 0) return true          // vencido o vence hoy
  return days <= horizonDays
}

/** Etiqueta corta para la fila: por qué está (o no está) contando. */
export function emergencyFundNote(d: DepositLike, todayStr: string): string {
  const days = daysUntil(d.maturity_date, todayStr)
  if (days < 0)  return 'vencido'
  if (days === 0) return 'vence hoy'
  if (days === 1) return 'vence mañana'
  return `vence en ${days} días`
}
