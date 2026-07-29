// ── E3 (roadmap economía personal, jul 2026): metas de ahorro con nombre y fecha ──
// La aritmética de "¿cuánto tengo que ahorrar al mes para llegar a tiempo?" y
// "¿me alcanza con lo que ahorro hoy?" — determinista, sin dependencias.

export interface SavingsGoal {
  targetAmount:  number
  currentAmount: number
  targetDate:    string | null  // YYYY-MM-DD, null = sin fecha objetivo
}

/** % avanzado hacia la meta, acotado a [0, 100]. */
export function progressPct(goal: SavingsGoal): number {
  if (goal.targetAmount <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100)))
}

export function amountRemaining(goal: SavingsGoal): number {
  return Math.max(0, goal.targetAmount - goal.currentAmount)
}

/**
 * Meses completos entre hoy y la fecha objetivo (redondeado hacia arriba —
 * "faltan 3 meses" cuenta el mes en curso si aún no termina). 0 si la fecha
 * ya pasó o es hoy. null si no hay fecha objetivo.
 */
export function monthsUntil(targetDate: string | null, todayStr: string): number | null {
  if (!targetDate) return null
  const today  = new Date(todayStr + 'T12:00:00')
  const target = new Date(targetDate + 'T12:00:00')
  if (target <= today) return 0
  let months = (target.getFullYear() - today.getFullYear()) * 12 + (target.getMonth() - today.getMonth())
  if (target.getDate() < today.getDate()) months -= 1
  return Math.max(0, months) + 1  // +1: el mes en curso cuenta como un mes de aporte
}

/**
 * Cuota mensual necesaria para llegar a la meta en su fecha objetivo.
 * null si no hay fecha objetivo (nada que prorratear) o si ya se alcanzó.
 * Si la fecha ya pasó y no se alcanzó, devuelve el monto restante completo
 * (no hay meses para prorratear — "hay que ponerlo todo ahora").
 */
export function requiredMonthlyContribution(goal: SavingsGoal, todayStr: string): number | null {
  const remaining = amountRemaining(goal)
  if (remaining === 0) return null
  const months = monthsUntil(goal.targetDate, todayStr)
  if (months === null) return null
  if (months <= 0) return remaining
  return Math.ceil(remaining / months)
}

/**
 * Dado lo que el usuario efectivamente ahorra al mes, ¿el ritmo actual
 * alcanza para llegar a tiempo a la meta? null si no hay fecha objetivo (no
 * hay "a tiempo" que evaluar) o si ya se alcanzó.
 */
export function isOnTrack(goal: SavingsGoal, monthlySavingsRate: number, todayStr: string): boolean | null {
  const required = requiredMonthlyContribution(goal, todayStr)
  if (required === null) return null
  return monthlySavingsRate >= required
}

/**
 * Fecha realista de cierre al ritmo actual (YYYY-MM, primer día del mes en
 * que se alcanzaría) — la alternativa a mostrar cuando el ritmo actual no
 * alcanza para la fecha objetivo. null si el ritmo es 0 o negativo (nunca se
 * alcanza) o si ya se alcanzó.
 */
export function projectedCompletionMonth(goal: SavingsGoal, monthlySavingsRate: number, todayStr: string): string | null {
  const remaining = amountRemaining(goal)
  if (remaining === 0) return null
  if (monthlySavingsRate <= 0) return null
  const monthsNeeded = Math.ceil(remaining / monthlySavingsRate)
  const today = new Date(todayStr + 'T12:00:00')
  let m = today.getMonth() + 1 + monthsNeeded
  let y = today.getFullYear()
  while (m > 12) { m -= 12; y++ }
  return `${y}-${String(m).padStart(2, '0')}`
}
